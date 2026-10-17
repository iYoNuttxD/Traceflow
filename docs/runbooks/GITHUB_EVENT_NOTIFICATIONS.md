# Runbook — despacho das notificações de issues e pull requests (RF60, RF61)

Regra em [GitHub Event Notifications](../data/GITHUB_EVENT_NOTIFICATIONS.md); decisão em
[ADR-018](../architecture/ADR-018-GITHUB-EVENT-NOTIFICATIONS.md). A transição nasce na
sincronização GitHub e vai para a fila `GitHubArtifactEvent`. O despacho roda logo depois de cada
execução de sincronização e, para o que sobrar, neste job.

## Responsabilidade e pré-condições

O responsável pela implantação agenda um job externo recorrente que roda o script
`backend/scripts/dispatch-github-event-notifications.js`. Não executar no startup da API nem por
`setInterval` dentro dela: duplicaria com mais de uma instância e pararia junto com a API.

- Usar as mesmas variáveis protegidas da API (`DATABASE_URL`).
- Não há janela desde 15/10/2026: a transição de artefato vinculado notifica qualquer que seja a
  idade da ocorrência. A variável `GITHUB_EVENT_NOTIFICATIONS_LOOKBACK_DAYS` saiu e é ignorada se
  ainda estiver no ambiente.
- O job não chama o GitHub nem usa o token da GitHub App.
- Até o agendamento real e o monitoramento existirem no ambiente (S2-09 e S2-10), o despacho de
  recuperação só roda à mão. O despacho depois da sincronização funciona sem o job.

## Execução manual

Na pasta `backend`, com Node 22:

```bash
npm run notifications:github-events:dry-run
npm run notifications:github-events
```

- Opcional: `-- --project-id=<id>` limita a um projeto.
- Opcional: `-- --retry-failed` devolve os eventos `FAILED` à fila (com `--apply`) ou só os conta
  (em dry-run). O reprocessamento é auditado (`GITHUB_EVENT_NOTIFICATIONS_REQUEUED`).
- Em banco de produção, o apply exige `--confirm-production`
  (`node scripts/dispatch-github-event-notifications.js --apply --confirm-production`).
- O dry-run não reserva nem grava nada e informa `wouldCreate`.

## Agendamento na OCI (VM de aplicação)

A cada 15 minutos, por timer do `systemd`. Os caminhos e o usuário abaixo são exemplos e devem
seguir o que o S2-09 instalar.

`/etc/systemd/system/traceflow-github-event-notifications.service`:

```ini
[Unit]
Description=TraceFlow - notificações de issues e pull requests (RF60, RF61)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=traceflow
WorkingDirectory=/opt/traceflow/backend
EnvironmentFile=/etc/traceflow/backend.env
ExecStart=/usr/bin/node scripts/dispatch-github-event-notifications.js --apply --confirm-production
```

`/etc/systemd/system/traceflow-github-event-notifications.timer`:

```ini
[Unit]
Description=Despacha as notificações de issues e pull requests do TraceFlow a cada 15 minutos

[Timer]
OnCalendar=*:0/15
Persistent=true
RandomizedDelaySec=30
Unit=traceflow-github-event-notifications.service

[Install]
WantedBy=timers.target
```

Ativar com `systemctl daemon-reload` e
`systemctl enable --now traceflow-github-event-notifications.timer`.

- O serviço `oneshot` não se sobrepõe a si mesmo. Mesmo assim, despachos simultâneos (o do job e o
  que roda depois de uma sincronização) não duplicam: cada evento é reservado por um só, e a chave
  única da notificação impede repetição.
- Conferir com `systemctl list-timers` e `journalctl -u traceflow-github-event-notifications`.

**Alternativa com `cron`.**

```cron
*/15 * * * * cd /opt/traceflow/backend && flock -n /tmp/traceflow-github-event-notifications.lock /usr/bin/node scripts/dispatch-github-event-notifications.js --apply --confirm-production
```

## Equivalência na Azure

O roadmap anexado previa a Azure; a cópia do repositório adotou a OCI sem ADR (divergência D-RM-01).
O job não depende da nuvem: é o mesmo comando, com as mesmas variáveis.

- **VM na Azure:** o mesmo timer do `systemd` ou o mesmo `cron` acima.
- **Job agendado de contêiner** (por exemplo, Container Apps Job com gatilho `*/15 * * * *`): a
  imagem do backend roda
  `node scripts/dispatch-github-event-notifications.js --apply --confirm-production`, com as
  variáveis injetadas como segredo.
- Nenhum SDK de nuvem entra no código.

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
