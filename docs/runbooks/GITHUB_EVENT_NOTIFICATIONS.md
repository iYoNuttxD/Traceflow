# Runbook — despacho das notificações de issues e pull requests (RF60, RF61)

Regra em [GitHub Event Notifications](../data/GITHUB_EVENT_NOTIFICATIONS.md); decisão em
[ADR-018](../architecture/ADR-018-GITHUB-EVENT-NOTIFICATIONS.md). O evento nasce do histórico de
eventos do repositório, lido na sincronização GitHub, e vai para a fila `GitHubArtifactEvent`. A
abertura (`ISSUE_OPENED`) nasce no vínculo. O despacho roda logo depois de cada execução de
sincronização, e a retomada roda no worker a cada 5 minutos.

## Responsabilidade e pré-condições

Desde 17/10/2026, a retomada do despacho roda no worker (`backend/src/github-worker.js`) a cada 5
minutos, com lease no banco ([ADR-024](../architecture/ADR-024-OPERACAO-CONEXOES-RECUPERACAO-E-JOBS.md)
D7 e o runbook [Jobs agendados](SCHEDULED_JOBS.md)). Não há timer nem `cron` a instalar.

- O worker usa as mesmas variáveis protegidas da API (`DATABASE_URL`) e roda os jobs com
  `JOBS_ENABLED` ligado (padrão).
- Não há janela desde 15/10/2026. A variável `GITHUB_EVENT_NOTIFICATIONS_LOOKBACK_DAYS` saiu e é
  ignorada se ainda estiver no ambiente.
- O despacho não chama o GitHub nem usa o token da GitHub App.
- **Corte de 17/10/2026.** A migration `durable_github_events` grava o início da cobertura de cada
  projeto integrado. Eventos anteriores ao corte não geram aviso.

## Execução manual

Na pasta `backend`, com Node 22:

```bash
npm run notifications:github-events:dry-run
npm run notifications:github-events
```

- O comando fica em `src/jobs/cli/dispatch-github-event-notifications.js`, dentro do artefato de
  runtime.
- Opcional: `-- --project-id=<id>` limita a um projeto.
- Opcional: `-- --retry-failed` devolve os eventos `FAILED` à fila (com `--apply`) ou só os conta
  (em dry-run). O reprocessamento é auditado (`GITHUB_EVENT_NOTIFICATIONS_REQUEUED`).
- Em banco de produção, o apply exige `--confirm-production`
  (`node src/jobs/cli/dispatch-github-event-notifications.js --apply --confirm-production`).
- O apply toma a mesma lease do worker; com a retomada em curso, o comando avisa e sai com código 1.
- O dry-run não reserva nem grava nada e informa `wouldCreate`.

## Agendamento

O worker é o agendador. Para conferir, `journalctl -u traceflow-github-worker` com o evento
`scheduled_job_completed` e o nome `github-event-dispatch`. Timers do `systemd` e `cron` para este
job não devem ser instalados.

## Equivalência na Azure

O roadmap anexado previa a Azure; a cópia do repositório adotou a OCI sem ADR (divergência D-RM-01).
O worker não depende da nuvem: é o mesmo processo, com as mesmas variáveis. Nenhum SDK de nuvem entra
no código.
## Saída, código de saída e logs

O `stdout` traz só o relatório, em JSON. Os logs vão para `stderr`, uma linha JSON por evento.

| Campo | Significado |
| --- | --- |
| `projects` | projetos com eventos avaliados nesta execução |
| `scanned` | eventos avaliados |
| `claimed` | eventos reservados por esta execução |
| `busy` | eventos que outro despachante reservou primeiro |
| `claimLost` | reservas que esta execução perdeu: outro despachante retomou o evento depois do prazo de 2 minutos |
| `dispatched` | eventos fechados como `DISPATCHED` |
| `created` | notificações criadas |
| `alreadyNotified` | pares elegíveis que já tinham notificação (deduplicação) |
| `excluded` | exclusões por motivo: `NO_TASK`, `NO_PARTICIPANT` (por tarefa); `OUTSIDE_WINDOW`, `INACTIVE_ACCOUNT`, `INACTIVE_MEMBER`, `PREFERENCE_OFF` (por par) |
| `retryScheduled` | tentativas que falharam e voltaram à fila |
| `failed` | eventos que viraram `FAILED` nesta execução (quinta tentativa ou reserva vencida com 5 tentativas) |
| `failedStock` | eventos `FAILED` no escopo da execução, vindos de qualquer execução, até o reprocessamento ou a retenção |
| `pendingAfter` | eventos `PENDING` ou `PROCESSING` depois da execução, inclusive os que esperam a próxima tentativa |
| `dueAfter` | eventos vencidos e não processados depois da execução: `PENDING` com `nextAttemptAt` vencido ou `PROCESSING` com reserva vencida |
| `oldestDueAgeSeconds` | há quanto tempo o mais antigo dos vencidos venceu, ou `null` |
| `wouldCreate` | só em dry-run |
| `requeued`, `wouldRequeue` | só com `--retry-failed` |
| `database` | host, porta e nome do banco, sem credencial |

- **Mudança de 13/10/2026** (sem consumidor afetado, porque o agendador ainda não está instalado):
  - os logs saíram do `stdout`;
  - `oldestPendingAgeSeconds` deu lugar a `dueAfter` e `oldestDueAgeSeconds`;
  - entraram `failedStock` e `claimLost`;
  - `excluded.PROJECT_DELETED` saiu, porque o evento de projeto excluído passou a ser despachado,
    oculto até a restauração.
- **Contagens:** valem para a execução. A medição da métrica oficial usa o `outcome` gravado em
  cada evento (`GITHUB_EVENT_NOTIFICATIONS.md`), não a soma de saídas.
- **Código de saída:**
  - 0 quando nenhuma tentativa falhou;
  - 1 quando alguma tentativa falhou (`retryScheduled` ou `failed` acima de zero) ou a execução não
    começa;
  - 2 quando `--project-id` aponta para projeto inexistente ou excluído, com aviso em `stderr`.
  - A recusa de produção (apply sem `--confirm-production`) acontece antes de conferir o projeto:
    com ela, sai 1 mesmo que o `--project-id` não exista.
  - O estoque de `FAILED` não muda o código de saída; ele aparece em `failedStock`.
- **Logs (JSON, em `stderr`), sem título, URL, login, nome ou e-mail:**
  - `github_artifact_transitions_recorded` (sincronização: projeto, tipo de artefato, transições,
    tarefas no retrato);
  - `github_pull_request_state_anomaly` (PR mesclada que voltou a outro estado no GitHub);
  - `github_event_notifications_dispatch_completed` (contagens da execução; em `warn` quando há
    falha ou `failedStock > 0`);
  - `github_event_notification_attempt_failed` (evento, projeto, tentativa e código do erro);
  - `github_event_notification_failed` (falha definitiva, nível de erro);
  - `github_event_notification_release_failed` (o evento não voltou à fila; volta sozinho depois
    da reserva de 2 minutos);
  - `github_event_notification_claim_lost` (o despachante perdeu a reserva, e outro retomou o
    evento);
  - `github_event_notifications_dispatch_failed` (o despacho depois da sincronização falhou; o job
    recupera).

**Alertar quando:**
- o timer não roda no intervalo;
- o código de saída é 1 ou 2;
- `failedStock > 0`: há eventos esperando reprocessamento manual, e a retenção os apaga em 180 dias;
- `oldestDueAgeSeconds` passa de 1.800 (30 minutos): há evento vencido que nenhum despacho
  processou. A espera normal de retentativa (1, 5, 30 e 120 minutos) não conta;
- `claimLost > 0` se repete: despachos estão passando de 2 minutos.

## Falha e recuperação

1. Ler o `errorCode` de `github_event_notification_attempt_failed` e corrigir a causa (conexão,
   bloqueio, migration pendente — conferir `npx prisma migrate status` em `backend`).
2. As tentativas seguem sozinhas: 1, 5, 30 e 120 minutos depois de cada falha. Na quinta, o evento
   vira `FAILED`.
3. Corrigida a causa, reprocessar: `npm run notifications:github-events -- --retry-failed` (ou
   `node scripts/dispatch-github-event-notifications.js --apply --retry-failed`), primeiro em
   dry-run para ver `wouldRequeue`. Repetir é seguro: o que já foi notificado conta em
   `alreadyNotified`. O alerta de estoque acaba quando `failedStock` volta a 0.
4. **Projeto parado por muito tempo.** Não há janela: as transições detectadas na retomada
   notificam normalmente. Eventos fechados antes de 15/10/2026 com `OUTSIDE_WINDOW` no `outcome`
   não são reabertos.
5. **Projeto excluído.** O evento é despachado normalmente, e as notificações ficam ocultas até a
   restauração. A purga apaga evento e notificações. Não há o que fazer.

## Validação

- No dry-run, conferir `lookbackDays` e `wouldCreate`.
- Depois do apply, conferir que a segunda execução tem `created = 0` e `scanned = 0`.
- Validar por amostra que o participante vê a notificação em `/notifications`, com "Abrir no GitHub"
  apontando para o artefato, e que quem não participa da tarefa não a vê.
- Registrar a evidência sem dado pessoal.
