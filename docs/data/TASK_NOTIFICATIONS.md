# Notificações de tarefa — S2-02 (RF30, RF59)

Decisão em [ADR-016](../architecture/ADR-016-TASK-NOTIFICATIONS.md). Este documento é a regra
executável: o código e os testes seguem exatamente estas tabelas.

Revisto em 15/10/2026 (revisão independente da PR #26):
- o RF30 avisa também quando o próprio responsável muda o status;
- o RF59 não tem janela;
- a métrica oficial está em [NOTIFICATION_METRICS.md](NOTIFICATION_METRICS.md).

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
| 1 | `NO_RESPONSIBLE`: tarefa sem responsável | `NO_RESPONSIBLE`: tarefa sem responsável |
| 2 | `INACTIVE_ACCOUNT`: conta do responsável desativada, com exclusão pendente ou anonimizada | `INACTIVE_ACCOUNT`: conta do responsável desativada, com exclusão pendente ou anonimizada |
| 3 | `INACTIVE_MEMBER`: responsável sem membership ativa no projeto | `INACTIVE_MEMBER`: responsável sem membership ativa no projeto |
| 4 | `PREFERENCE_OFF`: o responsável desligou o tipo | `PREFERENCE_OFF`: o responsável desligou o tipo, ou o religou depois do corte |

Na métrica ([NOTIFICATION_METRICS.md](NOTIFICATION_METRICS.md)), os motivos se dividem em dois
grupos:
- `NO_RESPONSIBLE` é **sem destinatário**;
- `INACTIVE_ACCOUNT`, `INACTIVE_MEMBER` e `PREFERENCE_OFF` são **não enviadas por motivo autorizado**.

Cada evento avaliado grava a decisão em `NotificationDecision`: o motivo, ou `SENT`. As regras de
gravação estão em [NOTIFICATION_METRICS.md](NOTIFICATION_METRICS.md), "Gravação das decisões".

- **RF30:**
  - O responsável recebe também quando é ele quem muda o status. A notificação diz "Você moveu
    TASK-12 para Concluído". `SELF_CHANGE` deixou de existir em 15/10/2026.
  - As exclusões valem no instante da mudança de status. O que foi excluído não volta.
- **RF59:** o job avalia a conta e a membership a cada varredura. Se a conta for reativada, ou a
  pessoa voltar ao projeto, a varredura seguinte notifica. A preferência é a exceção: religá-la não
  recupera o vencimento cujo corte foi antes de religar (`enabledAt`, seção "Preferências").

## Corte do vencimento

1. **Data do prazo** é a data UTC de `Task.deadline` (`deadline.toISOString().slice(0, 10)`). Um
   prazo gravado com hora, como `2026-10-10T23:30:00Z`, tem data `2026-10-10`. Um prazo enviado
   com hora e fuso vale pela data UTC do instante: `2026-10-10T22:30:00-03:00` é gravado como
   `2026-10-11T01:30:00.000Z` e tem data `2026-10-11`. A tela envia só a data.
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

**Dia inexistente.** Alguns fusos pularam um dia inteiro. Quando o dia seguinte ao prazo não
existe, o corte é o instante em que o dia do prazo termina, isto é, o início do primeiro dia local
que existe depois dele:

| Fuso | Prazo | Dia que não existiu | Corte |
| --- | --- | --- | --- |
| `Pacific/Apia` | `2011-12-29` | `2011-12-30` | `2011-12-30T10:00:00.000Z` (00:00 de 31/12 em +14:00) |
| `Pacific/Fakaofo` | `2011-12-29` | `2011-12-30` | `2011-12-30T11:00:00.000Z` |
| `Pacific/Kwajalein` | `1993-08-20` | `1993-08-21` | `1993-08-21T12:00:00.000Z` |
| `Pacific/Kiritimati` | `1994-12-30` | `1994-12-31` | `1994-12-31T10:00:00.000Z` |
| `Pacific/Enderbury` (hoje `Pacific/Kanton`) | `1994-12-30` | `1994-12-31` | `1994-12-31T11:00:00.000Z` |

A tabela traz todos os dias saltados do tzdata 2025b entre 1900 e 2037, achados por varredura dos
418 fusos do Node 22.18 (ICU 77.1). Em todos, o novo deslocamento é de pelo menos +12 h, e o corte
cai no máximo 12 h depois da meia-noite UTC do dia pulado.

**Diferença com a tela.** O Kanban marca "Atrasada" comparando a data do prazo com a data de hoje
no fuso do navegador; a notificação usa `APP_TIMEZONE`. Para quem está fora do fuso de referência,
os dois discordam por algumas horas. Com prazo `2026-10-10` e `APP_TIMEZONE=America/Sao_Paulo`
(corte em `2026-10-11T03:00:00.000Z`):
- em `Pacific/Kiritimati` (+14), a tela marca "Atrasada" em `2026-10-10T10:00:00.000Z`, 17 h
  antes do corte;
- em `Pacific/Pago_Pago` (−11), em `2026-10-11T11:00:00.000Z`, 8 h depois.

## Sem janela

Desde 15/10/2026 não há janela de recuperação (Quadro 3-55). Toda tarefa aberta cujo corte já passou
é notificada uma vez por par (tarefa, data do prazo), por mais antigo que seja o corte. A variável
`NOTIFICATIONS_DUE_LOOKBACK_DAYS` e o motivo `OUTSIDE_WINDOW` saíram.

Exemplo com `America/Sao_Paulo` e `agora = 2026-10-20T12:00:00.000Z`:

| Prazo | Corte | Resultado |
| --- | --- | --- |
| `2025-03-01` | `2025-03-02T03:00:00.000Z` | notificada, se ainda não foi |
| `2026-10-12` | `2026-10-13T03:00:00.000Z` | notificada, se ainda não foi |
| `2026-10-19` | `2026-10-20T03:00:00.000Z` | notificada, se ainda não foi |
| `2026-10-20` | `2026-10-21T03:00:00.000Z` | ainda não venceu (não é avaliada) |

A primeira execução depois da implantação notifica todo o estoque de tarefas vencidas e abertas. O
runbook manda rodar o dry-run antes do `--apply`.

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
- No RF59, a notificação nasce no job, depois do corte. Por isso a preferência guarda `enabledAt`,
  o instante da última passagem de desligada para ligada (nulo se nunca foi desligada). Vencimento
  com corte anterior a `enabledAt` conta como `PREFERENCE_OFF`. Exemplo com prazo `2026-10-15`
  (corte em `2026-10-16T03:00:00.000Z`):
  - desligada antes do corte e religada em `2026-10-17T12:00:00.000Z`: nenhuma notificação para
    esse prazo;
  - desligada e religada antes do corte: a notificação nasce na execução seguinte ao corte.
- `enabledAt` vem do relógio do servidor da API, que precisa estar sincronizado (NTP). O corte é
  calendário (início do dia local seguinte ao prazo) e não depende do relógio do job. Com o relógio
  da API desviado em `s`, uma religação a menos de `s` do corte cai do lado errado.
- O `PUT` de preferências é serializado por usuário e espera o bloqueio da conta por no máximo 2 s.
  Com outra alteração em andamento, responde 409 `NOTIFICATION_PREFERENCES_BUSY`, e a pessoa tenta
  de novo; nenhuma outra requisição é afetada.
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
- A lista pagina por cursor estável (`createdAt` e `id` do último item, em ordem decrescente).
  Marcar como lida não desloca as páginas seguintes, e nada se repete quando uma notificação nova
  chega entre duas páginas; a nova aparece ao ler do início.
- Item desmarcado (volta a não lido) acima do cursor não reaparece na continuação; ele aparece numa
  leitura do início. Na central não há perda, porque o cartão continua na tela.
- O cursor só vale na forma canônica, a que o servidor devolve em `nextCursor`. Outra codificação do
  mesmo conteúdo responde 400.
- No filtro Não lidas, o item marcado como lido continua na tela, com o estado de lida, até
  recarregar. Assim dá para desfazer.
- A marcação é por cartão: enquanto um cartão espera a resposta, os outros continuam marcáveis.

## Métrica oficial (RF30 e RF59)

A métrica segue [NOTIFICATION_METRICS.md](NOTIFICATION_METRICS.md):
- cobertura total sobre o total de eventos ocorridos;
- cobertura elegível como auxiliar rotulada;
- "indisponível" quando falta observação.

O instrumento é o script `notifications:metrics`, que lê `TaskMovement`, o histórico das tarefas e
as decisões gravadas em `NotificationDecision`. Nos cenários de M1 e M2, com uma exclusão de cada
motivo, a cobertura total é 60% no RF30 (6 de 10) e 50% no RF59 (4 de 8); a elegível é 100% nos
dois.

**Resultados anteriores (09 e 11/10/2026), só como histórico.** Os testes M1 e M2 mediam a
cobertura sobre os eventos elegíveis, com `SELF_CHANGE` e `OUTSIDE_WINDOW` entre as exclusões. Com
a regra de 15/10/2026, eles foram reescritos:
- os eventos do próprio responsável e os vencimentos antigos passam a ser notificados;
- a cobertura total usa o total de eventos ocorridos.

## Job de vencimento

| Item | Regra |
| --- | --- |
| Comando | `npm run notifications:due:dry-run` (padrão) e `npm run notifications:due` (`--apply`) |
| Produção | exige `--confirm-production` |
| Escopo | todos os projetos não excluídos, ou `--project-id=<id>` |
| Frequência | a cada 15 minutos; o agendamento proposto é uma tarefa periódica do worker do GitHub (ADR-024). Enquanto o ADR-024 não vigorar, um agendador externo chama o comando ([runbook](../runbooks/TASK_NOTIFICATIONS.md)) |
| Escrita | por projeto, com `createMany` e `skipDuplicates`. As decisões (`NotificationDecision`) são gravadas em paralelo com as notificações, só quando mudam; a decisão de uma notificação que não ficou gravada é desfeita ([NOTIFICATION_METRICS.md](NOTIFICATION_METRICS.md)) |
| Falha | a falha de um projeto conta em `failed` e não impede os outros; com `failed > 0`, o processo sai com código 1. Com `--project-id` de projeto inexistente ou excluído, avisa em `stderr` e sai com código 2 |
| Saída | JSON com `dryRun`, `timeZone`, `projects`, `scanned`, `eligible`, `created`, `alreadyNotified`, `excluded` por motivo, `failed`, `durationMs` e, em dry-run, `wouldCreate`. O job não atualiza linhas, e a saída diz isso com `updated: "NOT_APPLICABLE"`. `excluded` tem os quatro motivos do RF59. As contagens valem para a execução e não se somam entre execuções; a métrica é o script `notifications:metrics` |
| Log | `notifications_due_started` (com o fuso), `notifications_due_project_failed` (projeto e código do erro) e `notifications_due_completed` (contagens); nunca título, nome ou e-mail |

## Retenção e privacidade

| Dado | Regra |
| --- | --- |
| Notificação | apagada pelo `privacy:retention` quando `createdAt` passa de `NOTIFICATION_RETENTION_DAYS` (padrão 180) |
| Decisão (`NotificationDecision`) | apagada pelo `privacy:retention` quando `decidedAt` passa do mesmo prazo; a anonimização apaga o destinatário e mantém o resultado; a exclusão da tarefa não a toca |
| Projeto purgado | as notificações do projeto saem por cascata |
| Tarefa excluída | `taskId` vira nulo; o título copiado permanece |
| Ator removido | `actorUserId` vira nulo; o contexto mostra ator ausente |
| Anonimização do titular | apaga as notificações e as preferências dele; como ator, aparece com o nome pseudonimizado |
| Exportação do titular | `notifications.json`, com todas as notificações do titular e `visible` dizendo se ele ainda as vê (as ocultas por membership inativa ou projeto excluído também entram), com tipo, projeto, tarefa, título copiado, status, data do prazo, criação e leitura, sem o ator; `notification-preferences.json`; e `notification-decisions.json`, com as decisões do titular (tipo, chave do evento, projeto, resultado, ocorrência e decisão) |
