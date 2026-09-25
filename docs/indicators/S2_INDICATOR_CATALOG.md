# S2 — Catálogo canônico de indicadores (P0–P3)

**Base P0/P1:** `daniel-dev` @ `54ea185e42bc95d07c0ade91b89ace6f64375b99`, 2026-09-24. **Estado atual:** D01–D15 aprovadas; P1 acrescentou fatos históricos, P2 implementou I01/I02/I03/I05 e P3 implementou no backend I04/I06/I09–I18/I73/I74, sem painel. A [auditoria de prontidão](S2_DATA_READINESS_AUDIT.md) e a [fundação P1](S2_INDICATOR_DATA_FOUNDATION.md) registram evidências e limites. Fontes funcionais: TCC Somativa 2, cap. 1, 2 (métricas), 3.2.6 (Quadros 343–350), UC14; [roadmap](../../TRACEFLOW_ROADMAP_INCREMENTAL.md) S2-04/S2-05.

## Como ler cada ficha

As tabelas abaixo são fichas compactas: **cada linha** contém ID, categoria, nome/descrição, pergunta, fórmula com numerador (`N`) e denominador (`D`), unidade, modelos/campos, relógio de evento, temporalidade (`T`), filtros (`F`), perfil de estados (`E`), RF/UC, limites/dependências, prontidão única e visualização candidata. `—` em `D` significa que não há divisão. Todas as fichas respondem a UC14 quando destinadas ao painel; `DERIVED PRODUCT INDICATOR` (`DPI`) distingue candidatos de RFs oficiais. As fichas RF55/RF56 são capacidades, sem valor numérico próprio.

**T:** `C` CURRENT_STATE; `E` EVENT_PERIOD; `H` HISTORICAL_SERIES; `F` FROZEN_SNAPSHOT. **F:** `period/sprint/responsible` com `S` SUPPORTED, `N` NOT_APPLICABLE, `U` UNSAFE até resolver fonte/semântica. `U` nunca aplica filtro silenciosamente. **E:** perfil de estados abaixo; todo perfil define zero, ausência, parcial e stale para sua ficha. Visuais permitidos: KPI, PROGRESS, LINE, BAR, STACKED_BAR, STACKED_AREA, DONUT, TABLE, RANKED_LIST, FUNNEL.

| Perfil E | Zero válido | NO_DATA | PARTIAL | STALE |
|---|---|---|---|---|
| `LC` local count | Fonte local íntegra e conjunto consultado vazio: `0`. | Projeto/recurso não existe ou corte histórico impossível; não confundir projeto existente com zero tarefas. | Dados legados/exclusões impedem parte da contagem: valor conhecido + limite, sem total conclusivo. | Projeção local atrasada em relação às mutações: mostrar `asOf` e advertir; não fabricar zero. |
| `LR` local ratio | Denominador positivo e N=0: `0%`. | D=0: valor `null`, N/D=0. | N ou D historicamente incompleto: `null` ou subtotal rotulado. | Mesmo tratamento de `LC`. |
| `GE` GitHub event/count | Sync bem-sucedido cobre o escopo e não houve evento: `0`. | Sem integração ou sem sync inicial: `null`. | Sync parcial ou identidade não resolvida: subtotal identificado e parte desconhecida. | Último estado conhecido + `lastSyncAt/status` e aviso; não afirmar atualidade. |
| `GR` GitHub ratio/duration | D>0 e N=0: `0%`/`0 h`; duração zero só se timestamps reais coincidirem. | D=0 ou eventos necessários ausentes: `null`. | Coorte, eventos ou identidade incompletos: `null` ou amostra rotulada. | Como `GE`. |
| `FS` sprint frozen/live | Zero se snapshot íntegro registra zero. | Sem sprint ou base/estimativas necessárias ausentes: `null`; preservar `historicalLimitations`. | Snapshot legado incompleto: subtotal não conclusivo. | Aberta usa corte da leitura; terminal conserva `closedAt`/snapshot, sem “atualizar” resultado. |
| `QP` quality/projection | Zero quando há universo elegível e nenhum evento/estado positivo. | Sem execuções/casos/coorte elegível: `null` para razões, contagem `0` válida se fonte íntegra. | Versão/estado histórico ou relacionamento incompleto: subtotal ou indisponível. | Projeção desatualizada após mutação: `asOf` e aviso; GitHub segue `GR`. |
| `CC` capability/composite | Não há escore zero. | Seções/filtros sem dados mostram `NO_DATA` individual. | Manter seções válidas e nomear as incompletas. | Mostrar último estado conhecido e idade por fonte. |

**Estado universal de resposta:** `AVAILABLE`, `NO_DATA`, `PARTIAL`, `STALE`, `UNAVAILABLE`. `STALE` pode coexistir conceitualmente com parcialidade: transportar `limitations[]` e `sourceSyncStatus` mesmo com um estado primário. `UNAVAILABLE` vale para dados que o sistema não coleta ou reconstrução impossível; não equivale a `NO_DATA`. Percentuais usam `value=null` quando D=0. Todo resultado deve expor `projectId`, `metricId`, `definitionVersion`, N/D quando aplicável, unidade, escopo, fórmula, `eventClock`, `[startInclusive,endExclusive)`, fuso, `asOf`, fonte, estado e limitações. Nada aqui autoriza ranking ou nota de pessoas: **volume de atividade não representa isoladamente produtividade, qualidade ou desempenho humano**. O P2 implementa I01/I02/I03/I05 no backend, com a API descrita em [API Contracts](../api/API_CONTRACTS.md); visualização e homologação GitHub externa seguem pendentes.

Exemplos contratuais: dez PRs fechadas e nenhuma reaberta, **com histórico íntegro**, produzem `0% AVAILABLE`; nenhuma PR fechada produz `value=null, NO_DATA`; dez PRs sem eventos de reabertura coletados produzem `UNAVAILABLE`, mesmo que `state` atual não indique reabertura. Se 25 commits foram observados, 22 atribuídos com segurança e 3 sem associação, a visão por pessoa é `PARTIAL` e preserva o grupo não associado. Sync falho mantém último valor conhecido com `STALE` e horário da última observação.

**Período comum aprovado (D14):** usuário escolhe datas civis inicial/final inclusivas em fuso IANA explícito; o Indicator Engine P2 converte para instantes UTC `[startInclusive,endExclusive)` em I02/I03/I05. Não usar fuso local do servidor. Sprint existente usa `[startDate,endDate)` e burndown agrupa dias UTC; alinhar conversão com esse contrato, sem mudar histórico. O relógio particular da ficha prevalece: autor do commit (`Commit.date`), transição da Task (`TaskMovement.movedAt`), evento PR (`PullRequestLifecycleEvent.occurredAt`), execução (`TestExecution.executedAt`) etc. `CURRENT_STATE` não recebe filtro por `updatedAt` genérico.

**Cobertura P3:** I04/I06/I11 só afirmam coorte completa quando `pullRequestLifecycleCoverageFrom <= startInclusive` e `pullRequestLifecycleSyncedAt >= endExclusive`. O primeiro marcador nasce na primeira varredura completa após a migration P3, inclusive vazia, e não retroage ao evento mais antigo recebido. Registros legados permanecem `null` até essa varredura; intervalos anteriores retornam PARTIAL/UNAVAILABLE com valor inconclusivo. I14/I18/I74 usam apenas o fechamento corrente da Issue e sinalizam `ISSUE_LIFECYCLE_NOT_COLLECTED`. I17 limita a lista às dez PRs abertas mais antigas; I73 calcula a média de todas as PRs abertas com data válida.

## Indicadores oficiais — primeiro compromisso

| ID/categoria/nome e pergunta | Fórmula N / D; unidade | Fonte; relógio; T; F; E | RF/UC; prontidão; dependências/limites; visual |
|---|---|---|---|
| **I01 GENERAL Progresso atual** — Que fração das Tasks cadastradas está concluída? | N=`Task.status=CONCLUIDO`; D=Tasks do projeto; `%`. | `Task.projectId,status`; corte da leitura; C; `U/N/N`; LR. | **RF15/UC14; IMPLEMENTED BACKEND / READY**. Mudança de status exige recomputar; exclusão física muda universo; não usar Sprint como denominador. PROGRESS/KPI futuro. |
| **I02 GITHUB Commits na main por responsável** — Qual atividade de commits confirmada na branch literal `main` ocorreu por pessoa no período? | N=commits distintos em `main` por identidade segura; D=—; commits. | `Commit.authorGithubUserId`, `CommitBranch`, `GitBranch.name,lastSyncedGeneration`, `GitHubIdentity.githubUserId`; `Commit.date`; E; `S/N/S`; GE. | **RF16/UC14; IMPLEMENTED BACKEND condicionado à varredura completa da `main`**. D01/D09: `main` literal; sem `main`/generation confirmada → UNAVAILABLE; autoria sem ID fica não associada e distribuição PARTIAL; falha de sync → STALE. TABLE/BAR futuro. |
| **I03 TASK Conclusões por responsável** — Quantas Tasks únicas ficaram concluídas no período sob cada responsável? | N=Tasks distintas com conclusão elegível; D=—; Tasks. | `TaskMovement.responsibleUserIdSnapshot,toStatus,movedAt`; entrada em `CONCLUIDO`; E; `S/S/S`; LC. | **RF17/UC14; IMPLEMENTED BACKEND**. D02/D03: última conclusão vigente no corte; `null` legado permanece PARTIAL, sem usar responsável atual; hard delete limita histórico. TABLE/BAR futuro. |
| **I04 GITHUB Retrabalho de PR** — Que proporção das PRs elegíveis reabriu após fechamento? | N=PRs distintas com `closed→reopened`; D=PRs fechadas no período; `%`. | `PullRequestLifecycleEvent.eventType,occurredAt`; transições provider; E; `S/N/N`; GR. | **RF18/UC14; IMPLEMENTED BACKEND condicionado à cobertura completa da coorte**. Cobertura parcial → PARTIAL/UNAVAILABLE; legado não é reconstruído. TCC_ALIGNMENT_NOTE permanece. KPI/LINE futura. |
| **I05 TASK Atividade por responsável** — Como se distribuem conclusões e commits na main, sem avaliar pessoas? | Vetor I02 + I03; D=—; commits e Tasks. | Fontes I02/I03 + membership; E; `S/U/S`; GE (com limitações locais). | **RF36/UC14; IMPLEMENTED BACKEND** para pessoas com fatos e membership atual ativa. “Ativo no período” histórico não é inferido; filtro Sprint permanece UNSAFE; não somar unidades em score; fonte parcial/stale é exposta por dimensão. TABLE futura. |
| **I06 QUALITY Qualidade de PR oficial** — Qual taxa de retrabalho e qual fração das PRs fechadas foi mesclada? | Retrabalho=I04; taxa de merge: N=PRs mescladas, D=PRs fechadas; `%` cada. | `PullRequestLifecycleEvent` + PR corrente; E; `S/N/N`; GR. | **RF54/UC14; IMPLEMENTED BACKEND condicionado à cobertura completa da coorte**. Merge/fechadas não representa Review APPROVED. TCC_ALIGNMENT_NOTE preservada. KPIs/LINE futuros. |
| **I07 GENERAL Painel consolidado** — O projeto é compreensível em planejamento, repositório, progresso, atividade, cobertura e qualidade? | Composição de indicadores; N/D=—; contrato, sem score. | Blocos selecionados; corte por fonte; C; `U/U/U`; CC. | **RF55/UC14**; **NEEDS_PRODUCT_DECISION**. Três seções oficiais + cobertura/qualidade UC14; “completude de seções” é medida de aceite, não KPI do projeto. TABLE/KPI. |
| **I08 GENERAL Filtro temporal** — Os números compatíveis correspondem exatamente ao intervalo escolhido? | Operação sobre fichas E/H; N/D=—; contrato. | Relógio por ficha; E; `S/N/N`; CC. | **RF56/UC14**; **NEEDS_PRODUCT_DECISION**. Precisão de filtros do Quadro 350 é medida de teste, não KPI. Filtros sprint/responsável do UC14 exigem compatibilidade por ficha. TABLE. |

## Indicadores derivados por domínio

Todas as linhas desta seção são **DERIVED PRODUCT INDICATOR**: campo `RF relacionado = nenhum RF novo` e `UC relacionado = UC14 (candidato)`, salvo quando a própria fonte reutiliza RF35/S1-06/S1-09 já existentes, sem reivindicar sua implementação. Fórmulas são candidatas reproduzíveis; itens `NOT_RECOMMENDED` ficam registrados como exclusões explícitas.

### GITHUB

| ID/nome — pergunta | N / D; unidade | Fonte; relógio; T; F; E | Estado; limites/dependências; visual |
|---|---|---|---|
| **I09 Commits no período** — Quanto código versionado foi observado? | Commits distintos / —; commits. | `Commit.id,date`; autoria; E; `S/N/N`; GE. | **IMPLEMENTED BACKEND**; volume não mede valor; BAR/LINE. |
| **I10 PRs abertas agora** — Qual fila de integração está aberta? | `PullRequest.state=open` / —; PRs. | `PullRequest.state`; corte/sync; C; `N/N/N`; GE. | **IMPLEMENTED BACKEND**; estado stale se sync antigo; KPI. |
| **I11 PRs fechadas no período** — Quantas chegaram ao encerramento? | PRs distintas com `CLOSED` no intervalo / —; PRs. | `PullRequestLifecycleEvent.occurredAt`; E; `S/N/N`; GE. | **IMPLEMENTED BACKEND** após backfill completo; eventos antigos indisponíveis não são inferidos de `closedAtGithub`; BAR. |
| **I12 PRs mescladas no período** — Quantas integraram código? | `mergedAtGithub` no intervalo / —; PRs. | `PullRequest.mergedAtGithub`; merge; E; `S/N/N`; GE. | **IMPLEMENTED BACKEND**; não inferir aprovação de review; BAR. |
| **I13 Issues abertas agora** — Qual fila GitHub está aberta? | `Issue.state=open` / —; issues. | `Issue.state`; corte/sync; C; `N/N/N`; GE. | **IMPLEMENTED BACKEND**; fila não equivale a defeitos TraceFlow; KPI. |
| **I14 Issues fechadas no período** — Quantas foram encerradas? | `closedAtGithub` no intervalo / —; issues. | `Issue.closedAtGithub`; fechamento atual; E; `S/N/N`; GE. | **IMPLEMENTED BACKEND**; reabertura elimina histórico; BAR. |
| **I15 Mediana até merge** — Quanto demora uma PR típica a integrar? | Mediana de `mergedAtGithub-createdAtGithub` / PRs mescladas elegíveis; horas. | `PullRequest` datas; merge; E; `S/N/N`; GR. | **IMPLEMENTED BACKEND**; excluir durações inválidas com contagem de exclusões; KPI/LINE. |
| **I16 Média até merge** — Qual tempo médio, inclusive cauda longa? | Soma das durações / PRs mescladas elegíveis; horas. | Mesma fonte I15; merge; E; `S/N/N`; GR. | **IMPLEMENTED BACKEND**; mostrar junto à mediana, sem esconder outliers; KPI. |
| **I17 Idade de PR aberta** — Há PRs envelhecendo sem decisão? | `asOf-createdAtGithub` por PR aberta; D=—; dias. | `PullRequest.state,createdAtGithub`; agora/sync; C; `N/N/N`; GE. | **IMPLEMENTED BACKEND**; top antigas em RANKED_LIST; mediana da fila pode ser calculada da mesma amostra. |
| **I18 Mediana até fechamento de Issue** — Quanto leva a encerrar uma issue? | Mediana de `closedAtGithub-createdAtGithub` / issues fechadas elegíveis; dias. | `Issue` datas; fechamento; E; `S/N/N`; GR. | **IMPLEMENTED BACKEND**; fechamento corrente pode omitir ciclos anteriores; KPI/LINE. |
| **I19 Aprovações GitHub Review** — Que PRs receberam parecer formal? | Reviews APPROVED / reviews elegíveis; `%`. | GitHub Reviews ainda não coletadas; submissão de review; E; `S/N/N`; GR. | **NEEDS_GITHUB_DATA**; indicador futuro separado de RF54; não inferir de merge; KPI. |
| **I73 Idade média de PR aberta** — Em média, há quanto tempo a fila atual espera? | Soma de `asOf-createdAtGithub` / PRs abertas elegíveis; dias. | `PullRequest.state,createdAtGithub`; corte/sync; C; `N/N/N`; GR. | **IMPLEMENTED BACKEND**; interpretar com I17, pois poucas PRs antigas distorcem a média; KPI futuro. |
| **I74 Tempo médio até fechar Issue** — Qual duração média dos encerramentos? | Soma de `closedAtGithub-createdAtGithub` / issues fechadas elegíveis; dias. | `Issue` datas; fechamento; E; `S/N/N`; GR. | **IMPLEMENTED BACKEND**; interpretar junto à mediana I18; KPI. |

### FLOW

| ID/nome — pergunta | N / D; unidade | Fonte; relógio; T; F; E | Estado; limites/dependências; visual |
|---|---|---|---|
| **I20 Lead time** — Quanto tempo passa da criação à primeira conclusão? | Mediana de `primeira entrada CONCLUIDO - Task.createdAt` / Tasks elegíveis; dias corridos. | `Task`, `TaskMovement`; primeira conclusão; E; `S/S/N`; LC (duração: D=0 → NO_DATA). | **IMPLEMENTED BACKEND (PARTIAL WHEN HISTORY MISSING)**; exclusões e Tasks criadas concluídas precisam regra D04; KPI/LINE. |
| **I21 Cycle time** — Quanto dura do primeiro início ao primeiro término? | Mediana de `primeira entrada EM_ANDAMENTO → primeira conclusão` / Tasks elegíveis; dias corridos. | `TaskMovement`; conclusão; E; `S/S/N`; LC (D=0 → NO_DATA). | **IMPLEMENTED BACKEND** para eventos íntegros; D05: elapsed, não soma de sessões; sem entrada em andamento → excluída e contada; KPI/LINE. |
| **I22 Throughput** — Quantas Tasks únicas finalizaram no período? | Tasks distintas com conclusão vigente no corte / —; Tasks. | `TaskMovement` + estado no corte; conclusão; E; `S/S/N`; LC. | **IMPLEMENTED BACKEND** para eventos íntegros; D03/D06: reabertura não duplica Task; BAR/LINE. |
| **I23 WIP atual** — Quantas Tasks estão em trabalho? | `Task.status=EM_ANDAMENTO` / —; Tasks. | `Task.status`; leitura; C; `N/U/U`; LC. | **IMPLEMENTED BACKEND**; sprint atual por vínculo corrente apenas, terminal é inseguro; KPI. |
| **I24 Aging WIP** — Quais Tasks há mais tempo permanecem em andamento? | `asOf - última entrada EM_ANDAMENTO` sem saída subsequente / —; dias. | `TaskMovement`, `Task.status`; última entrada; C; `N/U/U`; LC. | **IMPLEMENTED BACKEND (PARTIAL WHEN HISTORY MISSING)**; Task sem movimento inicial ou legado → indisponível; RANKED_LIST. |
| **I25 Cumulative Flow** — Como o estoque de Tasks em cada estado evoluiu? | Contagem por estado ao fim de cada dia / —; Tasks por dia. | `Task.createdAt`, `TaskMovement`; transições; H; `S/U/N`; LC. | **NEEDS_HISTORY / PARTIAL BACKEND**; criação já concluída/exclusão física e eventos anteriores à trilha impedem série íntegra; STACKED_AREA. |

### TASK

| ID/nome — pergunta | N / D; unidade | Fonte; relógio; T; F; E | Estado; limites/dependências; visual |
|---|---|---|---|
| **I26 Total de Tasks** — Qual tamanho do backlog cadastrado? | Tasks existentes / —; Tasks. | `Task.projectId`; leitura; C; `N/U/U`; LC. | **IMPLEMENTED BACKEND**; excluídas fisicamente não contam; KPI. |
| **I27 Distribuição por status** — Como o trabalho se divide entre colunas? | Tasks por status / —; Tasks. | `Task.status`; leitura; C; `N/U/U`; LC. | **IMPLEMENTED BACKEND**; três estados canônicos; STACKED_BAR. |
| **I28 Atrasadas** — Que trabalho perdeu o prazo? | `deadline < asOf` e `status != CONCLUIDO` / —; Tasks. | `Task.deadline,status`; leitura; C; `N/U/U`; LC. | **IMPLEMENTED BACKEND**; deadline é instante, exibir em fuso escolhido; RANKED_LIST/KPI. |
| **I29 Sem responsável** — Que tarefas precisam de atribuição? | `responsibleUserId IS NULL` / —; Tasks. | `Task.responsibleUserId`; leitura; C; `N/U/N`; LC. | **IMPLEMENTED BACKEND**; texto legado `responsible` não equivale a User; KPI/TABLE. |
| **I30 Sem estimativa** — Qual trabalho não tem plano de esforço? | `estimatedEffort IS NULL` / —; Tasks. | `Task.estimatedEffort`; leitura; C; `N/U/N`; LC. | **IMPLEMENTED BACKEND**; zero explícito difere de ausente; KPI. |
| **I31 Estimativa total** — Quantas horas foram planejadas nas Tasks estimadas? | Soma `estimatedEffort` / Tasks com estimativa; horas, D informativo. | `Task.estimatedEffort`; leitura; C; `N/U/N`; LC. | **IMPLEMENTED BACKEND**; indicar cobertura e não tratar ausente como zero; KPI. |
| **I32 Esforço realizado** — Quantas horas foram registradas? | Soma `actualEffort` derivado / Tasks com realizado; horas, D informativo. | `Task.actualEffort`, `TaskTimeEntry`, `legacyActualEffort`; corte; C; `N/U/N`; LC. | **IMPLEMENTED BACKEND**; reutilizar contrato S1-06, sem recálculo paralelo; KPI. |
| **I33 Desvio de esforço** — Quanto realizado diverge do estimado? | Soma realizado - soma estimado / Tasks comparáveis; horas, D informativo. | Contrato S1-06; leitura; C; `N/U/N`; LC. | **IMPLEMENTED BACKEND**; omitir comparação de Task sem estimativa; manter subtotal de realizado fora do limite; KPI/TABLE. |
| **I34 Acima da estimativa** — Onde há risco de esforço excedido? | Tasks comparáveis com realizado > estimado / —; Tasks. | Contrato S1-06; leitura; C; `N/U/N`; LC. | **IMPLEMENTED BACKEND**; lista contextual, não nota individual; RANKED_LIST. |
| **I35 Abaixo da estimativa** — Que Tasks consumiram menos que o plano? | Tasks `CONCLUIDO` comparáveis com realizado < estimado / —; Tasks. | Contrato S1-06; leitura; C; `N/U/N`; LC. | **IMPLEMENTED BACKEND**; tarefa incompleta não é “ganho”; TABLE. |

### SPRINT

Todas as fichas `F` usam `SprintTask` e snapshots de fechamento, jamais `Task` atual para Sprint terminal. Unidades de pontos da UI são horas de estimativa em passos de meia hora; não renomear como story points.

| ID/nome — pergunta | N / D; unidade | Fonte; relógio; T; F; E | Estado; limites/dependências; visual |
|---|---|---|---|
| **I36 Pontos planejados** — Qual foi a base inicial? | Soma `pointsAtPlanning` / participações planejadas; horas, D informativo. | `SprintTask.plannedAtStart,pointsAtPlanning`; início; F; `N/S/N`; FS. | **IMPLEMENTED BACKEND** quando snapshot existe; legado parcial; KPI. |
| **I37 Pontos atuais** — Qual é o escopo de hoje? | Soma estimativas de participações correntes / —; horas. | `SprintTask` + Task aberta; leitura; C; `N/S/N`; FS. | **IMPLEMENTED BACKEND**; terminal usa `pointsAtClose`, não live; KPI. |
| **I38 Pontos entregues** — Quanto escopo foi concluído no corte? | Soma pontos das participações concluídas / —; horas. | `SprintTask.exitStatus,pointsAtClose` terminal; fechamento; F; `N/S/N`; FS. | **IMPLEMENTED BACKEND** via `historicalSummary.completedPoints`; legado limita; KPI. |
| **I39 Tasks planejadas** — Quantas entraram no baseline? | `plannedAtStart=true` / —; Tasks. | `SprintTask`; início; F; `N/S/N`; FS. | **IMPLEMENTED BACKEND** via summary, se `planningSnapshotAt` existe; KPI. |
| **I40 Tasks entregues** — Quantas terminaram nesta Sprint? | Participações ativas no fechamento com `exitStatus=CONCLUIDO` / —; Tasks. | `SprintTask`; fechamento; F; `N/S/N`; FS. | **IMPLEMENTED BACKEND** via summary, se status congelado; KPI. |
| **I41 Escopo adicionado** — Quanto entrou após o início? | Participações `addedAfterStart` não removidas / —; Tasks. | `SprintTask.addedAt,plannedAtStart`; evento; F; `N/S/N`; FS. | **IMPLEMENTED BACKEND** via `scopeChange.added`; legado baseline limita; TABLE. |
| **I42 Escopo removido** — Quanto saiu após o início? | Participações removidas do baseline / —; Tasks. | `SprintTask.removedAt,removalReason`; evento; F; `N/S/N`; FS. | **IMPLEMENTED BACKEND** via `scopeChange.removed`; TABLE. |
| **I43 Carry-over** — Que Tasks passaram à Sprint seguinte? | Participações com `carriedFromSprintId`/destino histórico / —; Tasks. | `SprintTask`; transferência; F; `N/S/N`; FS. | **IMPLEMENTED BACKEND**; distinguir saída da origem e entrada do destino; TABLE. |
| **I44 Estimado × realizado** — A Sprint consumiu mais esforço que o plano? | `effort.estimatedHours`, `actualHours`, diferença / Tasks cobertas; horas. | `/sprints/:id/progress.effort`; corte/fechamento; F; `N/S/N`; FS. | **IMPLEMENTED BACKEND**; `incomplete` e `status` do cálculo S1-06 são autoridade; KPI/TABLE. |
| **I45 Burndown** — Como o trabalho restante mudou por dia? | `remaining = scope - completed` por dia coberto; Burndown legado conserva sua fórmula anterior / —; horas por dia. | `/sprints/:id/progress.burndown` e `SprintBurnupEvent` em Sprints cobertas; dias UTC; H/F; `N/S/N`; FS. | **IMPLEMENTED BACKEND, v2**; owner `sprint.burndown.calculator.js`; compartilha projeção histórica com I46 nos dias cobertos; âncora parcial e limitações explícitas; máximo 180 dias; LINE. |
| **I46 Burnup** — Escopo total e concluído caminham juntos? | Duas séries `{date,scope,completed}` / —; horas por dia UTC. | `Sprint.burnupCoverageStartedAt` + `SprintBurnupEvent` durável; H; `N/S/N`; FS. | **IMPLEMENTED BACKEND condicional, v2**; compartilha projeção histórica com I45; `AVAILABLE` com captura integral, `PARTIAL` com âncora tardia/estimativa ausente/teto 180, `UNAVAILABLE` para legado sem prova; sem passado inferido; LINE futuro. |
| **I47 Velocity** — Quantas horas planejadas foram entregues por Sprint concluída? | `completedPoints` por Sprint `CONCLUIDA` / —; horas/Sprint. | `historicalSummary` frozen; fechamento; F; `N/S/N`; FS. | **IMPLEMENTED BACKEND** com snapshot íntegro; D07: excluir `CANCELADA` e Sprint atual; não comparar pessoas; BAR. |

### QUALITY

**P6:** I48–I60 estão **IMPLEMENTED BACKEND** em `GET /api/projects/:projectId/indicators/quality`. Indicadores históricos mantêm limites de exclusão lógica, falta de evento legado e período ainda incompleto como estados/limitações explícitos. Não há visualização nesta etapa.

| ID/nome — pergunta | N / D; unidade | Fonte; relógio; T; F; E | Estado; limites/dependências; visual |
|---|---|---|---|
| **I48 Execuções por resultado** — Qual evidência de teste foi produzida? | Execuções PASS/FAIL/BLOCKED / total execuções; contagem e D informativo. | `TestExecution.result,executedAt`; execução; E; `S/N/N`; QP. | **IMPLEMENTED BACKEND**; todas execuções, não estado atual do caso; STACKED_BAR. |
| **I49 Pass rate** — Que fração das execuções passou? | PASS / PASS+FAIL+BLOCKED; `%`. | `TestExecution`; execução; E; `S/N/N`; QP. | **IMPLEMENTED BACKEND**; D=0 → NO_DATA; KPI/LINE. |
| **I50 Fail rate** — Que fração falhou? | FAIL / PASS+FAIL+BLOCKED; `%`. | Mesma fonte; execução; E; `S/N/N`; QP. | **IMPLEMENTED BACKEND**; não somar resultados de passos como execuções; KPI/LINE. |
| **I51 Blocked rate** — Que fração ficou bloqueada? | BLOCKED / PASS+FAIL+BLOCKED; `%`. | Mesma fonte; execução; E; `S/N/N`; QP. | **IMPLEMENTED BACKEND**; bloqueio difere de falha; KPI/LINE. |
| **I52 Saúde atual dos casos** — Quais casos ativos têm PASS, FAIL, BLOCKED ou nunca foram executados na versão atual? | Casos por última execução `currentVersion` / casos ativos; casos. | `TestCase.currentVersion`, `TestExecution`; última execução da versão atual; C; `U/N/N`; QP. | **IMPLEMENTED BACKEND**; reutilizar regra S1-09 (`executedAt DESC,id DESC`), versão antiga PASS não conta; STACKED_BAR. |
| **I53 Defeitos por estado** — Quantos ainda requerem ação? | Defeitos não excluídos por estado / —; defeitos. | `Defect.status,deletedAt`; leitura; C; `N/N/N`; QP. | **IMPLEMENTED BACKEND**; ativo=ABERTO+EM_CORRECAO+AGUARDANDO_RETESTE; STACKED_BAR. |
| **I54 Defeitos por severidade** — Onde está a gravidade registrada? | Defeitos não excluídos por severidade / —; defeitos. | `Defect.severity,deletedAt`; leitura; C; `N/N/N`; QP. | **IMPLEMENTED BACKEND**; severidade não mede desempenho individual; BAR. |
| **I55 Defeitos criados** — Quantos surgiram no intervalo? | `Defect.createdAt` no intervalo / —; defeitos. | `Defect`; criação; E; `S/N/N`; QP. | **IMPLEMENTED BACKEND**; excluídos logicamente não reaparecem e reduzem cobertura com PARTIAL; LINE. |
| **I56 Defeitos validados** — Quantos tiveram validação no período? | Defeitos distintos com evento `VALIDATED` / —; defeitos. | `DefectHistoryEntry`; validação; E; `S/N/N`; QP. | **IMPLEMENTED BACKEND**; não filtrar `Defect.updatedAt`; legado sem evento → PARTIAL; LINE. |
| **I57 Tempo de correção** — Quanto leva do registro à primeira validação? | Mediana de `VALIDATED.occurredAt - Defect.createdAt` / defeitos elegíveis; dias. | `DefectHistoryEntry.action=VALIDATED`; primeira validação; E; `S/N/N`; QP. | **IMPLEMENTED BACKEND condicional** para legado; D13: reabertura/ciclos não entram nesta definição; KPI. |
| **I58 Sucesso de reteste** — Que fração dos retestes executados passou? | `DefectRetest` com execução PASS / retestes PASS+FAIL+BLOCKED; `%`. | `DefectRetest→TestExecution.result`; execução; E; `S/N/N`; QP. | **IMPLEMENTED BACKEND**; D12: BLOCKED no D, múltiplos ciclos contados como tentativas; KPI/LINE. |
| **I59 Concentração por Requirement** — Em quais requisitos há mais defeitos? | Defeitos distintos ligados direta/via ORIGIN Task por requisito / —; defeitos. | S1-09 `defect_links`; leitura; C; `N/N/N`; QP. | **IMPLEMENTED BACKEND**; um defeito pode aparecer em mais de um requisito, não somar barras como total; RANKED_LIST. |
| **I60 Concentração por Task de origem** — Em quais Tasks os defeitos surgiram? | Defeitos distintos por `DefectTask.ORIGIN` / —; defeitos. | `DefectTask`, `Defect`; leitura; C; `N/N/N`; QP. | **IMPLEMENTED BACKEND**; sem ranking de desenvolvedores; RANKED_LIST. |

### TRACEABILITY

**P6:** I61–I67 estão **IMPLEMENTED BACKEND** em `GET /api/projects/:projectId/indicators/traceability`, com a projeção S1-09 como autoridade. I62/I65/I66 propagam frescor GitHub quando relevante; I68 permanece **NOT_RECOMMENDED**.

| ID/nome — pergunta | N / D; unidade | Fonte; relógio; T; F; E | Estado; limites/dependências; visual |
|---|---|---|---|
| **I61 Requirements com Tasks** — Que parte do escopo tem trabalho vinculado? | Requisitos com ≥1 Task / requisitos do projeto; `%`. | `traceability/requirement-task-coverage`; leitura; C; `U/N/N`; LR. | **IMPLEMENTED BACKEND**; `coverage.hasData` prevalece sobre percentual legado zero; KPI. |
| **I62 Requirements com evidência técnica** — Que requisitos têm PR/commit vinculado via Tasks? | Requisitos com evidência / requisitos do projeto; `%`. | `requirements-matrix.summary.requirementsWithTechnicalEvidence`; leitura; C; `U/N/N`; LR. | **IMPLEMENTED BACKEND**; regra existente não inclui Issue como evidência técnica; KPI. |
| **I63 Requirements com TestCase** — Onde existe verificação vinculada? | Requisitos com caso relevante ativo direto/via Task / requisitos; `%`. | S1-09 `case_links`; leitura; C; `U/N/N`; LR. | **IMPLEMENTED BACKEND**; deduplicar caso/requisito; KPI. |
| **I64 Requirements com Defect** — Onde há falhas rastreadas? | Requisitos com defeito ativo direto/via ORIGIN / requisitos; `%`. | S1-09 `defect_links`; leitura; C; `U/N/N`; LR. | **IMPLEMENTED BACKEND**; diagnóstico, não “cobertura boa”; KPI/TABLE. |
| **I65 Requirements validados** — Que parte satisfaz a condição atual de conclusão? | Situação atual `CONCLUIDO` / requisitos; `%`. | Projeção S1-09, não `Requirement.status` legado; leitura; C; `U/N/N`; LR. | **IMPLEMENTED BACKEND**; `VALIDADO` histórico não é aprovação atual; KPI. |
| **I66 Cobertura de implementação** — Quanto do escopo atingiu estágio técnico implementado? | Requisitos com `implementation.implemented` na policy S1-09 / requisitos; `%`. | `requirement-projection`/policy; leitura; C; `U/N/N`; LR. | **IMPLEMENTED BACKEND**; D11: policy deriva de `legacyStage=IMPLEMENTADO`; estados de qualidade não apagam implementação; nunca commits/requisitos; KPI. |
| **I67 Progresso médio por Requirement** — Como avançam as Tasks vinculadas aos requisitos? | Soma dos progressos por requisito / total requisitos; `%`. | `requirements-matrix.summary.averageProgress`; leitura; C; `U/N/N`; LR. | **IMPLEMENTED BACKEND**; zero por requisito sem Task é regra existente, distinta de I01; KPI. |
| **I68 Funil cumulativo completo** — Todos os níveis representam subconjuntos sucessivos? | Requisitos → com Tasks → evidência → TestCases → validados; contagens. | Projeção S1-09; leitura; C; `U/N/N`; QP. | **NOT_RECOMMENDED**: evidência e TestCase são dimensões independentes, logo barras podem aumentar. Visual alternativo para as dimensões: BAR, nunca FUNNEL. |

### PLANNING

| ID/nome — pergunta | N / D; unidade | Fonte; relógio; T; F; E | Estado; limites/dependências; visual |
|---|---|---|---|
| **I69 Marcos próximos do prazo** — O que vence na janela de atenção? | Marcos não concluídos com `dueDate ∈ [asOf,asOf+horizonte]` / —; marcos. | `Milestone.status,dueDate,deletedAt`; leitura; C; `N/N/N`; LC. | **DERIVABLE**; horizonte configurado no produto (ex. 14 dias) é decisão, não RF; RANKED_LIST. |
| **I70 Marcos vencidos** — Que prazo de marco já passou? | Marcos não concluídos com `dueDate<asOf` / —; marcos. | `Milestone`; leitura; C; `N/N/N`; LC. | **DERIVABLE**; fuso de exibição explícito; KPI/TABLE. |
| **I71 Sprint com mudança de escopo** — O plano mudou depois do início? | `scopeChange.added/removed` / —; Tasks. | `/sprints/:id/progress`; eventos/snapshot; F; `N/S/N`; FS. | **IMPLEMENTED BACKEND**; mostrar ambas as direções, sem score de “saúde”; TABLE. |
| **I72 Carry-over atual** — Que pendências chegaram à Sprint corrente? | Participações correntes com `carriedFromSprintId` / —; Tasks. | `SprintTask`; leitura; C; `N/S/N`; FS. | **IMPLEMENTED BACKEND**; não alterar origem congelada; TABLE. |

## Composição inicial das visões futuras

Ordem é de leitura, não especificação de layout. Widgets `U`/indisponíveis exibem explicação ou ficam fora do padrão até dados suficientes. A Visão geral terá **no máximo 7 widgets principais**.

| Visão | Objetivo e pergunta principal | Widgets padrão, na ordem sugerida |
|---|---|---|
| GENERAL | Entender o estado do projeto sem confundir atividade com qualidade. | I01 progresso, I23 WIP, I28 atrasadas, I61 requisitos com Tasks, I66 implementação (quando decidido), I53 defeitos ativos, I45 burndown da Sprint corrente (se houver). |
| GITHUB | Entender atividade e fila técnica. | I02 atividade main, I09 commits, I10 PRs abertas, I12 mescladas, I15 tempo de merge, I17 PRs antigas, I73 idade média, I14 issues fechadas. |
| FLOW | Identificar gargalos. | I22 throughput, I20 lead time, I21 cycle time, I23 WIP, I24 aging, I25 cumulative flow quando histórico íntegro. |
| SPRINT | Comparar plano, mudança e entrega. | I36/I38 pontos, I39/I40 Tasks, I41/I42 escopo, I43 carry-over, I44 esforço, I45 burndown, I46 burnup quando validado. |
| TASK | Gerir trabalho e estimativas. | I27 distribuição, I28 atrasadas, I29 sem responsável, I30 sem estimativa, I31/I32 horas, I33 desvio e listas I34/I35. |
| QUALITY | Distinguir revisão, teste e correção. | I06 qualidade de PR, I48 execuções, I49–I51 taxas, I52 saúde atual, I53/I54 defeitos, I58 reteste, I59/I60 concentração. |
| TRACEABILITY | Ver conexões e validação. | I61/I62/I63 coberturas, I64 defeitos, I65 validação, I66 implementação, I67 progresso médio; **não** I68. |

**PERSONALIZADO (contrato conceitual):** usuário escolhe entre IDs já publicados, reordena e restaura padrão. Respeita permissão, estado e compatibilidade de filtros da ficha. Sem fórmula, SQL, widget arbitrário ou modelo persistido nesta etapa.

## Decisões D01–D15 — contrato aprovado para implementação

Cada linha fixa a semântica para P2/P3; aprovação do contrato não significa entrega do cálculo. A [fundação P1](S2_INDICATOR_DATA_FOUNDATION.md) registra quais fatos já são persistidos e quais lacunas históricas permanecem.

| ID | Contexto e opções | Contrato aprovado | Consequência, dados necessários e impacto no histórico |
|---|---|---|---|
| D01 | RF16 diz `main`; usar `main` literal ou default branch? | Usar **`main` literal**. | Projeto sem `main` informa indisponibilidade para RF16; `GitBranch.name`, `isDefault` só contextualiza. Histórico de outra default não vira main retroativamente. |
| D02 | RF17 após troca de responsável: atual ou no evento? | Responsável no instante da entrada em concluído. | `TaskMovement.responsibleUserIdSnapshot` congela eventos novos; legado `null` fica PARTIAL, não reatribuir passado. Mutação conjunta usa responsável resultante. |
| D03 | Task concluída duas vezes: 1 Task ou 2 eventos? | RF17/throughput contam **Task distinta uma vez por período**, pela última conclusão vigente no corte; transições permanecem auditáveis à parte. | Reabertura invalida conclusão anterior no corte; intervalos sobrepostos exigem regra de deduplicação; usar movimentos, não `updatedAt`. |
| D04 | Lead time: criação → primeira ou última conclusão? | Primeira conclusão, dias corridos; Task criada já concluída só se houver evento inicial verificável. | Exclusões/legado sem movimento geram lacuna; não reconstruir criação por primeira movimentação. |
| D05 | Cycle time: elapsed ou soma de intervalos ativos? | Elapsed da primeira entrada em andamento até primeira conclusão, dias corridos; reentrada não reinicia relógio. | Sem passagem por andamento: fora da amostra, com contagem explícita; soma de sessões é métrica diferente. |
| D06 | Throughput: eventos ou Tasks únicas? | Tasks únicas concluídas no corte por período, igual D03. | Gráfico exige estado histórico e deduplicação; mutações/exclusões antigas podem tornar série parcial. |
| D07 | Velocity: aberta, concluída e cancelada? | Horas concluídas (`completedPoints`) só de Sprints `CONCLUIDA` com snapshot íntegro; `CANCELADA` e atual excluídas. | Amostra pequena/sem estimativa → NO_DATA; não misturar esforço real ou story points. |
| D08 | Burnup: derivar do burndown ou eventos de escopo? | Duas séries independentes de escopo e concluído; só publicar quando mudanças de pontos no tempo forem reconstruíveis. | `SprintTask` guarda entradas/saídas e pontos de início/fim, mas pode não guardar todas revisões intermediárias; lacuna histórica impede gráfico preciso. |
| D09 | Commit→User: GitHub ID estável ou heurística? | Igualdade exata `Commit.authorGithubUserId = GitHubIdentity.githubUserId` e membership ativa para leitura por pessoa; sem match = autor não associado. | Login pode mudar; nome/e-mail/login aproximado não vinculam User. `authorGithubUserId=null` permanece não associado. |
| D10 | PR reaberta: estado atual, eventos GitHub ou polling? | Usar `PullRequestLifecycleEvent` obtido de issue events oficiais do GitHub App; `CLOSED`, `REOPENED`, `MERGED` com ID/data do provider. | Paginação repository-wide; evento append-only. Nunca inferir de `updatedAt`; período sem evento recuperável fica PARTIAL/UNAVAILABLE. |
| D11 | Implementação: commits/requisito, status legado ou policy S1-09? | Usar `implementation.implemented` da policy S1-09, derivado de `legacyStage=IMPLEMENTADO`, separado da qualidade. | `COM_FALHA`, `EM_CORRECAO` e `AGUARDANDO_RETESTE` não apagam implementação; não duplicar policy. |
| D12 | Retest rate: por defeito, ciclo ou tentativa; BLOCKED no D? | Por tentativa contextual; PASS/(PASS+FAIL+BLOCKED), todos ciclos, BLOCKED no D e destacado. | `DefectRetest→TestExecution`; não misturar execução comum. Mudança de ciclo não apaga tentativas. |
| D13 | Tempo de correção: até primeiro VALIDADO ou por ciclo? | Criação → primeiro evento `VALIDATED`, mediana; medir ciclos separadamente se houver necessidade. | Conferir `DefectHistoryEntry` legado; sem evento, UNAVAILABLE/PARTIAL, nunca `updatedAt` como substituto. |
| D14 | Período: UTC puro, dia local inclusivo ou fuso do servidor? | Datas civis escolhidas no fuso IANA explícito, convertidas a UTC `[startInclusive,endExclusive)`; relógio temporal declarado por ficha. | Fuso default de UI ainda será decidido; transições DST e bordas serão testadas no P2. Não alterar snapshots terminais. |
| D15 | Zero, ausência, parcial, stale: um número ou estados explícitos? | `AVAILABLE`, `NO_DATA`, `PARTIAL`, `STALE`, `UNAVAILABLE` e metadados por fonte. | `0` só quando medido; `null` em D=0; subtotal separado de total; sync stale mantém último conhecido. Legado conserva limitações. |

### TCC_ALIGNMENT_NOTE

- Quadro 346 (RF18) usa PRs **fechadas** no denominador de retrabalho; Quadro 348 (RF54) escreve **total de PRs no período**. P3 implementa RF18 como fórmula canônica de I04, reutilizada por RF54/I06; a divergência permanece para alinhamento acadêmico com a orientadora.
- RF54 chama `merged/closed` de “aprovação em revisões”. Isso é a fórmula oficial do TCC e **não** equivale a parecer GitHub `APPROVED`. I19 é candidato futuro separado.
- UC14 pede filtros por período, Sprint e responsável, enquanto RF56 cobre explicitamente período. Uma ficha `U` não deve receber filtro aparente no painel.
- “Cobertura de implementação” de UC14 precisa ser reconciliada com a policy S1-09; não deriva de volume de commits.

**Regra de duração:** apresentar mediana como padrão para lead/cycle/merge/issue/Defect, média como contexto quando útil (I16), com tamanho da amostra e exclusões. P85/P95 não entram no catálogo inicial: amostra e decisão de usuário ainda não demonstram valor.
