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
| 3 | `INACTIVE_ACCOUNT`: conta do responsável desativada, com exclusão pendente ou anonimizada | `INACTIVE_ACCOUNT`: conta do responsável desativada, com exclusão pendente ou anonimizada |
| 4 | `INACTIVE_MEMBER`: responsável sem membership ativa no projeto | `INACTIVE_MEMBER`: responsável sem membership ativa no projeto |
| 5 | `PREFERENCE_OFF`: o responsável desligou o tipo | `PREFERENCE_OFF`: o responsável desligou o tipo, ou o religou depois do corte |

`OUTSIDE_WINDOW`, `NO_RESPONSIBLE`, `SELF_CHANGE`, `INACTIVE_ACCOUNT` e `INACTIVE_MEMBER` são
**exclusões por regra**. `PREFERENCE_OFF` é **exclusão por escolha** do usuário. Reativar a conta,
voltar ao projeto ou religar o tipo não recupera o que foi excluído.

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

**Diferença com a tela.** O Kanban marca "Atrasada" comparando a data do prazo com a data de hoje
no fuso do navegador; a notificação usa `APP_TIMEZONE`. Para quem está fora do fuso de referência,
os dois discordam por algumas horas. Com prazo `2026-10-10` e `APP_TIMEZONE=America/Sao_Paulo`
(corte em `2026-10-11T03:00:00.000Z`):
- em `Pacific/Kiritimati` (+14), a tela marca "Atrasada" em `2026-10-10T10:00:00.000Z`, 17 h
  antes do corte;
- em `Pacific/Pago_Pago` (−11), em `2026-10-11T11:00:00.000Z`, 8 h depois.

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
- No RF59, a notificação nasce no job, depois do corte. Por isso a preferência guarda `enabledAt`,
  o instante da última passagem de desligada para ligada (nulo se nunca foi desligada). Vencimento
  com corte anterior a `enabledAt` conta como `PREFERENCE_OFF`. Exemplo com prazo `2026-10-15`
  (corte em `2026-10-16T03:00:00.000Z`):
  - desligada antes do corte e religada em `2026-10-17T12:00:00.000Z`: nenhuma notificação para
    esse prazo;
  - desligada e religada antes do corte: a notificação nasce na execução seguinte ao corte.
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
- No filtro Não lidas, o item marcado como lido continua na tela, com o estado de lida, até
  recarregar. Assim dá para desfazer.

## Métrica oficial (RF30 e RF59)

Critério dos Quadros 3-55 e 3-56: `(notificações enviadas corretamente / total de eventos
ocorridos) × 100`.

| Termo | RF30 | RF59 |
| --- | --- | --- |
| Evento ocorrido | cada `TaskMovement` | cada par (tarefa, data do prazo) cujo corte passou com a tarefa fora de `CONCLUIDO` |
| Exclusão por regra | `NO_RESPONSIBLE`, `SELF_CHANGE`, `INACTIVE_ACCOUNT`, `INACTIVE_MEMBER` | `OUTSIDE_WINDOW`, `NO_RESPONSIBLE`, `INACTIVE_ACCOUNT`, `INACTIVE_MEMBER` |
| Exclusão por escolha | `PREFERENCE_OFF` | `PREFERENCE_OFF` |
| Evento elegível | evento ocorrido sem exclusão | evento ocorrido sem exclusão |
| Enviada corretamente | criada uma vez, para o responsável, com origem, destino e ator corretos, link válido e visível só a ele | criada uma vez, para o responsável, com a data do prazo correta, link válido e visível só a ele |

**Cálculo.** `cobertura = enviadas corretamente / eventos elegíveis × 100`, publicada sempre ao lado
das exclusões por motivo. O valor nunca aparece sem as exclusões.

**Definição (§10.5 do contexto de arquitetura).**

| Item | Definição |
| --- | --- |
| Objetivo | medir se o sistema avisa o responsável de todo evento elegível do RF30 e do RF59 (Quadros 3-55 e 3-56) |
| Fórmula | a do cálculo acima, por RF, com as exclusões por motivo ao lado |
| Dados de origem | RF30: `TaskMovement` e as notificações `TASK_STATUS_CHANGED` (chave por movimento). RF59: os pares (tarefa, data do prazo) cujo corte passou com a tarefa fora de `CONCLUIDO`, e as notificações `TASK_OVERDUE` (chave por par e destinatário) |
| Período | intervalo fechado de datas, no fuso `APP_TIMEZONE`. O RF30 conta pelo instante do movimento; o RF59, pelo instante do corte. Na validação do Capítulo 4 (S3-01), é o período da aplicação |
| Filtros | projeto (um ou todos os não excluídos) e tipo. Não há filtro por pessoa na publicação, para não expor dado pessoal |
| Interpretação | 100% significa que todo evento elegível gerou uma notificação correta. Abaixo disso, cada evento sem notificação é defeito a investigar. As exclusões não são falhas: mostram o que a regra ou a escolha do usuário retirou |
| Limitações | (1) as contagens do job são retratos de cada execução e **não se somam**: a mesma tarefa aparece como elegível em várias execuções, e `excluded.OUTSIDE_WINDOW` conta, a cada execução, toda tarefa aberta com corte antes da janela, notificada ou não; (2) o RF59 depende do agendador (até 15 min de atraso; sem agendador, só roda à mão); (3) o fuso é único; (4) tarefa vencida há mais que a janela na primeira execução não vira evento elegível; (5) a medição lê o estado atual: prazo ou conclusão mudados depois alteram os pares |
| Forma de atualização | sob demanda. No repositório, os testes M1 e M2 (cenário reproduzível). Com dados reais, a medição por pares distintos é entregue ao S3-01 (S202-F05); somar as saídas do job não é medição |

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
| Falha | a falha de um projeto conta em `failed` e não impede os outros; com `failed > 0`, o processo sai com código 1. Com `--project-id` de projeto inexistente ou excluído, avisa em `stderr` e sai com código 2 |
| Saída | JSON com `dryRun`, `timeZone`, `lookbackDays`, `projects`, `scanned`, `eligible`, `created`, `alreadyNotified`, `excluded` por motivo, `failed`, `durationMs` e, em dry-run, `wouldCreate`. O job não atualiza linhas, e a saída diz isso com `updated: "NOT_APPLICABLE"`. `excluded` tem os cinco motivos do RF59. As contagens valem para a execução e não se somam entre execuções |
| Log | `notifications_due_started` (com o fuso), `notifications_due_project_failed` (projeto e código do erro) e `notifications_due_completed` (contagens); nunca título, nome ou e-mail |

## Retenção e privacidade

| Dado | Regra |
| --- | --- |
| Notificação | apagada pelo `privacy:retention` quando `createdAt` passa de `NOTIFICATION_RETENTION_DAYS` (padrão 180) |
| Projeto purgado | as notificações do projeto saem por cascata |
| Tarefa excluída | `taskId` vira nulo; o título copiado permanece |
| Ator removido | `actorUserId` vira nulo; o contexto mostra ator ausente |
| Anonimização do titular | apaga as notificações e as preferências dele; como ator, aparece com o nome pseudonimizado |
| Exportação do titular | `notifications.json`, com todas as notificações do titular e `visible` dizendo se ele ainda as vê (as ocultas por membership inativa ou projeto excluído também entram), com tipo, projeto, tarefa, título copiado, status, data do prazo, criação e leitura, sem o ator; e `notification-preferences.json` |
