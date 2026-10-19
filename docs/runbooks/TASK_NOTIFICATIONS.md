# Runbook — job de vencimento de tarefas (RF59)

Regra em [Task Notifications](../data/TASK_NOTIFICATIONS.md); decisão em
[ADR-016](../architecture/ADR-016-TASK-NOTIFICATIONS.md). A notificação de mudança de status
(RF30) nasce na própria API e não depende deste job.

## Responsabilidade e pré-condições

Desde 17/10/2026, a varredura roda no worker (`backend/src/github-worker.js`) a cada 15 minutos, com
lease no banco ([ADR-024](../architecture/ADR-024-OPERACAO-CONEXOES-RECUPERACAO-E-JOBS.md) D7 e o
runbook [Jobs agendados](SCHEDULED_JOBS.md)). Não há timer nem `cron` a instalar. Não executar no
startup da API nem por `setInterval` dentro dela.

- O worker usa as mesmas variáveis protegidas da API (`DATABASE_URL`, `APP_TIMEZONE`) e roda os
  jobs com `JOBS_ENABLED` ligado (padrão), mesmo com o agendador do GitHub desligado.
- A variável `NOTIFICATIONS_DUE_LOOKBACK_DAYS` saiu em 15/10/2026 e é ignorada se ainda estiver no
  ambiente.
- **Primeira execução depois de 15/10/2026.** Sem janela, a varredura notifica de uma vez todas as
  tarefas vencidas e abertas, por mais antigas que sejam. Rode o dry-run manual antes de ligar o
  worker e guarde o `wouldCreate`.
- `APP_TIMEZONE` é o fuso IANA do corte do prazo; o padrão é `America/Sao_Paulo`. Mudá-lo move o
  instante em que as tarefas vencem.
- A notificação e a decisão de cada tarefa gravam na mesma transação, em lotes de até 1.000 tarefas
  (ADR-016 D6).

## Execução manual

Na pasta `backend`, com Node 22:

```bash
npm run notifications:due:dry-run
npm run notifications:due
```

- O comando fica em `src/jobs/cli/notify-overdue-tasks.js`, dentro do artefato de runtime.
- Opcional: `-- --project-id=<id>` limita a um projeto.
- Em banco de produção, o apply exige `--confirm-production`
  (`node src/jobs/cli/notify-overdue-tasks.js --apply --confirm-production`).
- O apply toma a mesma lease do worker. Com o worker no meio de uma varredura, o comando avisa e
  sai com código 1, sem rodar.
- O dry-run não grava nada e informa `wouldCreate`.

## Agendamento

O worker é o agendador. Para conferir:
- `journalctl -u traceflow-github-worker` com o evento `scheduled_job_completed` e o nome
  `notifications-due`;
- a tabela `ScheduledJobLease`, com o dono e a validade da lease em curso.

Timers do `systemd` e `cron` para este job não devem ser instalados: o worker já faz o trabalho, e a
lease faria a execução externa sair sem rodar.

## Saída, código de saída e logs

O `stdout` traz só o relatório, em JSON. Os logs vão para `stderr`, uma linha JSON por evento
(desde 13/10/2026; antes, o log de conclusão saía no `stdout`, antes do relatório).

| Campo | Significado |
| --- | --- |
| `projects` | projetos não excluídos varridos |
| `scanned` | tarefas vencidas e abertas, sem limite de idade |
| `eligible` | ocorrências que devem gerar notificação |
| `created` | notificações criadas nesta execução |
| `alreadyNotified` | elegíveis que já tinham notificação (deduplicação) |
| `excluded` | exclusões por motivo: `NO_RESPONSIBLE`, `INACTIVE_ACCOUNT`, `INACTIVE_MEMBER`, `PREFERENCE_OFF` |
| `updated` | sempre `NOT_APPLICABLE`: o job não atualiza linhas |
| `failed` | projetos cujo lote falhou |
| `wouldCreate` | só em dry-run |
| `database` | host, porta e nome do banco, sem credencial |

- **Contagens:** valem para a execução e não se somam entre execuções. A mesma tarefa aparece em
  várias execuções, como `eligible` e `alreadyNotified`, enquanto estiver vencida e aberta. A
  métrica oficial não se calcula somando saídas: ela sai do script `notifications:metrics`
  (`NOTIFICATION_METRICS.md`).
- **Código de saída:**
  - 0 quando `failed = 0`;
  - 1 quando algum projeto falha ou a execução não começa;
  - 2 quando `--project-id` aponta para projeto inexistente ou excluído, com aviso em `stderr`.
  - A recusa de produção (apply sem `--confirm-production`) acontece antes da varredura: com ela,
    sai 1 mesmo que o `--project-id` não exista. Em dry-run, o mesmo `--project-id` sai 2.
- **Logs (JSON, em `stderr`):**
  - `notifications_due_started`, com o fuso e o instante;
  - `notifications_due_project_failed`, com o projeto e o código do erro;
  - `notifications_due_completed`, com as contagens.

  Nunca há título, nome ou e-mail.

**Alertar quando:**
- o timer não roda no intervalo;
- o código de saída é 1 ou 2;
- `failed > 0` se repete.

## Falha e recuperação

1. Ler o `errorCode` de `notifications_due_project_failed` e corrigir a causa (conexão, lock,
   migration pendente — conferir `npx prisma migrate status` em `backend`).
2. Rodar o dry-run e depois o apply. Repetir é seguro: o que já foi notificado conta em
   `alreadyNotified`.
3. **Parada longa.** Não há janela: a execução seguinte notifica tudo o que venceu durante a
   parada. Rode primeiro em dry-run, para medir o volume, que pode ser grande.

## Métrica oficial

`npm run notifications:metrics -- --from=YYYY-MM-DD --to=YYYY-MM-DD [--project-id=<id>]`, dentro
de `backend`.

- Só leitura: não exige `--confirm-production`.
- Meça períodos já fechados. Um período que termina depois da última execução do job pode ter
  vencimentos ainda não avaliados e sai "indisponível" (`EVENTOS_NAO_OBSERVADOS`).
- Cobertura `INDISPONIVEL` traz o motivo. `REGISTRO_INCOMPLETO` diz, em `completoDesde`, a partir
  de quando o registro vale.
- Códigos de saída: 0 (cálculo feito), 1 (argumento inválido ou falha) e 2 (`--project-id` sem
  projeto ativo).
- A definição completa está em [NOTIFICATION_METRICS.md](../data/NOTIFICATION_METRICS.md).

## Validação

- No dry-run, conferir `timeZone` e `wouldCreate`.
- Depois do apply, conferir que a segunda execução tem `created = 0`.
- Validar por amostra que o destinatário vê a notificação em `/notifications` e que a tarefa
  concluída não gera aviso.
- Registrar a evidência sem dado pessoal.
