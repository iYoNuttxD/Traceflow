# Runbook — jobs agendados no worker

Decisão em [ADR-024](../architecture/ADR-024-OPERACAO-CONEXOES-RECUPERACAO-E-JOBS.md) (D2, D3, D5,
D7, D8 e D9). Desde 17/10/2026, o processo do worker (`backend/src/github-worker.js`, serviço
`traceflow-github-worker`) roda a sincronização automática do GitHub e os jobs abaixo.

## Agenda

| Job | Nome da lease | Intervalo | O que faz | Regra |
| --- | --- | --- | --- | --- |
| Vencimento | `notifications-due` | 15 min | varredura do RF59 | [Task Notifications](../data/TASK_NOTIFICATIONS.md) |
| Despacho do GitHub | `github-event-dispatch` | 5 min | retomada da fila do RF60/RF61 | [GitHub Event Notifications](../data/GITHUB_EVENT_NOTIFICATIONS.md) |
| Avisos de inconsistência | `traceability-notice-dispatch` | 5 min | retomada dos avisos do ADR-022 | ADR-022 D7 |
| Reconciliação atrasada | `traceability-alerts` | 60 min | reconcilia os projetos cuja última reconciliação falhou depois do último sucesso (RF13, RF39 e RF40) | [Traceability Alerts](../data/TRACEABILITY_ALERTS.md) |

- Cada job tem limite por execução. O vencimento para em 5 minutos; os outros usam o limite de
  lotes dos comandos. O que sobrar fica para a próxima execução.
- A falha de um job é registrada (`scheduled_job_failed`) e não para os outros nem a sincronização.

## Exclusão entre instâncias

- `ScheduledJobLease` guarda uma linha por job: nome, dono e validade.
- A lease vale 2 minutos e é renovada a cada 30 s durante a execução. Ela é liberada em `finally`.
- Uma lease vencida pode ser assumida, por exemplo depois de uma queda do worker.
- Os comandos manuais com `--apply` tomam a mesma lease. Se ela estiver com outro dono, o comando
  sai com código 1, sem rodar.
- Não há `GET_LOCK`: a trava do MySQL pertence à sessão, e o pool do Prisma troca de conexão.

## Variáveis

| Variável | Padrão | Efeito |
| --- | --- | --- |
| `JOBS_ENABLED` | `true` | liga os jobs no worker, mesmo com `GITHUB_SCHEDULER_ENABLED` desligado |
| `DATABASE_POOL_LIMIT` | sem valor (pool padrão do Prisma) | `connection_limit` do cliente da aplicação no processo |

**Orçamento de conexões** (ADR-024 D2): API 5 + 1, worker 3 + 1, comando manual 2 + 1, diagnóstico
1 e reserva 5, num total de 19. O segundo número de cada processo é o cliente de recuperação, que
sempre usa `connection_limit=1&pool_timeout=2`.

## Encerramento e drenagem

- No `SIGTERM`, o worker para de agendar. O job em curso recebe o sinal de parada em até 60 s e
  termina entre lotes. A lease é liberada, e os dois clientes Prisma são desconectados.
- O `TimeoutStopSec` do worker (90 s) cobre a drenagem.

## Saída controlada

O pânico do motor do Prisma e a conexão envenenada (um `KILL` sem confirmação em 2 s) param o
processo com código 1, depois da drenagem. O `Restart=on-failure` reinicia o serviço.
- Depois de 3 partidas em 300 s, o `systemd` deixa o serviço parado. Confira o
  `journalctl -u traceflow-github-worker` (eventos `database_engine_panic` e
  `database_connection_poisoned`) e o banco antes de `systemctl reset-failed` e `systemctl start`.
- A API segue a mesma regra, com o `traceflow-api`.

## Pausa para backup, migration e rollback

1. Pare o worker: `systemctl stop traceflow-github-worker`. Os jobs param junto.
2. Confira que nenhuma lease está válida:
   `SELECT name, ownerId, leaseUntil FROM ScheduledJobLease WHERE leaseUntil > NOW(3);`
3. Faça o backup, a migration ou o rollback, seguindo o runbook próprio
   ([Backup e restauração](BACKUP_RESTORE.md), [Migrations](DATABASE_MIGRATIONS.md)).
4. Suba o worker: `systemctl start traceflow-github-worker`.

O rollback da aplicação não desfaz DDL: uma migration aplicada continua no banco.

## Comandos manuais

| Comando | Arquivo |
| --- | --- |
| `npm run notifications:due` (dry-run em `notifications:due:dry-run`) | `src/jobs/cli/notify-overdue-tasks.js` |
| `npm run notifications:github-events` (dry-run em `notifications:github-events:dry-run`) | `src/jobs/cli/dispatch-github-event-notifications.js` |
| `npm run traceability:alerts` (dry-run em `traceability:alerts:dry-run`) | `src/jobs/cli/reconcile-traceability-alerts.js` |
| `npm run notifications:metrics` | `src/jobs/cli/notification-metrics.js` |

Os comandos estão em `backend/src`, que o artefato de runtime exporta. Em banco de produção, o apply
exige `--confirm-production`.
