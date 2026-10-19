# Notificações de eventos de issues e pull requests — S2-03 (RF60, RF61)

Decisão em [ADR-018](../architecture/ADR-018-GITHUB-EVENT-NOTIFICATIONS.md). Este documento é a
regra executável: o código e os testes seguem exatamente estas tabelas. A central, as preferências
e a visibilidade são as do S2-02 ([Task Notifications](TASK_NOTIFICATIONS.md)).

Revisto em 15/10/2026 (revisão independente da PR #26):
- não há janela;
- a métrica oficial está em [NOTIFICATION_METRICS.md](NOTIFICATION_METRICS.md).

Revisto em 17/10/2026 (segunda revisão independente):
- a fonte é o histórico de eventos do repositório
  ([ADR-023](../architecture/ADR-023-FONTE-DURAVEL-EVENTOS-GITHUB.md));
- a abertura (`ISSUE_OPENED`) nasce no vínculo de issue aberta;
- o vínculo vale no instante do evento;
- a cobertura total é calculada no trecho coberto;
- o despacho é retomado pelo worker a cada 5 minutos.

Revisto em 18/10/2026 (terceira revisão independente):
- o `closed` só é absorvido pelo merge quando é o fechamento par dele (ADR-023 D5);
- a associação de issue aberta (`ISSUE_LINKED`) substitui o `ISSUE_OPENED`, com o instante do vínculo
  e contagem à parte (ADR-023 D6);
- a cobertura é presumida, e a métrica confere a aquisição pelo retrato (ADR-023 D7 e D8);
- o despacho do worker não reivindica evento depois do sinal de parada (ADR-024 D7).

## Tipos e eventos

| Tipo da notificação | RF | Eventos | Quando nasce |
| --- | --- | --- | --- |
| `ISSUE_EVENT` | RF60 | `ISSUE_LINKED`, `ISSUE_CLOSED`, `ISSUE_REOPENED` | no despacho de um evento de issue vinculada |
| `PULL_REQUEST_EVENT` | RF61 | `PULL_REQUEST_MERGED`, `PULL_REQUEST_CLOSED` | no despacho de um evento de PR vinculada |

A "abertura" do RF60 tem duas formas, contadas em separado:
- `ISSUE_REOPENED`: a reabertura de uma issue vinculada, evento do ciclo de vida;
- `ISSUE_LINKED`: a associação, quando uma issue **aberta** passa a estar vinculada a uma tarefa. O
  TraceFlow não cria issues, e o RF12 só vincula issue importada: a abertura de uma issue que já está
  vinculada não acontece (ADR-018 D3, ADR-023 D6).

A abertura e a reabertura de PR não fazem parte do RF61 e não geram evento.

## Estados

O estado gravado de cada artefato continua sendo atualizado pela sincronização, mas não gera evento
desde 17/10/2026. Ele só serve para a anomalia: uma PR `MERGED` que volta a `OPEN` ou `CLOSED` conta
no log `github_pull_request_state_anomaly`.

## Eventos do GitHub

**Fonte.** `GET /repos/{owner}/{repo}/issues/events`, lido por inteiro em toda sincronização, numa
etapa depois das issues. A ordem da listagem não é documentada, e nada depende dela: a leitura é
completa e a deduplicação é pelo id do GitHub.

| Evento do GitHub | Artefato | Registro | Evento de notificação | `occurredAt` |
| --- | --- | --- | --- | --- |
| `closed` | issue | `IssueLifecycleEvent` | `ISSUE_CLOSED` | `created_at` do evento |
| `reopened` | issue | `IssueLifecycleEvent` | `ISSUE_REOPENED` | `created_at` do evento |
| `merged` | PR | `PullRequestLifecycleEvent` | `PULL_REQUEST_MERGED` | `created_at` do evento |
| `closed` | PR | `PullRequestLifecycleEvent` | `PULL_REQUEST_CLOSED`, salvo o `closed` do merge | `created_at` do evento |
| `reopened` | PR | `PullRequestLifecycleEvent` | nenhum | — |
| qualquer outro | qualquer | nenhum | nenhum | — |

- **Merge.** O `closed` só faz parte do merge, e não vira `PULL_REQUEST_CLOSED`, quando é o
  fechamento par dele (ADR-023 D5):
  - existe `merged` da mesma PR a até 5 s;
  - nenhum `reopened` da mesma PR está entre os dois, pela ordem do instante e, no mesmo segundo, do
    `id` do evento, comparado como número;
  - cada `merged` absorve no máximo um `closed`, o mais próximo.

  Quando o merge só aparece no retrato (`mergedAtGithub`, sem evento), um `reopened` no mesmo segundo
  impede a absorção. A política lê o histórico gravado da PR na janela, inclusive o de sincronizações
  anteriores. A regra funciona com ou sem o `closed` do merge.
- **Identidade.** O `providerEventId` (o `id` do evento no GitHub) é único por projeto nas duas
  tabelas. Reler a lista não duplica nada.
- **Evento sem artefato.** Evento de issue ou PR que não está gravada (transferida ou apagada) é
  ignorado, com os logs `github_issue_lifecycle_orphan` e `github_pr_lifecycle_orphan`. Ele não trava a cobertura, porque nenhuma
  tarefa pode estar vinculada a um artefato que não existe no TraceFlow.
- **Corte.** Só gera notificação o evento com `occurredAt` a partir do `coverageFrom` do projeto
  (`GitHubEventCoverage`):
  - integração existente em 17/10/2026: o instante da migration;
  - integração nova: o início da primeira leitura.

  Conectar um repositório não avisa o histórico, e os eventos que a comparação de estado gravou
  antes do corte não se duplicam.
- **Leitura incompleta.** Se uma página falha, nada daquela leitura é gravado e `completeThrough`
  não anda. A sincronização seguinte relê tudo.
- **Sincronização que falha antes.** A leitura dos eventos roda depois das issues, dentro da etapa
  `ISSUES` do progresso. Se uma etapa anterior falha, os eventos daquela sincronização vêm na
  seguinte, sem perda.
- **Leitura completa.** Os registros, os eventos de notificação e os alvos gravam numa transação,
  com a trava do projeto. `completeThrough` passa a ser o início da leitura menos 5 minutos.
- **Associação.** `ISSUE_LINKED` nasce na transação do vínculo, com `occurredAt` igual ao instante
  do vínculo (`detectedAt`). É uma vez por par (issue, tarefa), com a chave
  `linked:<issueId>:task:<taskId>`. Issue fechada no instante do vínculo não gera associação. Até
  18/10/2026 o evento era `ISSUE_OPENED`, com a data de criação da issue e a chave `opened:`; a
  migration `issue_linked_event` converteu as linhas antigas.

Exemplos (issue #45 vinculada à tarefa 7 desde 10/10/2026, sincronizada às 12:00 e às 18:00 de
12/10/2026):

| Entre as sincronizações | Eventos lidos | Eventos de notificação |
| --- | --- | --- |
| fechada às 13:00 e reaberta às 15:00 | `closed` 13:00, `reopened` 15:00 | `ISSUE_CLOSED` 13:00 e `ISSUE_REOPENED` 15:00 |
| nada mudou | os mesmos de antes | nenhum |
| PR #9 fechada às 13:00, reaberta às 14:00 e mesclada às 16:00 | `closed` 13:00, `reopened` 14:00, `merged` 16:00 e `closed` 16:00 | `PULL_REQUEST_CLOSED` 13:00 e `PULL_REQUEST_MERGED` 16:00 |
| PR #10 fechada às 13:00:00, reaberta às 13:00:01 e mesclada às 13:00:04 | `closed` 13:00:00, `reopened` 13:00:01, `merged` 13:00:04 e `closed` 13:00:04 | `PULL_REQUEST_CLOSED` 13:00:00 e `PULL_REQUEST_MERGED` 13:00:04 |

## Vínculos no instante do evento

- Cada mudança de vínculo grava um período em `TaskArtifactLinkPeriod`, na mesma transação:
  vincular e desvincular issue; definir, trocar ou limpar a PR; excluir a tarefa.
- O evento vale para as tarefas cujo período contém o `occurredAt`
  (`linkedAt ≤ occurredAt < unlinkedAt`, com `unlinkedAt` nulo = ainda vinculado).
- **Carga inicial (17/10/2026).** Os vínculos existentes abrem um período:
  - issue: desde `TaskIssue.createdAt`;
  - PR: desde o instante da migration, porque o vínculo antigo de PR não tem data.
- O retrato (`GitHubArtifactEventTask`) é gravado com o evento, junto com `linkedTaskCount`. O
  despacho usa o retrato, nunca os vínculos do momento.
- Artefato sem tarefa vinculada no instante do evento não gera evento: é o alerta do S2-01 (RF39,
  RF40).
- Evento ocorrido com a tarefa vinculada e lido depois do desvínculo vale para a tarefa. Evento
  ocorrido antes do vínculo ou depois do desvínculo não vale.
- Tarefa excluída sai do retrato por cascata.

## Fila de eventos

`GitHubArtifactEvent`, uma linha por transição de artefato vinculado:

| Campo | Conteúdo |
| --- | --- |
| `type` | um dos cinco eventos |
| `issueId` ou `pullRequestId` | o artefato (FK `SetNull`); exatamente um preenchido na gravação |
| `artifactNumber`, `artifactTitle`, `artifactUrl` | snapshot: número, título com até 256 caracteres, URL só com o prefixo `https://github.com/` e até 512 caracteres |
| `occurredAt`, `detectedAt` | instante da ocorrência no GitHub e da detecção |
| `linkedTaskCount` | tarefas vinculadas no instante do evento |
| `occurrenceKey` | `gh:<providerEventId>` para o evento lido do GitHub; `linked:<issueId>:task:<taskId>` para a associação; única por projeto. Eventos gravados antes de 17/10/2026 mantêm a chave antiga `<evento>:<id do artefato>:<data>` |
| `status`, `attempts`, `nextAttemptAt`, `claimToken`, `claimedUntil`, `lastErrorCode`, `dispatchedAt` | despacho |
| `outcome` | resultado do despacho (seção "Métrica oficial") |

**Tudo ou nada.** O registro do GitHub, o evento e o retrato persistem na mesma transação. Se ela
cai, nada persiste, e a sincronização seguinte relê e grava uma vez. Os índices únicos são a rede de
segurança.

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
| Fechar, reabrir e fechar a issue, mesmo entre duas sincronizações | três eventos, três rodadas de notificação |
| Vincular a mesma issue aberta duas vezes à mesma tarefa | uma associação |
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
| Worker, a cada 5 minutos ([ADR-024](../architecture/ADR-024-OPERACAO-CONEXOES-RECUPERACAO-E-JOBS.md) D7) | todos os projetos, até 10 lotes de 100 eventos por execução; o sinal de parada é conferido antes de cada evento, e a saída traz `interrupted` e `pendingEvents` (os eventos do lote que ficaram) | tentativa falha volta a `PENDING` ou vira `FAILED`; a execução seguinte retoma |
| Comando manual `npm run notifications:github-events` | todos os projetos (ou `--project-id`), os mesmos limites | o comando sai com código 1 |

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
| Sem motivo autorizado (X) | motivos que as regras atuais não autorizam, como `OUTSIDE_WINDOW` e `PROJECT_DELETED` em eventos antigos (por par) |
| Não observados (U) | eventos `PENDING`, `PROCESSING` ou `FAILED`, uma unidade por evento, porque os participantes só são conhecidos no despacho |

**Cobertura por período.** Para cada projeto do escopo:
- trecho antes do `coverageFrom`: a fonte era a comparação de estado, e a cobertura total sai
  "indisponível" com `FONTE_POR_COMPARACAO_DE_ESTADO`;
- trecho depois do `completeThrough`: ainda não houve leitura completa, e ela sai "indisponível"
  com `LACUNA_DE_AQUISICAO`;
- **conferência da aquisição (18/10/2026):** PR ou issue vinculada no instante do retrato, cujo
  `mergedAtGithub` ou `closedAtGithub` cai no trecho coberto sem o evento correspondente gravado,
  também é `LACUNA_DE_AQUISICAO`, com o artefato e o instante;
- período inteiro entre os dois e sem lacuna: a cobertura total é calculada e rotulada como
  presumida, porque a margem de 5 minutos é hipótese operacional, e o GitHub não garante a
  completude da listagem.

As contagens observadas saem sempre. A associação (`ISSUE_LINKED`) sai à parte, em
`RF60_ASSOCIACAO`, com o mesmo cálculo; o RF60 conta só `ISSUE_CLOSED` e `ISSUE_REOPENED`.

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
| Período | intervalo de `occurredAt` (ou de `detectedAt`, sem `occurredAt`), dentro da retenção de 180 dias. Na validação do Capítulo 4 (S3-01), é o período da aplicação |
| Filtros | projeto e tipo. Não há filtro por pessoa na publicação |
| Interpretação | no trecho coberto, a cobertura total é calculada; fora dele, sai "indisponível" com o motivo. As contagens mostram se cada participante elegível recebeu exatamente uma notificação correta de cada evento: `E = T − A − N`, com `X = 0` e `U = 0` |
| Limitações | (1) o autor da ação não é excluído; (2) eventos `PENDING` ou `FAILED` ainda não têm `outcome`; (3) a associação é avisada e contada no vínculo, à parte do ciclo de vida; (4) vínculos de PR anteriores a 17/10/2026 valem a partir da migration; (5) antes do corte, só as transições observadas pela comparação de estado; (6) a cobertura é presumida: a conferência pelo retrato só vê o último fechamento e o merge de cada artefato |
| Forma de atualização | a cada despacho, no `outcome` do evento; o script `notifications:metrics` soma por período. No repositório, os testes M3 e M4 medem um cenário reproduzível |

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
| Comando | `npm run notifications:github-events:dry-run` (padrão) e `npm run notifications:github-events` (`--apply`), em `src/jobs/cli/dispatch-github-event-notifications.js` |
| Produção | exige `--confirm-production` |
| Escopo | todos os projetos, ou `--project-id=<id>` |
| Reprocessamento | `--retry-failed`, junto com `--apply`, devolve os `FAILED` à fila; em dry-run, só conta |
| Frequência | a retomada roda no worker a cada 5 minutos; o comando é para uso manual ([runbook](../runbooks/GITHUB_EVENT_NOTIFICATIONS.md)) |
| Saída | JSON só no `stdout`, com `dryRun`, `projects`, `scanned`, `claimed`, `busy`, `claimLost`, `dispatched`, `created`, `alreadyNotified`, `excluded` por motivo, `retryScheduled`, `failed`, `failedStock`, `pendingAfter`, `dueAfter`, `oldestDueAgeSeconds`, `durationMs` e `database`; `wouldCreate` em dry-run; `requeued` ou `wouldRequeue` com `--retry-failed`; `interrupted: true` e `pendingEvents` quando o sinal de parada chega no meio de um lote |
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
