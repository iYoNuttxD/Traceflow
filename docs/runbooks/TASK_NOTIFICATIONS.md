# Runbook — job de vencimento de tarefas (RF59)

Regra em [Task Notifications](../data/TASK_NOTIFICATIONS.md); decisão em
[ADR-016](../architecture/ADR-016-TASK-NOTIFICATIONS.md). A notificação de mudança de status
(RF30) nasce na própria API e não depende deste job.

## Responsabilidade e pré-condições

O responsável pela implantação agenda um job externo recorrente que roda o script
`backend/scripts/notify-overdue-tasks.js`. Não executar no startup da API nem por `setInterval`
dentro dela: duplicaria com mais de uma instância e pararia junto com a API.

- Usar as mesmas variáveis protegidas da API (`DATABASE_URL`, `APP_TIMEZONE`,
  `NOTIFICATIONS_DUE_LOOKBACK_DAYS`).
- `APP_TIMEZONE` é o fuso IANA do corte do prazo; o padrão é `America/Sao_Paulo`. Mudá-lo move o
  instante em que as tarefas vencem.
- Até o agendamento real e o monitoramento existirem no ambiente (S2-09 e S2-10), o RF59 só roda à
  mão e não está operacionalmente comprovado.

## Execução manual

Na pasta `backend`, com Node 22:

```bash
npm run notifications:due:dry-run
npm run notifications:due
```

- Opcional: `-- --project-id=<id>` limita a um projeto.
- Em banco de produção, o apply exige `--confirm-production`
  (`node scripts/notify-overdue-tasks.js --apply --confirm-production`).
- O dry-run não grava nada e informa `wouldCreate`.

## Agendamento na OCI (VM de aplicação)

A cada 15 minutos, por timer do `systemd`. Os caminhos e o usuário abaixo são exemplos e devem
seguir o que o S2-09 instalar.

`/etc/systemd/system/traceflow-notifications-due.service`:

```ini
[Unit]
Description=TraceFlow - notificações de prazo vencido (RF59)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=traceflow
WorkingDirectory=/opt/traceflow/backend
EnvironmentFile=/etc/traceflow/backend.env
ExecStart=/usr/bin/node scripts/notify-overdue-tasks.js --apply --confirm-production
```

`/etc/systemd/system/traceflow-notifications-due.timer`:

```ini
[Unit]
Description=Executa o job de vencimentos do TraceFlow a cada 15 minutos

[Timer]
OnCalendar=*:0/15
Persistent=true
RandomizedDelaySec=30
Unit=traceflow-notifications-due.service

[Install]
WantedBy=timers.target
```

Ativar com `systemctl daemon-reload` e `systemctl enable --now traceflow-notifications-due.timer`.

- O serviço `oneshot` não se sobrepõe: o `systemd` não inicia uma execução enquanto a anterior
  roda.
- `Persistent=true` recupera a execução perdida depois de um desligamento.
- Conferir com `systemctl list-timers` e `journalctl -u traceflow-notifications-due`.

**Alternativa com `cron`.** Usar `flock` para não sobrepor execuções:

```cron
*/15 * * * * cd /opt/traceflow/backend && flock -n /tmp/traceflow-notifications-due.lock /usr/bin/node scripts/notify-overdue-tasks.js --apply --confirm-production
```

Mesmo sem o `flock`, duas execuções simultâneas não duplicam notificações, porque o índice único
garante isso. O `flock` só evita trabalho repetido.

## Equivalência na Azure

O roadmap anexado previa a Azure; a cópia do repositório adotou a OCI sem ADR (divergência D-RM-01).
O job não depende da nuvem: é o mesmo comando, com as mesmas variáveis.

- **VM na Azure:** o mesmo timer do `systemd` ou o mesmo `cron` acima.
- **Job agendado de contêiner** (por exemplo, Container Apps Job com gatilho `*/15 * * * *`): a
  imagem do backend roda `node scripts/notify-overdue-tasks.js --apply --confirm-production`, com as
  variáveis injetadas como segredo.
- Nenhum SDK de nuvem entra no código.

## Saída, código de saída e logs

A saída é um JSON:

| Campo | Significado |
| --- | --- |
| `projects` | projetos não excluídos varridos |
| `scanned` | tarefas vencidas dentro da janela |
| `eligible` | ocorrências que devem gerar notificação |
| `created` | notificações criadas nesta execução |
| `alreadyNotified` | elegíveis que já tinham notificação (deduplicação) |
| `excluded` | exclusões por motivo: `OUTSIDE_WINDOW`, `NO_RESPONSIBLE`, `INACTIVE_ACCOUNT`, `INACTIVE_MEMBER`, `PREFERENCE_OFF` |
| `updated` | sempre `NOT_APPLICABLE`: o job não atualiza linhas |
| `failed` | projetos cujo lote falhou |
| `wouldCreate` | só em dry-run |
| `database` | host, porta e nome do banco, sem credencial |

- **Contagens:** valem para a execução e não se somam entre execuções. A mesma tarefa aparece em
  várias execuções, e `excluded.OUTSIDE_WINDOW` conta, a cada uma, toda tarefa aberta com corte
  antes da janela. A métrica oficial não se calcula somando saídas (`TASK_NOTIFICATIONS.md`).
- **Código de saída:**
  - 0 quando `failed = 0`;
  - 1 quando algum projeto falha ou a execução não começa;
  - 2 quando `--project-id` aponta para projeto inexistente ou excluído, com aviso em `stderr`.
- **Logs (JSON):**
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
3. **Parada longa.** Se o job ficou parado mais que a janela (7 dias), as tarefas vencidas antes
   dela aparecem em `excluded.OUTSIDE_WINDOW` e não são notificadas. Para recuperar, rodar uma vez
   com uma janela maior (`NOTIFICATIONS_DUE_LOOKBACK_DAYS=<dias>`, até 90):
   - primeiro em dry-run, para medir o volume, que pode ser grande;
   - depois voltar ao valor padrão.

## Validação

- No dry-run, conferir `timeZone` e `lookbackDays`.
- Depois do apply, conferir que a segunda execução tem `created = 0`.
- Validar por amostra que o destinatário vê a notificação em `/notifications` e que a tarefa
  concluída não gera aviso.
- Registrar a evidência sem dado pessoal.
