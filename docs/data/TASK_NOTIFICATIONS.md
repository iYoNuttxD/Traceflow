# Notificações de tarefa — S2-02 (RF30, RF59)

Decisão em [ADR-016](../architecture/ADR-016-TASK-NOTIFICATIONS.md). Este documento é a regra
executável: o código e os testes seguem exatamente estas tabelas.

## Tipos

| Tipo | RF | Quando nasce | Contexto gravado | Chave de deduplicação |
| --- | --- | --- | --- | --- |
| `TASK_STATUS_CHANGED` | RF30 | a cada `TaskMovement` gravado por `transitionStatus` | `fromStatus`, `toStatus`, `actorUserId`, título da tarefa | `TASK_STATUS_CHANGED:movement:<movementId>` |
| `TASK_OVERDUE` | RF59 | quando o job encontra a tarefa depois do corte do prazo | `dueDate`, título da tarefa | `TASK_OVERDUE:<taskId>:<YYYY-MM-DD do prazo>` |

- A chave é única por destinatário: `UNIQUE (recipientUserId, dedupeKey)`.
- O título é copiado no instante da criação, com até 191 caracteres, o mesmo limite de `Task.title`.
- O nome do ator e o nome do projeto são lidos na exibição, não copiados.

## Destinatário e exclusões

O destinatário é sempre o responsável da tarefa (`Task.responsibleUserId`). As exclusões são
avaliadas nesta ordem; a primeira que vale é o motivo registrado.

| Ordem | RF30 (mudança de status) | RF59 (vencimento) |
| --- | --- | --- |
| 1 | `NO_RESPONSIBLE`: tarefa sem responsável | `OUTSIDE_WINDOW`: corte antes da janela de recuperação |
| 2 | `SELF_CHANGE`: o ator é o próprio responsável | `NO_RESPONSIBLE`: tarefa sem responsável |
| 3 | `INACTIVE_MEMBER`: responsável sem membership ativa no projeto | `INACTIVE_MEMBER`: responsável sem membership ativa no projeto |
| 4 | `PREFERENCE_OFF`: o responsável desligou o tipo | `PREFERENCE_OFF`: o responsável desligou o tipo |

`OUTSIDE_WINDOW`, `NO_RESPONSIBLE`, `INACTIVE_MEMBER` e `SELF_CHANGE` são **exclusões por regra**.
`PREFERENCE_OFF` é **exclusão por escolha** do usuário.

## Corte do vencimento

1. **Data do prazo** é a data UTC de `Task.deadline` (`deadline.toISOString().slice(0, 10)`). Um
   prazo gravado com hora, como `2026-10-10T23:30:00Z`, tem data `2026-10-10`.
2. **Corte** é o início do dia seguinte à data do prazo, no fuso `APP_TIMEZONE` (IANA, padrão
   `America/Sao_Paulo`).
3. A tarefa está **vencida** quando `agora >= corte` e o status não é `CONCLUIDO`.

| `APP_TIMEZONE` | Prazo | Corte (vencida a partir de) | Ainda não vencida em |
| --- | --- | --- | --- |
| `America/Sao_Paulo` | `2026-10-10` | `2026-10-11T03:00:00.000Z` (00:00 de 11/10 em -03:00) | `2026-10-11T02:59:59.999Z` |
| `UTC` | `2026-10-10` | `2026-10-11T00:00:00.000Z` | `2026-10-10T23:59:59.999Z` |
| `Asia/Tokyo` | `2026-10-10` | `2026-10-10T15:00:00.000Z` (00:00 de 11/10 em +09:00) | `2026-10-10T14:59:59.999Z` |

**Horário de verão.** O código não supõe que o fuso não tenha horário de verão. Quando a
meia-noite local não existe, o corte é o primeiro instante do dia local. Exemplo: em
`America/Sao_Paulo`, o dia `2018-11-04` começou à 01:00 (-02:00), em `2018-11-04T03:00:00.000Z`.

## Janela de recuperação

O job só notifica tarefas cujo corte caiu nos últimos `NOTIFICATIONS_DUE_LOOKBACK_DAYS` dias (padrão
7, de 1 a 90): `corte >= agora - janela`.

Exemplo com `America/Sao_Paulo` e `agora = 2026-10-20T12:00:00.000Z` (início da janela em
`2026-10-13T12:00:00.000Z`):

| Prazo | Corte | Resultado |
| --- | --- | --- |
| `2026-10-12` | `2026-10-13T03:00:00.000Z` | fora da janela (`OUTSIDE_WINDOW`) |
| `2026-10-13` | `2026-10-14T03:00:00.000Z` | dentro da janela |
| `2026-10-19` | `2026-10-20T03:00:00.000Z` | dentro da janela |
| `2026-10-20` | `2026-10-21T03:00:00.000Z` | ainda não venceu (não é avaliada) |

## Repetição

| Situação | Resultado |
| --- | --- |
| Rodar o job de novo, ou dois jobs ao mesmo tempo | nada novo: a chave já existe |
| Reabrir a tarefa e deixá-la vencida de novo, com o mesmo prazo | nada novo: mesma chave |
| Mudar o prazo para outra data, que depois vence | nova notificação: chave nova |
| Trocar o responsável de uma tarefa vencida | o novo responsável recebe a sua (chave por destinatário) |
| A → B → A no status | duas notificações: cada movimento é um evento |
| Duas mudanças concorrentes do mesmo status | uma notificação: só o movimento vencedor existe |

## Preferências

- Por usuário e por tipo. Sem linha, o tipo está ligado.
- Valem no instante da criação. Desligar não apaga o que já existe; ligar de novo não recupera o que
  foi excluído.
- O canal é só a aplicação.

## Visibilidade e leitura

- O destinatário vê a notificação enquanto tiver membership ativa no projeto e o projeto não estiver
  excluído (`deletedAt` nulo). A mesma regra vale para a lista, o contador, marcar uma e marcar
  todas.
- Perder o acesso oculta, sem apagar. Voltar ao projeto exibe de novo.
- `readAt` nulo é não lida. Marcar como lida guarda o primeiro instante de leitura; marcar como não
  lida volta a nulo.
- Link de contexto: `/projects/<projectId>/kanban?task=<taskId>`. Tarefa excluída: sem link
  (`available: false`), com o título copiado.

## Métrica oficial (RF30 e RF59)

Critério dos Quadros 3-55 e 3-56: `(notificações enviadas corretamente / total de eventos
ocorridos) × 100`.

| Termo | RF30 | RF59 |
| --- | --- | --- |
| Evento ocorrido | cada `TaskMovement` | cada par (tarefa, data do prazo) cujo corte passou com a tarefa fora de `CONCLUIDO` |
| Exclusão por regra | `NO_RESPONSIBLE`, `SELF_CHANGE`, `INACTIVE_MEMBER` | `OUTSIDE_WINDOW`, `NO_RESPONSIBLE`, `INACTIVE_MEMBER` |
| Exclusão por escolha | `PREFERENCE_OFF` | `PREFERENCE_OFF` |
| Evento elegível | evento ocorrido sem exclusão | evento ocorrido sem exclusão |
| Enviada corretamente | criada uma vez, para o responsável, com origem, destino e ator corretos, link válido e visível só a ele | criada uma vez, para o responsável, com a data do prazo correta, link válido e visível só a ele |

**Cálculo.** `cobertura = enviadas corretamente / eventos elegíveis × 100`, publicada sempre ao lado
das exclusões por motivo. O valor nunca aparece sem as exclusões.

**Medição.**
- RF30: a notificação nasce na transação do movimento, então uma mudança elegível sem notificação
  não persiste. O teste M1 mede a cobertura num cenário com um evento elegível e um de cada
  exclusão.
- RF59: a saída do job traz `eligible`, `created`, `alreadyNotified`, `excluded` e `failed`. O teste
  M2 mede a cobertura num cenário com um evento de cada exclusão.
- O cenário reproduzível é o instrumento entregue ao S3-01 (Capítulo 4). O S2-02 não cria tela para
  o indicador.

**Resultado em 09/10/2026 (banco de teste):**

| RF | Eventos ocorridos | Elegíveis | Enviadas corretamente | Cobertura | Exclusões |
| --- | --- | --- | --- | --- | --- |
| RF30 (M1) | 9 | 5 | 5 | 100% | `NO_RESPONSIBLE` 1, `SELF_CHANGE` 1, `INACTIVE_MEMBER` 1, `PREFERENCE_OFF` 1 |
| RF59 (M2) | 7 | 3 | 3 | 100% | `OUTSIDE_WINDOW` 1, `NO_RESPONSIBLE` 1, `INACTIVE_MEMBER` 1, `PREFERENCE_OFF` 1 |

No M2, a tarefa concluída e a tarefa que ainda não venceu não são eventos ocorridos. O resultado
com dados reais fica para o S3-01.

## Job de vencimento

| Item | Regra |
| --- | --- |
| Comando | `npm run notifications:due:dry-run` (padrão) e `npm run notifications:due` (`--apply`) |
| Produção | exige `--confirm-production` |
| Escopo | todos os projetos não excluídos, ou `--project-id=<id>` |
| Frequência | a cada 15 minutos, por agendador externo ([runbook](../runbooks/TASK_NOTIFICATIONS.md)) |
| Escrita | por projeto, com `createMany` e `skipDuplicates` |
| Falha | a falha de um projeto conta em `failed` e não impede os outros; com `failed > 0`, o processo sai com código 1 |
| Saída | JSON com `dryRun`, `timeZone`, `lookbackDays`, `projects`, `scanned`, `eligible`, `created`, `alreadyNotified`, `excluded` por motivo, `failed`, `durationMs` e, em dry-run, `wouldCreate`. O job não atualiza linhas, e a saída diz isso com `updated: "NOT_APPLICABLE"` |
| Log | `notifications_due_started` (com o fuso), `notifications_due_project_failed` (projeto e código do erro) e `notifications_due_completed` (contagens); nunca título, nome ou e-mail |

## Retenção e privacidade

| Dado | Regra |
| --- | --- |
| Notificação | apagada pelo `privacy:retention` quando `createdAt` passa de `NOTIFICATION_RETENTION_DAYS` (padrão 180) |
| Projeto purgado | as notificações do projeto saem por cascata |
| Tarefa excluída | `taskId` vira nulo; o título copiado permanece |
| Ator removido | `actorUserId` vira nulo; o contexto mostra ator ausente |
| Anonimização do titular | apaga as notificações e as preferências dele; como ator, aparece com o nome pseudonimizado |
| Exportação do titular | `notifications.json`, só das notificações visíveis (projetos com acesso atual, como as demais seções da exportação), com tipo, projeto, tarefa, título copiado, status, data do prazo, criação e leitura, sem o ator; e `notification-preferences.json` |
