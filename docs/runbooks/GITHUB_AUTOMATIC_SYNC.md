# Sincronização periódica GitHub — GITHUB-04

## Decisão e responsabilidades

Requisito autorizado GITHUB-04: scheduler backend independente, agenda UTC persistida,
intervalo-base de 30 minutos, distribuição estável e uma execução por projeto, qualquer origem.
O worker reutiliza `GitHubSyncRun` e a mesma pipeline de branches/commits/PRs/issues.

`activeProjectId` continua a única reserva por projeto. Slots automáticos numerados e únicos
no mesmo run limitam a concorrência entre processos; uma instalação tem no máximo um run
automático reservado. Não há fila em memória como autoridade. Run expirado termina FAILED;
seu ID nunca volta a RUNNING. Todas as escritas da pipeline verificam o ID ativo dentro da
transação, sob o lock de Project compartilhado com exclusão lógica. A recuperação usa a
mesma ordem de locks, impedindo que um worker antigo grave depois da reserva nova.

Migration incremental: nextSyncAt e consecutiveSyncFailures na integração, origin,
automaticSlot e automaticInstallationId no run; requestedByUserId nullable para execução
sem ator humano; syncNotBefore na instalação para cooldown compartilhado. Os timestamps
existentes de tentativa/sucesso e heartbeat são reutilizados. Nenhum status administrativo
de Project ou artefato é alterado. Aplicar e validar somente em TEST_DATABASE_URL nesta entrega.

A preferência continua OWNER-only; sync manual MANAGER+; leitura por membership ativa.
O worker não representa um usuário: executa a preferência previamente autorizada, com App
configurada, Project não excluído e integração/instalação ACTIVE. INATIVO/ARQUIVADO mantêm a
semântica administrativa vigente. Desabilitar cancela a agenda futura, sem cancelar um run ativo.

O publisher SSE atual é local ao processo; um worker independente não alcançaria as conexões
da API. A UI reutiliza polling do status persistido, com frequência menor quando ociosa e
pausa quando a aba fica oculta. Não é introduzido outro transporte de eventos.

Evidências e limites: [relatório GITHUB-04](../deliveries/GITHUB_04_INTEGRATION_UX_AUTOMATIC_SYNC_SCHEDULER_REPORT.md).

## Agenda e capacidade

- Primeira ativação, backfill e recuperação de agenda atrasada: hash SHA-256 de projectId,
  fase estável distribuída na janela UTC do intervalo. Instantes são persistidos; cada tick
  consulta a agenda, sem sortear novamente. Atraso maior que dois ticks redistribui a próxima
  execução; não reproduz todos os ciclos perdidos.
- Conclusão: intervalo-base mais jitter estável de 0 a 20% (padrão: 30 a menos de 36 min).
  Falhas aplicam base × 2^falhas, limitada a 6h, mais jitter. Sucesso zera o contador.
  Retry-After/reset do provedor prevalece mesmo quando ultrapassa o teto do backoff local.
- Duas reservas automáticas simultâneas por padrão, incluindo QUEUED. A unique de automaticSlot
  arbitra processos. automaticInstallationId unique evita paralelismo automático na mesma App
  installation. MANUAL continua usando a mesma reserva por Project e não consome slot automático.
- Colisão de slot/transação não confirma nenhum run parcial: o próximo tick reavalia candidatos
  por horário/ID. Falhas saem da disputa até o backoff; não existe backlog de tentativas por ciclo.
- Integração sem relação, desabilitada, RECONNECT_REQUIRED/DISCONNECTED, instalação não ACTIVE,
  Project excluído/em purge ou App sem configuração não inicia. Exclusão lógica termina/fenceia
  o run e libera os slots na mesma transação; restore reinicializa a agenda distribuída.
- Um run QUEUED abandonado é reivindicado por um worker; RUNNING só é encerrado quando heartbeat
  expira. Heartbeat ocorre em até 30s ou lease/3. Run terminal nunca é reativado: run.id é o fence.
  Operações GitHub em voo podem terminar após perda da lease, mas não podem confirmar escritas.
- Uma falha ao persistir agenda/terminal mantém a reserva pela transação; erro é registrado e
  recuperação por lease permite retomar sem executar duas autoridades de escrita.

## Configuração e execução

**O servidor HTTP não inicia o worker.** São processos separados. Definir a variável no `.env`
sem executar o comando abaixo deixa a agenda persistida sem executor. A API registra
`github_worker_startup_required` no startup para explicitar essa dependência.

| Variável | Padrão | Uso |
| --- | --- | --- |
| GITHUB_SCHEDULER_ENABLED | false | Habilita o processo periódico; não inicia pelo servidor HTTP |
| GITHUB_SYNC_INTERVAL_MS | 1800000 | Base; mínimo 60000, máximo 86400000 |
| GITHUB_SCHEDULER_TICK_MS | 15000 | Consulta; 1000 a 60000 |
| GITHUB_AUTOMATIC_CONCURRENCY | 2 | Slots globais automáticos; 1 a 20 |
| GITHUB_SYNC_LEASE_MS | 1800000 | Expiração; 60000 a 86400000; API e workers devem concordar |
| GITHUB_SYNC_BACKOFF_MAX_MS | 21600000 | Teto exponencial, nunca inferior à base efetiva |

Com Node 22, migrations aplicadas e a mesma configuração de banco/App/policy da API:

```bash
cd backend
GITHUB_SCHEDULER_ENABLED=true npm run github:worker
```

Use as variáveis já canônicas da GitHub App, nunca PAT. Nenhum token é persistido. O processo
não exige login nem sessão. A API mantém disparo manual imediato no processo HTTP; o worker
independente também recupera runs QUEUED persistidos por uma API interrompida.

Mantenha o processo aberto em desenvolvimento. Habilitado: espere `github_scheduler_started`;
desabilitado: `github_scheduler_disabled` explica a configuração e o processo termina.
Sem App configurada: `github_scheduler_unavailable`; erro no tick: `github_scheduler_operation_failed`.
Exceções não capturadas terminam o processo pelo comportamento padrão do Node; recuperação
posterior usa a lease, e operação supervisionada deve reiniciar o processo. Nenhum processo é
iniciado automaticamente no banco de desenvolvimento por testes ou scripts de validação.

SIGTERM/SIGINT bloqueia novos claims locais, cancela o tick e aguarda os jobs já iniciados antes
de desconectar Prisma. Uma segunda chamada de shutdown não duplica trabalho. Se o supervisor
precisar encerrar à força, a lease persistida e o fencing fazem a recuperação posterior.
Não remova/edite activeProjectId ou os slots manualmente.

Todas as instâncias devem compartilhar os valores de policy e um relógio UTC sincronizado.
Para mudar concorrência/lease: drene os workers, atualize a configuração comum, reinicie. A
unique limita slots entre processos com essa policy; configuração divergente entre réplicas
não é suportada. O worker precisa do mesmo schema e da migration GITHUB-04 da API.

Para OCI futura: um serviço/processo independente para o worker, reinício por supervisor,
segredos pelo mecanismo operacional, NTP, logs estruturados e pool de conexões compatível.
Não há dependência de cron do navegador, Redis, broker ou pacote adicional. Ainda são necessários
validação operacional de capacidade, store distribuído do rate limiter HTTP e homologação real
GitHub/App/infraestrutura. Nenhum deploy foi realizado nesta entrega.

## Diagnóstico e recuperação

GITHUB-04.1 adiciona somente liveness efêmera em `GitHubSchedulerWorker` (UUID do processo e
heartbeat UTC). Não é fila, lock, monitoramento histórico ou segunda autoridade de execução.
O worker verifica a tabela antes de reservar jobs e publica heartbeat após cada tick bem-sucedido
com App configurada. O status considera recente até `max(60s, 3 × tick)`. Shutdown remove somente
a própria entrada; outra réplica continua disponível. Crash perde disponibilidade após essa janela;
entradas com mais de um dia são removidas pelo worker, sem tocar em histórico de sync.

`GET .../github/sync/status` mantém `run` e acrescenta `automation`: status AVAILABLE/UNAVAILABLE,
reason, lastHeartbeatAt, checkedAt e nextSyncAt. Não expõe IDs de workers nem credenciais.
Sem tabela durante upgrade: SCHEMA_NOT_READY; sem heartbeat recente: WORKER_NOT_OBSERVED.
Agenda não é garantia de execução pontual: concorrência, cooldown e recuperação podem adiá-la.
A UI acompanha esse estado pelo polling existente; indisponibilidade não desliga a preferência
nem bloqueia a sincronização manual. API/workers devem compartilhar a mesma configuração.

Migration incremental: `20261011010000_github_scheduler_liveness`. Nesta entrega foi aplicada
somente em schemas de teste. Validação: `npm run db:test:validate-github-sync -- --liveness`
(upgrade com histórico e reaplicação), além de `db:test:validate-empty`. Não foi aplicada no banco
de desenvolvimento. Para implantação autorizada, aplique migrations antes de iniciar o worker.

Consulte o status autorizado por `GET /api/projects/:id/github/sync/status` e `githubIntegration`
no detalhe do projeto. No banco operacional, consultas somente leitura de `GitHubSyncRun`
(status/origin/step/heartbeatAt/errorCode), agenda da integração e cooldown da instalação bastam;
não consulte chaves/tokens. Logs correlacionam projectId/runId e os eventos:
`github_sync_eligible`, `github_sync_postponed`, `github_sync_claimed`, `github_sync_run_started`,
`github_sync_run_completed`, `github_sync_run_failed`, `github_sync_skipped_running`,
`github_sync_delayed_rate_limit`, `github_sync_recovered`, `github_sync_heartbeat_failed` e
`github_scheduler_operation_failed` e `github_scheduler_stopped`. Ticks vazios não produzem logs.
Adiamentos incluem reason (INITIAL_SCHEDULE, OVERDUE_RESTART_JITTER, INSTALLATION_COOLDOWN,
GLOBAL_CAPACITY, INSTALLATION_BUSY ou colisão), horário anterior/novo quando aplicável. A mesma
decisão repetida não é registrada a cada tick. Logs de conclusão incluem runId e duração.

A política manual permanece: ao reservar, nextSyncAt é limpo; ao concluir, a próxima automática
é recalculada a partir do término, com base + jitter/backoff. Ela substitui o horário anterior
porque o projeto acabou de ser atualizado. Restart preserva agenda futura; agenda atrasada mais
de dois ticks é redistribuída uma vez, com motivo e horários registrados, sem reproduzir backlog.
Instantes são Date/UTC na persistência e na comparação; a UI formata no fuso do navegador.
01:49 America/Sao_Paulo em 11/10/2026 corresponde a 04:49Z. Não se compara string de data local.

- Rate limit: aguarde syncNotBefore/nextSyncAt. Retry-After não é encurtado para caber no tempo
  de espera em memória; o worker persiste o adiamento. Outros projetos da mesma instalação
  respeitam o cooldown. A política segue as [orientações oficiais do GitHub](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api#handle-rate-limit-errors-appropriately).
- 5xx/timeout: conferir último sucesso preservado e próxima tentativa com backoff. Falha não
  remove commits, PRs, issues, branches ou vínculos.
- 401/403 sem rate limit ou 404 do provedor: RECONNECT_REQUIRED; OWNER revalida o mesmo repo
  pelo fluxo vigente. Configuração global indisponível não cria ciclos agressivos.
- Crash: reinicie o serviço. QUEUED é recuperado e RUNNING stale termina FAILED antes de nova
  reserva. Não faça cleanup/seed/reset ou apague artefatos para recuperar sync.
- Agendamento ausente: confira preferência, lifecycle, App/installation e processo habilitado;
  a UI mostra indisponibilidade enquanto não houver instante persistido.

## Interface

Overview é consulta sem CTA de conexão. Edição agrupa Repositório, Sincronização e Automação;
Switch shared usa os tokens e estados C2. O HEAD auditado não continha switch canônico nas
Configurações do Usuário: a primitive foi adicionada sem nova linguagem visual.
GitHubSyncProgress extrai o progresso já usado no Overview e é compartilhado com a edição.
Polling REST: 2,5s ativo / 15s ocioso, somente enquanto a aba está visível. Um job que começa
externamente aparece na próxima consulta; refresh recupera o run persistido. Execuções curtas
concluídas entre consultas também reconciliam metadata. Origem é textual e não há percentual
inventado. O backend continua a impedir duplicação durante a janela entre consultas.
