# Notificações de eventos de issues e pull requests — S2-03 (RF60, RF61)

Decisão em [ADR-018](../architecture/ADR-018-GITHUB-EVENT-NOTIFICATIONS.md). Este documento é a
regra executável: o código e os testes seguem exatamente estas tabelas. A central, as preferências
e a visibilidade são as do S2-02 ([Task Notifications](TASK_NOTIFICATIONS.md)).

## Tipos e eventos

| Tipo da notificação | RF | Eventos | Quando nasce |
| --- | --- | --- | --- |
| `ISSUE_EVENT` | RF60 | `ISSUE_CLOSED`, `ISSUE_REOPENED` | no despacho de um evento de issue vinculada |
| `PULL_REQUEST_EVENT` | RF61 | `PULL_REQUEST_MERGED`, `PULL_REQUEST_CLOSED` | no despacho de um evento de PR vinculada |

`ISSUE_REOPENED` é a "abertura" do RF60: a issue só é vinculada depois de importada (RF12), então a
única abertura observável de uma issue vinculada é a reabertura. A abertura e a reabertura de PR não
fazem parte do RF61 e não geram evento.

## Estados

| Artefato | Valor gravado | Estado |
| --- | --- | --- |
| issue | `state = open` | `OPEN` |
| issue | `state = closed` | `CLOSED` |
| PR | `state = open` | `OPEN` |
| PR | `state = closed` e `mergedAtGithub` preenchido | `MERGED` |
| PR | `state = closed` e `mergedAtGithub` nulo | `CLOSED` |
| qualquer | outro valor ou nulo | desconhecido |

A comparação ignora maiúsculas e minúsculas e não converte tipos.

## Transições

A detecção compara a linha gravada antes da página com o item recebido do GitHub, na mesma
transação que grava a página.

| Artefato | Anterior | Recebido | Evento | `occurredAt` |
| --- | --- | --- | --- | --- |
| issue | `OPEN` | `CLOSED` | `ISSUE_CLOSED` | `closedAtGithub` recebido |
| issue | `CLOSED` | `OPEN` | `ISSUE_REOPENED` | `updatedAtGithub` recebido |
| issue | `CLOSED` | `CLOSED`, as duas datas de fechamento preenchidas e diferentes | `ISSUE_CLOSED` | `closedAtGithub` recebido |
| PR | `OPEN` | `MERGED` | `PULL_REQUEST_MERGED` | `mergedAtGithub` recebido |
| PR | `OPEN` | `CLOSED` | `PULL_REQUEST_CLOSED` | `closedAtGithub` recebido |
| PR | `CLOSED` | `MERGED` | `PULL_REQUEST_MERGED` | `mergedAtGithub` recebido |
| PR | `CLOSED` | `CLOSED`, as duas datas de fechamento preenchidas e diferentes | `PULL_REQUEST_CLOSED` | `closedAtGithub` recebido |
| PR | `CLOSED` | `OPEN` | nenhum | — |
| PR | `MERGED` | `OPEN` ou `CLOSED` | nenhum; conta como anomalia no log | — |
| qualquer | linha nova (primeira observação) | qualquer | nenhum | — |
| qualquer | desconhecido, ou recebido desconhecido | qualquer | nenhum | — |
| qualquer | mesmo estado e mesma data de fechamento | — | nenhum | — |

- **Linha de base.** Conectar um repositório e a primeira sincronização depois da implantação não
  geram evento: o estado gravado é o ponto de partida.
- **Data ausente.** Sem `occurredAt`, a chave e a janela usam o instante da detecção.
- **Data anterior ausente.** `CLOSED → CLOSED` com a data anterior nula não gera evento: falta de
  data não prova um fechamento novo.
- **Mudança de título, corpo, rótulo, autor ou branch** não gera evento.
- **Item repetido na mesma página** (paginação por deslocamento) vale uma vez, com o último valor.
- **Limitação.** Só o estado de cada sincronização é observado. Fechar e reabrir uma issue entre
  duas sincronizações não deixa rastro, porque o GitHub devolve `closed_at` nulo na reabertura.
  Reabrir e fechar de novo aparece como fechamento novo (data diferente).

Exemplos (issue #45 vinculada à tarefa 7):

| Sincronização | Recebido | Evento |
| --- | --- | --- |
| 1 | `open` | nenhum (linha de base) |
| 2 | `closed`, `closedAtGithub = 2026-10-12T13:00:00Z` | `ISSUE_CLOSED`, ocorrido em `2026-10-12T13:00:00Z` |
| 3 | o mesmo | nenhum |
| 4 | `open`, `updatedAtGithub = 2026-10-12T15:00:00Z` | `ISSUE_REOPENED`, ocorrido em `2026-10-12T15:00:00Z` |
| 5 | `closed`, `closedAtGithub = 2026-10-12T16:00:00Z` | `ISSUE_CLOSED`, ocorrido em `2026-10-12T16:00:00Z` |

## Vínculos (retrato)

- Na mesma transação da detecção, são lidas as tarefas vinculadas: `TaskIssue` da issue e
  `Task.pullRequestId` da PR, só do projeto do artefato.
- O retrato é gravado com o evento (`GitHubArtifactEventTask`), junto com `linkedTaskCount`, o número
  de tarefas vinculadas na detecção. O despacho usa o retrato, nunca os vínculos do momento.
- Artefato sem tarefa vinculada não gera evento: é o alerta do S2-01 (RF39, RF40).
- Vínculo criado depois da transição não recebe aviso dela. Vínculo removido depois da detecção não
  tira a tarefa do retrato.
- Tarefa excluída sai do retrato por cascata.

## Fila de eventos

`GitHubArtifactEvent`, uma linha por transição de artefato vinculado:

| Campo | Conteúdo |
| --- | --- |
| `type` | um dos quatro eventos |
| `issueId` ou `pullRequestId` | o artefato (FK `SetNull`); exatamente um preenchido na gravação |
| `artifactNumber`, `artifactTitle`, `artifactUrl` | snapshot: número, título com até 256 caracteres, URL só com o prefixo `https://github.com/` e até 512 caracteres |
| `occurredAt`, `detectedAt` | instante da ocorrência no GitHub e da detecção |
| `linkedTaskCount` | tarefas vinculadas na detecção |
| `occurrenceKey` | `<evento>:<id do artefato no TraceFlow>:<occurredAt ISO, ou detectedAt>`; única por projeto |
| `status`, `attempts`, `nextAttemptAt`, `claimToken`, `claimedUntil`, `lastErrorCode`, `dispatchedAt` | despacho |
| `outcome` | resultado do despacho (seção "Métrica oficial") |

**Tudo ou nada.** Evento, retrato e estado novo do artefato persistem na mesma transação. Se ela cai,
nada persiste, e a sincronização seguinte detecta a transição uma vez. O índice único da ocorrência
é a rede de segurança: uma violação derruba a página, nunca vira duplicata.

## Destinatários e exclusões

**Participantes de cada tarefa do retrato**, lidos no despacho:

- o responsável (`Task.responsibleUserId`);
- quem tem comentário não excluído na tarefa (`TaskComment.authorUserId`, `deletedAt` nulo);
- quem registrou esforço na tarefa (`TaskTimeEntry.startedById`).

A mesma pessoa em mais de um papel conta uma vez por tarefa. Quem fechou ou mesclou no GitHub não é
excluído: a listagem do GitHub não diz quem foi.

**Unidade.** A notificação esperada é o par (tarefa do retrato, participante). Uma PR vinculada a
duas tarefas da mesma pessoa gera duas notificações, uma por tarefa.

**Exclusões**, na ordem; a primeira que vale é o motivo registrado:

| Ordem | Motivo | Quando | Unidade | Classe |
| --- | --- | --- | --- | --- |
| 1 | `NO_TASK` | tarefa do retrato excluída antes ou durante o despacho | tarefa | regra |
| 2 | `NO_PARTICIPANT` | tarefa sem participante | tarefa | regra |
| 3 | `PROJECT_DELETED` | projeto excluído | par | regra |
| 4 | `OUTSIDE_WINDOW` | ocorrência fora da janela (seção "Janela") | par | regra |
| 5 | `INACTIVE_ACCOUNT` | conta fora de `ACTIVE` | par | regra |
| 6 | `INACTIVE_MEMBER` | sem membership ativa no projeto do evento | par | regra |
| 7 | `PREFERENCE_OFF` | preferência do tipo desligada, ou religada depois da detecção | par | escolha |

- Conta, membership e preferência valem no instante do despacho.
- A preferência é a do tipo (`ISSUE_EVENT` ou `PULL_REQUEST_EVENT`), sem linha = ligada. Vale quando
  `enabledAt` é nulo ou não é posterior a `detectedAt`, a mesma regra do RF59.

## Janela

Uma transição é notificável quando `occurredAt >= detectedAt − GITHUB_EVENT_NOTIFICATIONS_LOOKBACK_DAYS`
(padrão 7 dias, de 1 a 90). A janela compara a ocorrência com a detecção, não com o despacho:
retentativas não empurram o evento para fora.

Com detecção em `2026-10-20T12:00:00.000Z` e janela de 7 dias:

| `occurredAt` | Resultado |
| --- | --- |
| `2026-10-13T12:00:00.000Z` | dentro (exatamente 7 dias) |
| `2026-10-13T11:59:59.999Z` | fora (`OUTSIDE_WINDOW`) |
| nulo | dentro (usa a detecção) |

## Chave da notificação

`<tipo>:event:<eventId>:task:<taskId>`, por exemplo `ISSUE_EVENT:event:12:task:7`, no índice único
`(recipientUserId, dedupeKey)`.

| Situação | Resultado |
| --- | --- |
| Sincronizar de novo sem mudança | nenhum evento novo |
| Despachar o mesmo evento de novo, ou dois despachos ao mesmo tempo | nenhuma notificação nova |
| Fechar, reabrir e fechar a issue em três sincronizações | três eventos, três rodadas de notificação |
| PR vinculada a duas tarefas do mesmo responsável | duas notificações, uma por tarefa |
| Pessoa responsável e autora de comentário na mesma tarefa | uma notificação |

## Ciclo de vida do evento

| Estado | Significado | Próximo |
| --- | --- | --- |
| `PENDING` | aguardando despacho a partir de `nextAttemptAt` | `PROCESSING` na reserva |
| `PROCESSING` | reservado por um despachante até `claimedUntil` (2 minutos) | `DISPATCHED`; `PENDING` com nova espera; `FAILED`; ou nova reserva depois de `claimedUntil` |
| `DISPATCHED` | processado: notificações criadas ou exclusões registradas em `outcome` | — |
| `FAILED` | cinco tentativas sem sucesso | `PENDING` pelo reprocessamento manual |

**Despacho de um evento**, sem transação interativa:

1. **Reserva:** um `UPDATE` condicional marca `PROCESSING`, grava um `claimToken`, `claimedUntil =
   agora + 2 min` e soma 1 em `attempts`. Pode reservar quem acha o evento `PENDING` com
   `nextAttemptAt` vencido, ou `PROCESSING` com `claimedUntil` vencido e menos de 5 tentativas. Quem
   não reserva pula o evento (`busy`).
2. **Destinatários:** leituras simples (tarefas, participantes, contas, memberships, preferências).
3. **Gravação:** `createMany` com `skipDuplicates`.
4. **Conferência:** leitura das chaves gravadas. Par de tarefa que deixou de existir conta como
   `NO_TASK`; par que falta sem motivo é falha.
5. **Fechamento:** `UPDATE ... WHERE claimToken = ?` grava `DISPATCHED`, `dispatchedAt` e `outcome`.

Se o processo cai entre a gravação e o fechamento, outro despachante retoma depois de
`claimedUntil`, e a chave única impede duplicata.

**Retentativas.** Erro no despacho devolve o evento a `PENDING`, com `lastErrorCode` e a espera
abaixo. Na quinta tentativa sem sucesso, o evento vira `FAILED`. Um `PROCESSING` vencido que já teve
5 tentativas também vira `FAILED` (`DISPATCH_INTERRUPTED`).

| Tentativa que falhou | Próxima tentativa |
| --- | --- |
| 1 | 1 minuto depois |
| 2 | 5 minutos depois |
| 3 | 30 minutos depois |
| 4 | 120 minutos depois |
| 5 | nenhuma: `FAILED` |

**Reprocessamento manual.** `--retry-failed --apply` devolve os eventos `FAILED` (todos ou de um
projeto) a `PENDING`, com `attempts = 0`, e grava o evento de auditoria
`GITHUB_EVENT_NOTIFICATIONS_REQUEUED` com a contagem.

## Onde o despacho roda

| Onde | Escopo | Falha |
| --- | --- | --- |
| Logo depois de cada execução de sincronização, com sucesso ou falha | o projeto sincronizado, até 100 eventos | registrada como aviso; nunca muda o resultado da sincronização |
| Job `npm run notifications:github-events`, a cada 15 minutos por agendador externo | todos os projetos (ou `--project-id`), até 10 lotes de 100 eventos por execução | tentativa falha volta a `PENDING` ou vira `FAILED`; o job sai com código 1 |

## Conteúdo e links

| Campo da notificação | Origem |
| --- | --- |
| `taskId`, `taskTitle` | tarefa do retrato; título copiado com até 191 caracteres |
| `githubEvent` | evento |
| `artifactNumber`, `artifactTitle`, `artifactUrl` | snapshot do evento |
| `githubOccurredAt` | `occurredAt` do evento |
| `actorUserId` | sempre nulo |

- Link da tarefa: `/projects/<projectId>/kanban?task=<taskId>`, como no S2-02.
- Link do artefato: a URL do GitHub, conferida de novo na saída (prefixo `https://github.com/`).
  Sem URL válida, não há botão.
- Nunca entram: token, cabeçalho ou resposta do GitHub, corpo da issue ou PR, login de autor ou
  responsável no GitHub, rótulos, e-mail.

## Métrica oficial (RF60 e RF61)

Critério dos Quadros 3-57 e 3-58: `(notificações enviadas corretamente / total de eventos
ocorridos) × 100`.

| Termo | RF60 | RF61 |
| --- | --- | --- |
| Evento ocorrido | cada transição registrada de issue vinculada (`ISSUE_CLOSED`, `ISSUE_REOPENED`) | cada transição registrada de PR vinculada (`PULL_REQUEST_MERGED`, `PULL_REQUEST_CLOSED`) |
| Notificação esperada | cada par (tarefa do retrato, participante) de um evento ocorrido | idem |
| Exclusão por regra | `NO_TASK`, `NO_PARTICIPANT` (por tarefa); `PROJECT_DELETED`, `OUTSIDE_WINDOW`, `INACTIVE_ACCOUNT`, `INACTIVE_MEMBER` (por par) | idem |
| Exclusão por escolha | `PREFERENCE_OFF` (por par) | idem |
| Elegível | par sem exclusão | idem |
| Enviada corretamente | criada uma vez, para o participante certo, com tarefa, artefato, evento, data e links certos, e visível só a ele | idem |

**Cálculo.** `cobertura = enviadas corretamente / elegíveis × 100`, publicada sempre ao lado do número
de eventos ocorridos e das exclusões por motivo.

**`outcome` de cada evento** (forma fixa):
`{tasks, participants, eligible, created, alreadyNotified, excluded: {NO_TASK, NO_PARTICIPANT,
PROJECT_DELETED, OUTSIDE_WINDOW, INACTIVE_ACCOUNT, INACTIVE_MEMBER, PREFERENCE_OFF}}`, em que
`created + alreadyNotified = eligible` quando o evento fecha como `DISPATCHED`.

**Definição (§10.5 do contexto de arquitetura).**

| Item | Definição |
| --- | --- |
| Objetivo | medir se o sistema avisa os usuários envolvidos de toda transição elegível de issue e PR vinculadas (Quadros 3-57 e 3-58) |
| Fórmula | a do cálculo acima, por RF, com as exclusões por motivo ao lado |
| Dados de origem | `GitHubArtifactEvent` (com `outcome`) e as notificações `ISSUE_EVENT` e `PULL_REQUEST_EVENT` (chave por evento, tarefa e pessoa) |
| Período | intervalo de `detectedAt`, dentro da retenção de 180 dias. Na validação do Capítulo 4 (S3-01), é o período da aplicação |
| Filtros | projeto e tipo. Não há filtro por pessoa na publicação |
| Interpretação | 100% significa que cada participante elegível recebeu exatamente uma notificação correta de cada evento. Abaixo disso, cada par sem notificação é defeito a investigar. As exclusões não são falhas |
| Limitações | (1) só transições observadas: mudanças entre duas sincronizações se fundem; (2) o autor da ação não é excluído; (3) eventos `PENDING` ou `FAILED` ainda não têm `outcome`; (4) a criação de uma issue nunca é evento |
| Forma de atualização | a cada despacho, no `outcome` do evento. No repositório, os testes M3 e M4 medem um cenário reproduzível |

**Resultado em 12/10/2026 (banco de teste, `s203-github-event-dispatch.test.js`):**

| RF | Eventos ocorridos | Notificações esperadas (pares) | Elegíveis | Enviadas corretamente | Cobertura | Exclusões |
| --- | --- | --- | --- | --- | --- | --- |
| RF60 (M3) | 4 | 8 | 4 | 4 | 100% | `OUTSIDE_WINDOW` 1, `INACTIVE_ACCOUNT` 1, `INACTIVE_MEMBER` 1, `PREFERENCE_OFF` 1 (por par); `NO_PARTICIPANT` 1 (por tarefa) |
| RF61 (M4) | 4 | 7 | 3 | 3 | 100% | `OUTSIDE_WINDOW` 1, `INACTIVE_ACCOUNT` 1, `INACTIVE_MEMBER` 1, `PREFERENCE_OFF` 1 (por par); `NO_PARTICIPANT` 1 (por tarefa) |

Nos dois cenários, a issue sem vínculo fechada, a reabertura de PR e a sincronização repetida sem
mudança não são eventos ocorridos. Cada notificação existe uma vez, para o participante certo, e a
soma dos `outcome` coincide com a saída do job. O resultado com dados reais fica para o S3-01.

## Job

| Item | Regra |
| --- | --- |
| Comando | `npm run notifications:github-events:dry-run` (padrão) e `npm run notifications:github-events` (`--apply`) |
| Produção | exige `--confirm-production` |
| Escopo | todos os projetos, ou `--project-id=<id>` |
| Reprocessamento | `--retry-failed`, junto com `--apply`, devolve os `FAILED` à fila; em dry-run, só conta |
| Frequência | a cada 15 minutos, por agendador externo ([runbook](../runbooks/GITHUB_EVENT_NOTIFICATIONS.md)) |
| Saída | JSON com `dryRun`, `lookbackDays`, `projects`, `scanned`, `claimed`, `busy`, `dispatched`, `created`, `alreadyNotified`, `excluded` por motivo, `retryScheduled`, `failed`, `pendingAfter`, `oldestPendingAgeSeconds`, `durationMs` e `database`; `wouldCreate` em dry-run; `requeued` ou `wouldRequeue` com `--retry-failed` |
| Código de saída | 0 sem falha; 1 quando alguma tentativa falhou ou a execução não começou; 2 com `--project-id` de projeto inexistente ou excluído |
| Log | `github_event_notifications_dispatch_completed`, `github_event_notification_attempt_failed`, `github_event_notification_failed`; nunca título, URL, login, nome ou e-mail |

## Retenção e privacidade

| Dado | Regra |
| --- | --- |
| Notificação | a do S2-02: 180 dias (`NOTIFICATION_RETENTION_DAYS`), apagada na anonimização do titular, exportada com os campos novos |
| Evento da fila | `DISPATCHED` ou `FAILED` com `detectedAt` acima de `NOTIFICATION_RETENTION_DAYS` é apagado pelo `privacy:retention`; `PENDING` e `PROCESSING` nunca são apagados por idade |
| Projeto purgado | eventos, retrato e notificações saem por cascata |
| Artefato apagado | `issueId` ou `pullRequestId` vira nulo; o snapshot permanece |
| Tarefa excluída | sai do retrato; na notificação já criada, `taskId` vira nulo e o título copiado permanece |
