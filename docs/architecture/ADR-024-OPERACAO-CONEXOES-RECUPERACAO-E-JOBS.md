# ADR-024 — Orçamento de conexões, recuperação, fechamento do cliente e agenda dos jobs

- **Estado:** aceita em 17/10/2026 pelo João, com o aval das recomendações do
  `PR26_PROMPT_CORRECOES_REVISAO_2.md` (não versionado). Revê a proposta de 15/10/2026 depois da
  segunda revisão independente da PR #26 (TF-REV-005, TF-REV-006 e a decisão 2 do parecer). A
  homologação em ARM64, HeatWave e TLS é etapa à parte, com autorização própria (D10).
- **Data:** 15/10/2026 (proposta); 17/10/2026 (revisão e aceite)
- **Responsáveis:** João Vitor S. Hernandes
- **Relação:** revê a operação do [ADR-019](ADR-019-ESPERA-DE-TRAVA.md) e do
  [ADR-020](ADR-020-PRAZO-DAS-TRANSACOES.md), complementa o
  [ADR-017](ADR-017-GITHUB-ASYNC-SYNC.md) (worker) e o agendamento do
  [ADR-016](ADR-016-TASK-NOTIFICATIONS.md) D6 e do [ADR-018](ADR-018-GITHUB-EVENT-NOTIFICATIONS.md) D9

## Contexto

A PR #26 trouxe uma guarda global das transações interativas (ADR-019 e ADR-020) e um cliente Prisma
de recuperação. A segunda revisão manteve três pendências:

| Pendência | Achado |
| --- | --- |
| O cliente auxiliar amplia o pool potencial; o `KILL` pendente não tem prazo global; a saúde degradada não reinicia o processo pelo systemd | decisão 2 do parecer |
| O fechamento de imports do `prismaClient.js` não cabe no pacote de diagnóstico OCI | TF-REV-005 |
| Os jobs não rodam periodicamente na instalação planejada, e os comandos manuais não estão no artefato | TF-REV-006 |

Situação no head `08682e9`:
- **Cliente de recuperação:** um `PrismaClient` com o pool padrão por processo.
- **Watchdog:** repete o `KILL QUERY` a cada 100 ms e espera todos os `KILL` sem limite.
- **Pânico do motor:** só muda `/health/live` e `/health/ready`, e o processo continua de pé.
- **Worker:** só desconecta o cliente principal e sai quando o agendador do GitHub está desligado.
- **Fechamento do `prismaClient.js`:** 14 arquivos. O logger importa `config/env.js`, que valida a
  configuração inteira na importação.
- **Jobs:** são scripts em `backend/scripts`, sem agenda.

O que a branch OCI espera (`origin/daniel-dev` em `ecb3f34`, lida em 17/10/2026):
- **Diagnóstico** (`deploy/lib/diagnostic_contract.py`): `SOURCES` tem, de `backend/src`, só
  `database/prismaClient.js` e `database/database-safety.js`, além de helpers administrativos em
  `backend/scripts/lib`. As dependências são `@prisma/client`, `.prisma/client` e `dotenv`.
- **Release** (`scripts/package_release.py`): `ALLOW` exporta `backend/src/`, `backend/prisma/`,
  `frontend/src/` e `frontend/public/`; `FILES` inclui `backend/package.json`. `backend/scripts/`
  fica de fora.
- **Serviços:** API e worker com `Restart=on-failure`, `RestartSec=10s`, no máximo 3 partidas em
  300 s; `TimeoutStopSec` de 45 s na API e 90 s no worker.
- **Ciclo de vida:** o `server.js` da OCI tem `createLifecycle`, drenagem, espera do trabalho em
  segundo plano e `SHUTDOWN_TIMEOUT_MS`. O `github-worker.js` chama `assertWorkerEnvironment`.
- **Migrations:** a cadeia inicial exigida é de 68 (`INITIAL_MIGRATION_COUNT`). A composição com a
  PR #26 tem 77 antes desta rodada; a migration exclusiva da OCI é
  `20261014090000_resumable_evidence_uploads`.

## Decisão

1. **Manter a guarda na PR #26 (D1).** Tirá-la devolve os defeitos que ela corrige: S202-F29,
   S202-F33 e S203-A01.
2. **Orçamento de conexões (D2).**
   - `DATABASE_POOL_LIMIT` define o `connection_limit` do cliente da aplicação em cada processo.
   - O cliente de recuperação tem uma conexão (D3).

   | Processo | Aplicação | Recuperação |
   | --- | --- | --- |
   | API | 5 | 1 |
   | Worker (inclui os jobs, D7) | 3 | 1 |
   | Comando manual, um por vez | 2 | 1 |
   | Diagnóstico | 1 | — |
   | Reserva para operação | 5 | — |
   | **Total** | **16** | **3** |

   O total, 19 conexões, tem de caber no `max_connections` do shape, conferido na homologação.
3. **Cliente de recuperação (D3).**
   - A URL ganha `connection_limit=1&pool_timeout=2`.
   - O cliente é criado só quando preciso.
   - É desconectado no encerramento da API, do worker e dos comandos.
4. **Espera dos `KILL` limitada (D4).** O watchdog espera os `KILL` já enviados por no máximo 2 s.
   Sem confirmação, a conexão da transação é tratada como envenenada (D5).
5. **Saída controlada (D5).** O pânico do motor e a conexão envenenada marcam o motor como
   indisponível e avisam o processo:
   - **API:** para de aceitar requisições, drena pelo prazo de encerramento, desconecta os dois
     clientes e sai com código 1;
   - **worker:** para a sincronização e os jobs, solta as leases, desconecta e sai com código 1.

   O `Restart=on-failure` reinicia o serviço. Depois de 3 partidas em 300 s, o serviço fica parado e
   exige intervenção (runbook). O ciclo de vida da OCI substitui o encerramento atual quando as
   branches forem compostas.
6. **Fechamento do cliente sem a configuração completa (D6).**
   - **Mudança.** O logger lê `process.env.NODE_ENV`, com o mesmo padrão `development`, em vez de
     importar o `env.js`. A validação do `NODE_ENV` continua no `env.js`, que a API, o worker e os
     comandos carregam.
   - **Fechamento resultante**, com 8 arquivos:
     - `src/database/prismaClient.js`;
     - `src/database/database-safety.js`;
     - `src/database/transaction-guard.js`;
     - `src/database/lock-wait.js`;
     - `src/database/recovery-prisma.js`;
     - `src/shared/logger/index.js`;
     - `src/shared/logger/logger.js`;
     - `src/shared/logger/redaction.js`.
   - **Teste.** Um teste percorre os imports estáticos e trava a lista. Outro copia só esses
     arquivos e importa o cliente.
   - **Para a branch OCI.** O `SOURCES` do diagnóstico ganha os 6 arquivos novos, com o manifesto
     regenerado, dois builds idênticos, a verificação depois da extração e o smoke ARM64. Isso cabe ao
     dono da branch OCI, e o TF-REV-005 só fecha com esse artefato.
7. **Agenda dos jobs no worker (D7).**

   | Tarefa | Intervalo | Limite por execução |
   | --- | --- | --- |
   | vencimento do RF59 | 15 min | lotes atômicos do ADR-016 D6; 5 min no máximo |
   | retomada do despacho dos eventos do GitHub | 5 min | o do despacho atual |
   | retomada dos avisos de inconsistência | 5 min | o do despacho atual |
   | reconciliação atrasada dos alertas (RF13, RF39, RF40): só os projetos cuja última reconciliação falhou depois do último sucesso | 60 min | os projetos atrasados, um por vez |

   - **Exclusão.** Uma lease por tarefa em `ScheduledJobLease` (nome, dono e validade de 2 min),
     renovada a cada 30 s durante a execução e liberada em `finally`. Lease vencida pode ser
     assumida.
   - **Por que não `GET_LOCK`.** A trava pertence à sessão; o pool do Prisma troca de conexão, e
     `COMMIT` e `ROLLBACK` não liberam a trava.
   - **Falhas.** A falha de uma tarefa é registrada e não derruba as outras nem a sincronização. A
     próxima execução retoma; os despachos mantêm as esperas e o limite de tentativas.
   - **Drenagem.** No `stop()`, nenhuma execução nova começa. A execução em curso recebe um
     `AbortSignal` no prazo de drenagem (60 s no worker) e para entre lotes; a lease é liberada.
   - **Ligar e desligar.** O worker roda os jobs com `JOBS_ENABLED` (padrão ligado), mesmo com o
     agendador do GitHub desligado.
   - **Artefato.** O código fica em `backend/src/jobs`, que o artefato de runtime já exporta.
8. **Comandos manuais (D8).** Saem de `backend/scripts` para `backend/src/jobs/cli`, dentro do
   artefato. Os nomes no `package.json`, as opções e a proteção de banco não mudam:

   | Comando | Arquivo |
   | --- | --- |
   | `notifications:due` (dry-run) e `notifications:due --apply` | `src/jobs/cli/notify-overdue-tasks.js` |
   | `notifications:github-events`, com `--retry-failed` | `src/jobs/cli/dispatch-github-event-notifications.js` |
   | `traceability:alerts` | `src/jobs/cli/reconcile-traceability-alerts.js` |
   | `notifications:metrics` | `src/jobs/cli/notification-metrics.js` |

   Cada comando desconecta os dois clientes ao terminar.
9. **Pausa coordenada (D9).** Backup, migration e rollback param o worker, e com ele os jobs, antes
   de começar. A API pode continuar no backup; na migration e no rollback, segue o runbook de
   migrations. Os runbooks da OCI recebem a mesma regra como proposta.
10. **Homologação (D10), em etapa à parte:**
    - `KILL QUERY` entre conexões do mesmo usuário no HeatWave;
    - latência e prazo das transações;
    - corte de rede e saturação do pool;
    - a saída controlada com o `Restart=on-failure`;
    - cadeia composta de migrations em banco vazio, antes da primeira inicialização;
    - TLS `VERIFY_IDENTITY` com a CA própria e contas restritas.

## Alternativas consideradas

- **Tirar a guarda da PR #26.** Rejeitada: os três defeitos voltam.
- **Timers do systemd para cada job.** Isolam falhas, mas exigem um processo e um pool por execução,
  unidades novas e receitas de pausa na branch OCI.
- **`GET_LOCK` para a exclusão.** Rejeitada: a trava é da sessão, e o pool troca de conexão.
- **Cliente diagnóstico mínimo, sem a guarda.** Rejeitada: o diagnóstico deixaria de importar o
  cliente que a aplicação usa.
- **Reiniciar por verificação externa da saúde.** Rejeitada: exige um agente a mais, e o `Restart`
  do systemd só age quando o processo termina.
- **Ampliar privilégios (`PROCESS`, `SUPER` ou `CONNECTION_ADMIN`).** Rejeitada: o `KILL` age só
  sobre conexões do mesmo usuário.

## Consequências positivas

- O pool potencial fica limitado e declarado.
- O processo com o motor em pânico ou com a conexão envenenada volta sozinho.
- O diagnóstico importa o cliente sem a configuração da aplicação, depois da mudança na branch OCI.
- O RF59 e as retomadas rodam sem agendador externo e sem mudar a receita de runtime.
- Os comandos manuais chegam ao artefato final.

## Consequências negativas

- **Código do Daniel.** O worker, o logger e a ligação do encerramento mudam.
- **Conflitos.** O `server.js` e o `github-worker.js` mudaram também na branch OCI, e a composição
  precisa preservar os dois lados.
- **Saída controlada.** Derruba as requisições em andamento depois da drenagem. O limite de 3
  partidas em 300 s pode exigir intervenção.
- **Capacidade compartilhada.** Os jobs dividem o pool do worker com a sincronização.
- **Branch OCI.** Ainda precisa mudar o `SOURCES` do diagnóstico e a contagem inicial de migrations.

## Impactos de segurança e privacidade

- Não amplia privilégio do banco.
- Os logs das tarefas periódicas seguem o padrão dos jobs: contagens e códigos, sem dado pessoal.
- Os comandos manuais mantêm o dry-run por padrão e o `--confirm-production`.

## Resposta à segunda revisão

| Ponto do parecer | Resposta |
| --- | --- |
| O cliente auxiliar amplia o pool potencial | uma conexão de recuperação por processo e `DATABASE_POOL_LIMIT` (D2, D3) |
| O `KILL` pendente não tem prazo global | espera limitada a 2 s e conexão envenenada (D4) |
| A saúde degradada não reinicia o processo | saída controlada com código 1 (D5) |
| Não ampliar privilégios | o `KILL` continua só sobre o mesmo usuário |
| TF-REV-005 | fechamento em 8 arquivos e proposta de `SOURCES` para a OCI (D6) |
| TF-REV-006 e decisão 4 | jobs no worker, com lease, limites, retomada e drenagem; comandos no artefato (D7, D8) |
| `GET_LOCK` precisa da mesma sessão | lease em tabela, sem `GET_LOCK` (D7) |
| Pausa para migrations, backup e rollback | D9 |
| Homologação | etapa à parte (D10) |
