# ADR-017 — Processamento assíncrono e sincronização automática do GitHub

- **Status:** aceito para a implementação local da PR #24; implantação e prazo de retenção dependem das decisões abaixo.
- **Data:** 11/10/2026.
- **Responsáveis:** equipe TraceFlow; decisão técnica solicitada em PR24-FIX-02.

## Contexto

RF02 integra o repositório; RF21 atualiza os artefatos usados por RF06 e pela rastreabilidade.
A preferência OWNER de sincronização automática precisa funcionar sem navegador aberto ou sessão
humana. Importações paginadas podem ser longas, sofrer rate limit ou terminar parcialmente.
Reinícios, múltiplas réplicas e sync manual não podem criar duas autoridades de escrita nem apagar
histórico. A implementação GITHUB-04/04.1 já existe; este ADR formaliza sua arquitetura e os
limites confirmados em PR24-FIX-02.

## Alternativas consideradas

| Alternativa | Vantagens | Desvantagens relevantes |
| --- | --- | --- |
| `setInterval` na API | Um processo, configuração inicial simples | Acopla disponibilidade/carga à API; timers isolados não coordenam réplicas nem sobrevivem ao restart |
| Worker separado com agenda persistida | Reutiliza MySQL e pipeline; coordenação transacional e recuperação | Processo adicional, disputa de conexões/locks, manutenção do histórico |
| Cron por projeto | Agendamento externo conhecido | Cadastro/remoção/configuração dinâmica duplicados; ainda exige exclusão mútua, leases e recuperação |
| Fila externa com workers | Controle operacional de entrega e escala | Novo serviço, credenciais e operação; sem volume demonstrado que justifique esse custo agora |

## Decisão

Executar `github:worker` como processo independente da API. MySQL é a autoridade:
`ProjectGitHubIntegration.nextSyncAt` guarda a agenda UTC; `GitHubSyncRun` guarda execução,
progresso, resultado e reservas. API e worker usam services/repositories existentes; chamadas
GitHub ficam fora das transações. A API ainda inicia sync manual por `setImmediate`, sobre o
mesmo run persistido; o worker recupera QUEUED abandonados. Não há fila volátil como autoridade.

- Intervalo-base padrão de 30 minutos, com fase determinística por projeto para início/recuperação
  e jitter de até 20% após conclusão. Reinício não reproduz cada ciclo perdido.
- Corte de recuperação fixado no startup sem executor recente; uma réplica que encontra heartbeat
  recente não redistribui agendas. Espera por capacidade conserva a data devida. Cursor por valores
  percorre até 10 páginas de 100 candidatos por tick e continua no tick seguinte.
- `activeProjectId` único coordena MANUAL e AUTOMATIC. `automaticSlot` único limita automáticas
  globalmente (padrão 2); `automaticInstallationId` único permite uma automática por instalação.
  Execuções manuais não consomem esses slots; continuam exclusivas por projeto.
- Lease padrão de 30 minutos, heartbeat em até 30 segundos ou lease/3. Run expirado termina FAILED;
  seu ID nunca volta a RUNNING. Cada transação da pipeline confirma lifecycle e lease sob a ordem
  `Project → GitHubSyncRun`. O ID do run é o fence: resposta GitHub tardia não pode escrever após
  perda da autoridade. Exclusão lógica participa do mesmo lock e encerra a reserva.
- Coordenação GitHub usa `FOR UPDATE NOWAIT`: candidato ocupado é adiado; claim/recovery voltam
  no próximo ciclo. Heartbeat/progresso retorna resultado adiado distinto de lease perdida e não
  inventa renovação. A próxima escrita ainda valida a lease real. A requisição manual tenta no
  máximo três transações novas, com 50 ms fora da transação entre elas, para preservar coalescing.
  Contenção persistente responde 503; não há retry ilimitado nem aumento global de timeout.
  Escritas da pipeline protegidas pelo contexto de fencing também adotam NOWAIT no Project.
  Falha em finalizar preserva a reserva transacional até nova conclusão ou recuperação da lease.
- Backoff exponencial até o teto configurado (6h por padrão), mais jitter; `Retry-After`/reset do
  provedor prevalece. `syncNotBefore` compartilha cooldown por instalação. Um pedido manual durante
  cooldown responde 429 com `Retry-After` calculado desse instante pela camada HTTP.
- 401/403 sem rate limit/404 externos confirmados tornam a integração RECONNECT_REQUIRED e retiram
  a agenda; preservam preferência, último sucesso e artefatos. OWNER reconecta o mesmo repositório.
  429/limite secundário/5xx/timeout são transitórios. Nunca persistir texto bruto do provedor.
- `GitHubSchedulerWorker` contém somente liveness efêmera. Status AVAILABLE exige heartbeat recente
  em `max(60s, 3 × tick)`; ausência usa WORKER_NOT_OBSERVED, schema ausente usa SCHEMA_NOT_READY.
  Polling REST existente atende processos separados; SSE local não é usado como broker.

## Consequências positivas

Execução independente da interface, carga distribuída, estado consultável após reload, coordenação
entre processos e recuperação sem remover artefatos. Logs correlacionam projeto/run e motivos de
adiamento. Uma disputa de Project pode ser adiada sem bloquear candidatos livres.

## Consequências negativas e limites

É necessário supervisionar mais um processo, dimensionar pools, aplicar migrations e manter
relógios coerentes. Execuções concluídas acumulam histórico operacional. A ausência do worker não
desliga a preferência e precisa de alerta operacional. NOWAIT trata disputas de linhas consultadas;
não elimina contenção transversal em todas as tabelas, locks de metadata/DDL, indisponibilidade do
banco ou saturação de pool. Essas condições exigem monitoramento e avaliação de capacidade.
Esta entrega não altera todos os escritores do produto nem declara o risco transversal encerrado.

## Impactos de segurança e privacidade

OWNER controla vínculo/configuração; MANAGER+ inicia sync manual; membership autoriza leitura.
Sessão, e-mail verificado, CSRF e 404 opaco permanecem. O worker executa uma preferência previamente
autorizada, somente com projeto elegível, App configurada e integração/instalação ACTIVE; não
impersona um usuário. Tokens da GitHub App são efêmeros no backend, sem persistência ou logs.

AUTOMATIC tem `requestedByUserId = null`; auditoria aceita ator nulo. MANUAL referencia o User.
Anonimização segue ADR-010: preserva ID pseudonimizado e histórico, remove credenciais/consentimento
pessoal, sem apagar integrações compartilhadas. A FK explicita SET NULL/CASCADE para preservar
runs se ocorrer remoção física de usuário; isso não cria um fluxo de hard delete de conta.

Retenção específica de SyncRun: **DECISION REQUIRED (D-A)**. As propostas de 90 dias para sucesso
automático e 180 para manual/falha não são prazos aprovados. Nenhuma exclusão automática é criada.
Política, dependências e critérios do backlog estão em
[DATA_RETENTION_POLICY](../privacy/DATA_RETENTION_POLICY.md#github-syncrun--pr24-fix-02).

## Implantação e operação

A implantação pretendida é OCI. O histórico `fe05208ae85b` (04/08/2026) substituiu referências
Azure no roadmap; não se reescreve aquela decisão nem se afirma que um deploy aconteceu.
S2-08 confirma topologia/capacidade; S2-09 deve instalar API e worker como serviços supervisionados,
com reinício automático e migrations anteriores ao startup; S2-10 deve configurar logs, alertas e
continuidade. É obrigatório verificar heartbeat e alertar WORKER_NOT_OBSERVED; observar somente
`autoSyncEnabled` ou `nextSyncAt` não comprova executor ativo.

API e réplicas precisam compartilhar banco/App/policy, NTP/UTC, lease e limites. Alterar policy exige
drenagem coordenada. SIGTERM/SIGINT interrompe novos claims, espera o tick e jobs, remove somente o
próprio heartbeat e desconecta Prisma. Encerramento forçado depende de lease/fencing na retomada.
O runbook detalha startup, diagnóstico e shutdown; nenhuma infraestrutura foi provisionada aqui.

## Evidências e referências

- [Runbook automático](../runbooks/GITHUB_AUTOMATIC_SYNC.md), [contratos](../api/API_CONTRACTS.md),
  [autorização](../security/AUTHORIZATION_MATRIX.md), [inventário pessoal](../privacy/PERSONAL_DATA_INVENTORY.md).
- [PR24-FIX-02](../deliveries/PR24_FIX_02_FINAL_ARCHITECTURE_DATABASE_REVIEW_CLOSURE_REPORT.md):
  drift da cadeia SQL, upgrade com histórico e testes reais de contenção em MySQL isolado.
- [MySQL: locking reads/NOWAIT](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html).
- ADR-017 livre em `daniel-dev@ae9a265` e `origin/joao-dev-v2@14e00be5`; esta última utiliza
  ADR-015/016. A próxima integração deve reconferir IDs e preservar os campos de ambas as branches.

## Emenda de 15/10/2026 — falha gravada pela conexão de recuperação (TF-REV-003)

### Contexto

A gravação da falha da execução tem até três tentativas (S203-A01, ADR-018 D1):
- a primeira usa o `fail` normal;
- as duas seguintes, depois de erro de conexão, usavam um `update` por `id` no cliente de
  recuperação (ADR-020).

Esse `update` não conferia a lease nem o estado e não reagendava. O `retryAt` e a falha permanente se
perdiam, e o `nextSyncAt` ficava nulo, o que a agenda trata como vencido. Uma execução que já tinha
terminado podia ser regravada como `FAILED`. A revisão independente da PR #26 apontou isso
(TF-REV-003).

### Decisão

A gravação pela conexão de recuperação segue as mesmas invariantes do `fail`, numa transação curta
do cliente de recuperação, com espera de trava de no máximo 2 s:
1. trava do projeto ativo com `NOWAIT`;
2. trava da execução com `NOWAIT`;
3. conferência da lease (`RUNNING`, dona do projeto, heartbeat dentro da lease);
4. reagendamento:
   - falhas consecutivas;
   - cooldown da instalação pelo `retryAt`;
   - `RECONNECT_REQUIRED` na falha permanente;
   - `nextSyncAt` com recuo;
5. atualização da execução.

Exceções:
- Lease perdida, execução terminal ou projeto inativo não gravam nada.
- Projeto ou execução ocupados contam como tentativa. Esgotadas as tentativas, o log
  `github_sync_run_failure_unrecorded` registra o caso, e a expiração pela lease fecha a execução.

### Consequências

- Um escritor atrasado não sobrescreve execução terminal.
- O projeto não volta à agenda sem recuo nem cooldown depois de uma falha gravada pela recuperação.
- A gravação pela recuperação custa uma transação curta, no lugar de uma instrução.

