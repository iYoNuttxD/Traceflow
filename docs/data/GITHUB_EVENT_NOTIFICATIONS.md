# Notificações de eventos de issues e pull requests — S2-03 (RF60, RF61)

Decisão em [ADR-018](../architecture/ADR-018-GITHUB-EVENT-NOTIFICATIONS.md). Este documento é a
regra executável: o código e os testes seguem exatamente estas tabelas. A central, as preferências
e a visibilidade são as do S2-02 ([Task Notifications](TASK_NOTIFICATIONS.md)).

Revisto em 15/10/2026 (revisão independente da PR #26):
- não há janela;
- a métrica oficial está em [NOTIFICATION_METRICS.md](NOTIFICATION_METRICS.md);
- a fonte durável dos eventos está proposta no
  [ADR-023](../architecture/ADR-023-FONTE-DURAVEL-EVENTOS-GITHUB.md).

## Tipos e eventos

| Tipo da notificação | RF | Eventos | Quando nasce |
| --- | --- | --- | --- |
| `ISSUE_EVENT` | RF60 | `ISSUE_CLOSED`, `ISSUE_REOPENED` | no despacho de um evento de issue vinculada |
| `PULL_REQUEST_EVENT` | RF61 | `PULL_REQUEST_MERGED`, `PULL_REQUEST_CLOSED` | no despacho de um evento de PR vinculada |

`ISSUE_REOPENED` é a "abertura" do RF60: a issue só é vinculada depois de importada (RF12), então a
única abertura observável de uma issue vinculada é a reabertura. O RF60 conta os eventos que
acontecem enquanto a issue está vinculada. A revisão de 15/10/2026 manteve essa leitura (ADR-018 D3).
A abertura e a reabertura de PR não fazem parte do RF61 e não geram evento.

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
| issue | `CLOSED` | `OPEN` | `ISSUE_REOPENED` | `updatedAtGithub` recebido (aproximação: ver "Data da reabertura") |
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

- **Linha de base.** A detecção compara com o estado gravado na sincronização anterior.
  - Conectar um repositório não gera evento, porque todo artefato é uma primeira observação.
  - A primeira sincronização depois da implantação do S2-03 gera evento para as transições
    ocorridas desde a sincronização anterior.
  - Exemplo: a issue vinculada que estava `open` na última sincronização antes da implantação, e
    foi fechada há 2 dias, gera `ISSUE_CLOSED`.
- **Data ausente.** Sem `occurredAt`, a chave usa o instante da detecção.
- **Data anterior ausente.** `CLOSED → CLOSED` com a data anterior nula não gera evento: falta de
  data não prova um fechamento novo.
- **Mudança de título, corpo, rótulo, autor ou branch** não gera evento.
- **Item repetido na mesma página** (paginação por deslocamento) vale uma vez, com o último valor.
- **Limitação.** Só o estado de cada sincronização é observado. Fechar e reabrir uma issue entre
  duas sincronizações não deixa rastro, porque o GitHub devolve `closed_at` nulo na reabertura.
  Reabrir e fechar de novo aparece como fechamento novo (data diferente).
- **Data da reabertura.** A listagem do GitHub não traz o instante da reabertura.
  - O `occurredAt` de `ISSUE_REOPENED` é a última atualização observada (`updatedAtGithub`).
  - Exemplo: a issue reaberta em 09/10, comentada em 19/10 e sincronizada em 20/10 grava 19/10.
  - O cartão diz "reaberta no GitHub; última atualização em 19/10/2026 às 10:00".

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

**Gravação em lote.** Os eventos e os retratos da página são gravados em três instruções, qualquer
que seja o número de transições:
1. um `createMany` dos eventos;
2. a leitura dos ids por `(projectId, occurrenceKey)`;
3. um `createMany` dos retratos.

Somadas a leitura dos vínculos e a pré-leitura das chaves conhecidas, a página com transição faz
até cinco instruções a mais que a página sem transição.

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

| Ordem | Motivo | Quando | Unidade | Grupo na métrica |
| --- | --- | --- | --- | --- |
| 1 | `NO_TASK` | tarefa do retrato excluída antes ou durante o despacho | tarefa | sem destinatário |
| 2 | `NO_PARTICIPANT` | tarefa sem participante | tarefa | sem destinatário |
| 3 | `INACTIVE_ACCOUNT` | conta fora de `ACTIVE` | par | motivo autorizado |
| 4 | `INACTIVE_MEMBER` | sem membership ativa no projeto do evento | par | motivo autorizado |
| 5 | `PREFERENCE_OFF` | preferência do tipo desligada, ou religada depois da detecção | par | motivo autorizado |

- Conta, membership e preferência valem no instante do despacho.
- A preferência é a do tipo (`ISSUE_EVENT` ou `PULL_REQUEST_EVENT`), sem linha = ligada. Vale quando
  `enabledAt` é nulo ou não é posterior a `detectedAt`, a mesma regra do RF59.

**Projeto excluído.** O evento de projeto excluído é despachado como qualquer outro (ADR-018 D11):

- as notificações nascem ocultas pela visibilidade do S2-02 e aparecem com a restauração;
- a purga apaga evento, retrato e notificações, em cascata;
- eventos despachados até 12/10/2026 podem trazer `PROJECT_DELETED` no `outcome`, motivo que deixou
  de existir.

## Sem janela

Desde 15/10/2026, toda transição de artefato vinculado é notificada, qualquer que seja a idade da
ocorrência (Quadros 3-57 e 3-58). A variável `GITHUB_EVENT_NOTIFICATIONS_LOOKBACK_DAYS` e o motivo
`OUTSIDE_WINDOW` saíram. Eventos despachados até 15/10/2026 podem trazer `OUTSIDE_WINDOW` no
`outcome`. A leitura do `outcome` soma as chaves presentes.

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
   não reserva pula o evento (`busy`). Cada reserva soma uma tentativa, inclusive a retomada de uma
   reserva vencida: é essa contagem que leva a `FAILED` o evento que derruba o despachante.
2. **Destinatários:** leituras simples (tarefas, participantes, contas, memberships, preferências).
3. **Gravação:** `createMany` com `skipDuplicates`.
4. **Conferência:** leitura das chaves gravadas. Par de tarefa que deixou de existir conta como
   `NO_TASK`; par que falta sem motivo é falha.
5. **Fechamento:** `UPDATE ... WHERE claimToken = ?` grava `DISPATCHED`, `dispatchedAt` e `outcome`.

Se o processo cai entre a gravação e o fechamento, outro despachante retoma depois de
`claimedUntil`, e a chave única impede duplicata.

**Reserva perdida.** O despachante que perde a reserva não fecha o evento: outro a retomou depois
de `claimedUntil`.
- Ele registra `github_event_notification_claim_lost` e soma em `claimLost`.
- As notificações que ele já gravou contam como `alreadyNotified` no fechamento de quem retomou.

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
- Link do artefato: a URL do GitHub, conferida de novo na saída (prefixo `https://github.com/`), no
  DTO e na exportação. Sem URL válida, não há botão, e a exportação traz `artifactUrl` nulo.
- Nunca entram: token, cabeçalho ou resposta do GitHub, corpo da issue ou PR, login de autor ou
  responsável no GitHub, rótulos, e-mail.

## Métrica oficial (RF60 e RF61)

A métrica segue [NOTIFICATION_METRICS.md](NOTIFICATION_METRICS.md), na unidade do par (tarefa do
retrato, participante):

| Termo | RF60 e RF61 |
| --- | --- |
| Eventos ocorridos (T) | cada transição de artefato vinculado, multiplicada pelos participantes do retrato |
| Enviadas corretamente (E) | pares com `created` ou `alreadyNotified` no `outcome`. `alreadyNotified` é a notificação criada por uma tentativa anterior do mesmo evento, antes de uma retomada; não é duplicata |
| Motivo autorizado (A) | `INACTIVE_ACCOUNT`, `INACTIVE_MEMBER` e `PREFERENCE_OFF` (por par) |
| Sem destinatário (N) | `NO_TASK` e `NO_PARTICIPANT` (por tarefa) |
| Não observados (U) | eventos `PENDING`, `PROCESSING` ou `FAILED` |

**Cobertura total indisponível.** A fonte é a comparação de estado, e as transições intermediárias
não são observadas. Por isso o total de eventos ocorridos é desconhecido, e a cobertura total sai
"indisponível" com o motivo `FONTE_POR_COMPARACAO_DE_ESTADO`. Isso muda com a fonte durável do
ADR-023, proposto. As contagens observadas continuam publicadas.

Usar só `created` subestima o enviado depois de uma retomada: o EV-M-03 da campanha dá 0%.

**`outcome` de cada evento** (forma fixa):
`{tasks, participants, eligible, created, alreadyNotified, excluded: {NO_TASK, NO_PARTICIPANT,
INACTIVE_ACCOUNT, INACTIVE_MEMBER, PREFERENCE_OFF}}`, em que `created + alreadyNotified = eligible`
quando o evento fecha como `DISPATCHED`.
- Eventos despachados até 12/10/2026 podem trazer também `PROJECT_DELETED`, e até 15/10/2026,
  `OUTSIDE_WINDOW`.
- A leitura soma as chaves presentes, sem supor um conjunto fixo.

**Definição (§10.5 do contexto de arquitetura).**

| Item | Definição |
| --- | --- |
| Objetivo | medir se o sistema avisa os usuários envolvidos de toda transição elegível de issue e PR vinculadas (Quadros 3-57 e 3-58) |
| Fórmula | a de [NOTIFICATION_METRICS.md](NOTIFICATION_METRICS.md), por RF, com as contagens por motivo ao lado |
| Dados de origem | `GitHubArtifactEvent` (com `outcome`) e as notificações `ISSUE_EVENT` e `PULL_REQUEST_EVENT` (chave por evento, tarefa e pessoa) |
| Período | intervalo de `detectedAt`, dentro da retenção de 180 dias. Na validação do Capítulo 4 (S3-01), é o período da aplicação |
| Filtros | projeto e tipo. Não há filtro por pessoa na publicação |
| Interpretação | a cobertura elegível de 100% significa que cada participante elegível recebeu exatamente uma notificação correta de cada evento observado. A cobertura total fica "indisponível" enquanto a fonte não observar todas as transições |
| Limitações | (1) só transições observadas: mudanças entre duas sincronizações se fundem (proposta de correção no ADR-023); (2) o autor da ação não é excluído; (3) eventos `PENDING` ou `FAILED` ainda não têm `outcome`; (4) a criação de uma issue nunca é evento (RF12); (5) a data da reabertura é a última atualização observada, não o instante da reabertura |
| Forma de atualização | a cada despacho, no `outcome` do evento. No repositório, os testes M3 e M4 medem um cenário reproduzível |

**Resultado em 12/10/2026 (banco de teste, `s203-github-event-dispatch.test.js`), só como
histórico.** Foi medido sobre os pares elegíveis, com `OUTSIDE_WINDOW` entre as exclusões, regra que
vigorou até 15/10/2026:

| RF | Eventos ocorridos | Notificações esperadas (pares) | Elegíveis | Enviadas corretamente | Cobertura | Exclusões |
| --- | --- | --- | --- | --- | --- | --- |
| RF60 (M3) | 4 | 8 | 4 | 4 | 100% | `OUTSIDE_WINDOW` 1, `INACTIVE_ACCOUNT` 1, `INACTIVE_MEMBER` 1, `PREFERENCE_OFF` 1 (por par); `NO_PARTICIPANT` 1 (por tarefa) |
| RF61 (M4) | 4 | 7 | 3 | 3 | 100% | `OUTSIDE_WINDOW` 1, `INACTIVE_ACCOUNT` 1, `INACTIVE_MEMBER` 1, `PREFERENCE_OFF` 1 (por par); `NO_PARTICIPANT` 1 (por tarefa) |

Nos dois cenários, a issue sem vínculo fechada, a reabertura de PR e a sincronização repetida sem
mudança não são eventos ocorridos. Cada notificação existe uma vez, para o participante certo, e a
soma dos `outcome` coincide com a saída do job. O resultado com dados reais fica para o S3-01.

**Carga sintética no banco de desenvolvimento (12/10/2026), só como histórico, com a janela da
época:**
- **Dados.** O projeto `[S2-01] Escala` recebeu 152 issues, 151 delas vinculadas, e 150 pull requests vinculadas, num total de 301 tarefas. O dono do projeto é responsável por todas. Um segundo membro comentou em 30 delas e registrou esforço em 12, somando 36 tarefas distintas.
- **Transições aplicadas** pelo `upsertMany`:
  - 140 issues fechadas e 10 reabertas;
  - 1 issue fechada há 10 dias, fora da janela de 7 dias;
  - 1 issue sem vínculo, também fechada;
  - 140 pull requests mescladas e 10 fechadas sem merge.

| Etapa | Resultado |
| --- | --- |
| Eventos gravados | 301; a issue sem vínculo não gerou evento |
| Job em `--dry-run` | `wouldCreate` 336; `OUTSIDE_WINDOW` 1 |
| Job em `--apply` | 301 despachados, 336 criadas, 0 falhas, `pendingAfter` 0 |
| Segunda execução | 0 varridos, 0 criadas |
| Por destinatário | dono: 300 (140 issues fechadas, 10 reabertas, 140 PRs mescladas, 10 fechadas sem merge); segundo membro: 36 |
| Soma dos `outcome` | 336 elegíveis = 336 criadas; `OUTSIDE_WINDOW` 1 |
| Cobertura sobre os pares elegíveis | 100% |

## Job

| Item | Regra |
| --- | --- |
| Comando | `npm run notifications:github-events:dry-run` (padrão) e `npm run notifications:github-events` (`--apply`) |
| Produção | exige `--confirm-production` |
| Escopo | todos os projetos, ou `--project-id=<id>` |
| Reprocessamento | `--retry-failed`, junto com `--apply`, devolve os `FAILED` à fila; em dry-run, só conta |
| Frequência | a cada 15 minutos, por agendador externo ([runbook](../runbooks/GITHUB_EVENT_NOTIFICATIONS.md)) |
| Saída | JSON só no `stdout`, com `dryRun`, `projects`, `scanned`, `claimed`, `busy`, `claimLost`, `dispatched`, `created`, `alreadyNotified`, `excluded` por motivo, `retryScheduled`, `failed`, `failedStock`, `pendingAfter`, `dueAfter`, `oldestDueAgeSeconds`, `durationMs` e `database`; `wouldCreate` em dry-run; `requeued` ou `wouldRequeue` com `--retry-failed` |
| Estoque | `failedStock` conta os eventos `FAILED` no escopo da execução, em toda execução, até o reprocessamento ou a retenção |
| Pendência vencida | `dueAfter` conta os eventos `PENDING` com `nextAttemptAt` vencido e os `PROCESSING` com reserva vencida. `oldestDueAgeSeconds` é há quanto tempo o mais antigo deles venceu, ou `null`. Evento na espera normal de retentativa não conta |
| Código de saída | 0 sem falha; 1 quando alguma tentativa falhou ou a execução não começou; 2 com `--project-id` de projeto inexistente ou excluído |
| Log | em `stderr`: `github_event_notifications_dispatch_completed` (em `warn` quando há falha ou estoque de `FAILED`), `github_event_notification_attempt_failed`, `github_event_notification_failed` e `github_event_notification_claim_lost`; nunca título, URL, login, nome ou e-mail |

## Retenção e privacidade

| Dado | Regra |
| --- | --- |
| Notificação | a do S2-02: 180 dias (`NOTIFICATION_RETENTION_DAYS`), apagada na anonimização do titular, exportada com os campos novos e a URL conferida de novo |
| Evento da fila | `DISPATCHED` ou `FAILED` com `detectedAt` acima de `NOTIFICATION_RETENTION_DAYS` é apagado pelo `privacy:retention`; `PENDING` e `PROCESSING` nunca são apagados por idade |
| Projeto purgado | eventos, retrato e notificações saem por cascata |
| Artefato apagado | `issueId` ou `pullRequestId` vira nulo; o snapshot permanece |
| Tarefa excluída | sai do retrato; na notificação já criada, `taskId` vira nulo e o título copiado permanece |
