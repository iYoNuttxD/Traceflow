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
| Varredura das inconsistências | `traceability-alerts` | 60 min | reconcilia, um por vez e nesta ordem: falha depois do último sucesso; tentativa sem resultado há mais de 15 minutos; projeto ativo sem reconciliação completa; último sucesso com mais de 24 h (RF13, RF39 e RF40) | [Traceability Alerts](../data/TRACEABILITY_ALERTS.md) |

- A primeira execução de cada job acontece 10 s depois da partida do worker; as seguintes, um
  intervalo depois do fim da anterior.
- Cada job tem limite por execução. O vencimento para em 5 minutos, e a varredura, em 10; os
  despachos usam o limite de lotes dos comandos. O que sobrar fica para a próxima execução.
- **Interrupção (18/10/2026).** O sinal de parada (lease perdida, limite da execução ou `stop()`) é
  conferido antes de cada unidade nova: onda e unidade do vencimento, evento do despacho, lote dos
  avisos e projeto da varredura. A unidade já iniciada termina na própria transação. A saída traz
  `interrupted: true`, as contagens só do que terminou e o que ficou: `pendingProjects`,
  `pendingEvents` ou `pendingBatches`.
- A falha de um job é registrada (`scheduled_job_failed`) e não para os outros nem a sincronização.
  O fim registra `scheduled_job_completed`, com as contagens do job e `interrupted` quando ele
  parou antes de terminar.
- A varredura registra o gatilho `SCHEDULED` em `TraceabilityAlertReconciliation`. O comando manual
  continua com `SCRIPT`.

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
| `connection_limit` na `DATABASE_URL` | obrigatório em produção | conexões do cliente da aplicação no processo; o teto é por função (abaixo) |

**Orçamento de conexões** (ADR-024 D2): API 5 + 1, worker 3 + 1, comando manual 2 + 1, diagnóstico
1 e reserva 5, num total de 19. O segundo número de cada processo é o cliente de recuperação, que
sempre usa `connection_limit=1&pool_timeout=2`.

- **Fonte única (18/10/2026, TF-REV-016).** O limite vem só do `connection_limit` da URL, o mesmo
  que o preflight da OCI valida. O `DATABASE_POOL_LIMIT` saiu: se estiver no ambiente, o processo
  recusa a partida com `DATABASE_POOL_LIMIT_REMOVED`. Tire a variável da unidade e do arquivo de
  ambiente.
- **Teto conferido na partida.** API até 5, worker até 3, comando manual até 2. Em produção, a URL
  sem `connection_limit`, ou acima do teto, recusa a partida (`CONNECTION_LIMIT_REQUIRED` ou
  `CONNECTION_LIMIT_ABOVE_BUDGET`), antes de qualquer consulta. Em desenvolvimento e teste, a URL
  sem o parâmetro usa o pool padrão do Prisma.
- **Comandos manuais.** A URL do worker (3) não serve para eles: use uma URL com
  `connection_limit` de no máximo 2.

## Encerramento e drenagem

- No `SIGTERM`, o worker para de agendar. O job em curso recebe o sinal de parada em até 60 s e
  não começa unidade nova. A lease é liberada, e os dois clientes Prisma são desconectados.
- **Desconexão com prazo (18/10/2026, TF-REV-013).** A desconexão espera no máximo 5 s. Sem
  resposta, o processo sai com código 1 e registra `database_disconnect_timeout`. O worker sai em até
  65 s, e a API, em até 15 s.
- O `TimeoutStopSec` do worker (90 s) e o da API (45 s) cobrem esses prazos.

## Saída controlada

Param o processo com código 1, depois da drenagem, e o `Restart=on-failure` reinicia o serviço:
- o pânico do motor do Prisma;
- a conexão envenenada: um `KILL QUERY` sem confirmação em 2 s;
- a recuperação não confirmada: o `KILL` da conexão depois do `P2028`, rejeitado ou sem resposta em
  2 s (desde 18/10/2026);
- a transação que não assenta em `maxWait + timeout + 5 s`, ou `timeout + 7 s` com o `maxWait`
  padrão (desde 18/10/2026).

Depois de 3 partidas em 300 s, o `systemd` deixa o serviço parado. Confira o
`journalctl -u traceflow-github-worker` e o banco antes de `systemctl reset-failed` e
`systemctl start`. Eventos:
- `database_unavailable_shutdown`, nos dois processos, com `reason` `ENGINE_PANIC`,
  `POISONED_CONNECTION`, `UNCONFIRMED_RECOVERY` ou `UNSETTLED_TRANSACTION`;
- `database_engine_panic`, na API;
- `database_connection_poisoned`, com o `connectionId` da transação;
- `database_recovery_unconfirmed`, com o `connectionId` e o motivo (`REJECTED` ou `TIMEOUT`);
- `database_transaction_unsettled`, com o prazo da transação;
- `database_disconnect_timeout`, no encerramento;
- `worker_shutdown_incomplete`, quando um serviço do worker não para em 60 s.

A API segue a mesma regra, com o `traceflow-api`.

## Pausa para backup, migration e rollback

1. Pare o worker: `systemctl stop traceflow-github-worker`. Os jobs param junto.
2. Confira que nenhuma lease está válida:
   `SELECT name, ownerId, leaseUntil FROM ScheduledJobLease WHERE leaseUntil > UTC_TIMESTAMP(3);`
   (o Prisma grava as datas em UTC).
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
exige `--confirm-production`, e a `DATABASE_URL` do comando precisa de `connection_limit` de no
máximo 2.
