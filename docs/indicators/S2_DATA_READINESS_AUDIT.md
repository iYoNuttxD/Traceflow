# S2 — Auditoria de prontidão dos dados (P0 + fundação P1)

**Escopo:** S2-04/S2-05, RF15–RF18/RF36/RF54–RF56, UC14 e indicadores derivados do [catálogo canônico](S2_INDICATOR_CATALOG.md). **Data:** 2026-09-24. As medições locais da seção 1 são fotografia **P0**, anterior à implementação. A [fundação P1](S2_INDICATOR_DATA_FOUNDATION.md) registra schema, sync e testes novos. Nenhum indicador, endpoint ou painel foi entregue no P1.

## 1. Baseline e fontes consultadas

| Item | Resultado |
|---|---|
| Branch / HEAD | `daniel-dev` / `54ea185e42bc95d07c0ade91b89ace6f64375b99` |
| Working tree inicial desta continuação | Apenas o rascunho não rastreado `docs/data/S2_04_S2_05_INDICATOR_CONTRACT_READINESS_AUDIT.md` da resposta anterior; nenhum arquivo versionado alterado. O rascunho foi consolidado nos dois documentos canônicos e removido. |
| `git diff --check` / `git diff --stat` inicial | Sem erro / vazio; arquivos não rastreados não aparecem no stat. |
| Node / Prisma | Node `v26.9.0` no shell; `@prisma/client` `6.12.0`. Nenhum teste frontend foi executado sob Node 26. |
| Banco | `.env`: `NODE_ENV=development`, `localhost:3306/traceflow`; teste `localhost:3306/traceflow_test`, URL distinta. `@@global.read_only=0`, `@@session.transaction_read_only=0`; exclusivamente consultas agregadas `SELECT`, sem escrita. |

Fontes lidas: [roadmap](../../TRACEFLOW_ROADMAP_INCREMENTAL.md), documento oficial Somativa 2 (DOCX homônimo do PDF referenciado pela arquitetura; capítulos 1, 2, 3, Quadros 343–350 e UC14), [matriz RF](../traceability/RF_TECHNICAL_MATRIX.md), [contratos API](../api/API_CONTRACTS.md), [arquitetura](../architecture/SYSTEM_ARCHITECTURE.md), [estrutura frontend](../architecture/FRONTEND_STRUCTURE.md), [design system](../design/DESIGN_SYSTEM.md), [inventário visual](../design/UI_SURFACE_INVENTORY.md), [histórico de Planning](../data/PLANNING_HISTORY.md), [esforço](../data/TASK_EFFORT_HISTORY.md), [testes](../data/TEST_CASE_HISTORY.md), [defeitos](../data/DEFECT_HISTORY.md), [projeção S1-09](../data/REQUIREMENT_TRACEABILITY_HISTORY.md), [schema](../../backend/prisma/schema.prisma) e implementação atual dos módulos `projects`, `tasks`/Kanban, `sprints`/`milestones`, `github`/`commits`/`pullRequests`/`issues`, `requirements`/`traceability`, `testCases`, `defects`, esforço e memberships. O PDF não foi editado; a extração textual disponível veio do DOCX homônimo e está identificada como limite de verificação.

O [ProjectDetailsScreen](../../frontend/src/features/projects/pages/ProjectDetailsScreen.jsx) em `/projects/:projectId` mostra hoje contexto de projeto, GitHub e equipe, sem painel analítico. O catálogo propõe a futura composição; não muda a superfície aprovada nem adiciona `/dashboard`.

## 2. Resultado RF/UC14 e alcance

| Requisito | Fonte oficial e conclusão técnica |
|---|---|
| RF15 | `CONCLUIDO / total Task`; fotografia atual calculável. `Task.updatedAt` não serve como série histórica. |
| RF16 | Commits distintos da branch **literal `main`** por usuário e período; sync completo reconcilia `CommitBranch` ancorado em `headSha`. Autoria por `Commit.authorGithubUserId = GitHubIdentity.githubUserId`; sem match permanece não associado. |
| RF17 | `TaskMovement.responsibleUserIdSnapshot` congela responsável para novas transições, inclusive mutação conjunta. Movimentos antigos continuam `null`; o cálculo RF17 ainda não existe. |
| RF18 | `PullRequestLifecycleEvent` guarda eventos reais `CLOSED/REOPENED/MERGED` por ID do GitHub. Um sync completo permite backfill do que a API retorna; períodos sem cobertura não são inferidos. |
| RF36 | Combina RF16/RF17. Volume de atividade não é avaliação humana; autores não associados ficam explícitos. |
| RF54 | Fórmulas de trabalho deste P0: reabertas/fechadas e mescladas/fechadas. “Aprovação” = taxa de merge oficial, sem alegar GitHub Review APPROVED. Divergência textual RF18/RF54 do TCC está marcada `TCC_ALIGNMENT_NOTE` no catálogo. |
| RF55 | Planejamento + repositório + indicadores, com progresso, atividade, cobertura e qualidade de UC14. Sem score composto arbitrário. |
| RF56 | Período por relógio de cada indicador; `CURRENT_STATE`/snapshot congelado não recebem filtro enganoso. |
| UC14 | Projeto autenticado, dados mínimos, cards/listas/gráficos, filtros período/Sprint/responsável, indicadores disponíveis quando outros falham, último estado GitHub com alerta de sincronização. O catálogo dá compatibilidade `S/N/U` por ficha. |

### Amostra local agregada

Consultas read-only em 2026-09-24; sem dados pessoais, hashes ou conteúdo de artefatos. **12 projetos não excluídos**; projetos 1 e 2 têm Tasks/artefatos GitHub. Esta fotografia não homologa dados externos nem garante completude histórica.

| Fonte | Projeto 1 | Projeto 2 | Implicação |
|---|---:|---:|---|
| Tasks / atualmente concluídas / sem `responsibleUserId` | 5 / 1 / 4 | 15 / 7 / 0 | RF15 atual possível; RF17 por pessoa desigual. |
| Movimentos / entradas `CONCLUIDO` / saídas `CONCLUIDO` | 4 / 2 / 1 | 27 / 10 / 3 | Conclusões repetidas existem; eventos ≠ Tasks únicas. |
| Commits / links à `main` | 1.856 / 112 | 1.303 / 305 | Base de atividade, sujeita a ancestralidade/frescor. |
| Links `main` sem match direto de login em `GitHubIdentity` | 72 | 98 | Exploração por login, não prova de autoria ausente; não inferir vínculo por nome. |
| PRs / fechadas / mescladas correntes | 40 / 40 / 40 | 20 / 20 / 19 | Nenhuma contagem confiável de reabertura; merge ≠ Review APPROVED. |
| Sprints não excluídas | 0 | 3 (planejada, em andamento, concluída) | Base de snapshots apenas no projeto 2. |
| Requirements / TestCases / TestExecutions / Defects | não aferido | 8 / 7 / 9 / 4 | Execuções: 3 PASS, 5 FAIL, 1 BLOCKED; não substituir qualidade de PR. |
| Última `GitHubSyncRun SUCCEEDED` | 2026-08-21 16:06 UTC | 2026-09-20 21:43 UTC | Exibir `asOf`/stale; sem limiar inventado nesta etapa. |

As duas branches observadas nos projetos com artefatos incluem uma `main` e uma default em cada um. Os outros projetos não tinham branch observada na consulta agregada; RF16 deve distinguir “sem branch main” de `0 commits`.

## 3. Inventário de modelos, campos, histórico e confiança

Esta matriz é o mapa **indicador → modelos → campos → histórico → confiança → gap**; IDs e fichas completas estão no catálogo. “Confiança alta” significa fonte e semântica suficientes para a fotografia ou cálculo proposto, não entrega funcional. “Baixa” significa que o dado necessário não é demonstrável no histórico atual.

| IDs | Modelos/campos necessários | Histórico disponível? | Confiança / gap |
|---|---|---|---|
| I01, I23, I26–I30 | `Task.projectId,status,createdAt,deadline,responsibleUserId,estimatedEffort`; `TaskMovement` para status. | Atual sim; exclusão física não preserva universo completo. | Alta para fotografia; baixa para série retroativa. |
| I02, I09 | `Commit.hash,date,authorGithubUserId`; `CommitBranch`, `GitBranch.name,lastSyncedGeneration`; `GitHubIdentity.githubUserId`, membership. | Membership corrente reconciliada após scan completo; links legados antes do primeiro sync P1 são parciais. | Alta para volume pós-sync; associação inequívoca só com ID técnico. |
| I03, I05, I20–I22, I24–I25 | `TaskMovement.fromStatus,toStatus,movedAt,responsibleUserIdSnapshot`; `Task.createdAt`. | Snapshot novo existe; legado `null`, Task excluída e baseline inicial ainda limitam séries. | Alta para transição nova; parcial para histórico antigo. |
| I04, I06, I11–I12, I15–I18, I73–I74 | `PullRequestLifecycleEvent.eventType,occurredAt,providerEventId`; datas/estado de PR corrente; `Issue` equivalente. | PR lifecycle real após sync P1; completude retroativa limitada ao retorno da API. Issue não ganhou lifecycle. | Alta para eventos PR coletados, parcial sem cobertura inicial ou após sync falho. |
| I10, I13–I14, I17–I18 | `PullRequest`/`Issue.state` e timestamps GitHub. | Fotografia após sync; histórico de reabertura ausente. | Média; stale/fechamento reaberto precisa aviso. |
| I19 | GitHub Reviews (não modelado). | Não. | Baixa; requer coleta GitHub distinta de RF54. |
| I31–I35, I44 | `Task.estimatedEffort,actualEffort,legacyActualEffort`; `TaskTimeEntry`, `TaskEffortHistoryEntry`; Sprint `closingTaskSnapshot`. | Histórico S1-09 append-only sem backfill anterior; snapshots terminais podem ser legados. | Alta para atual e terminais novos; parcial para legados. Reusar S1-06. |
| I36–I45, I47, I71–I72 | `Sprint`, `SprintTask.plannedAtStart,pointsAtPlanning,pointsAtClose,closingTaskSnapshot,closedAt,completedAtClose,addedAt,removedAt,carriedFromSprintId`. | Frozen terminal sim, com `historicalLimitations` explícitas. | Alta para burndown/summary canônicos; limites legados explícitos. |
| I46 (P5.1) | `Sprint.burnupCoverageStartedAt`, `SprintBurnupEvent.taskKey,type,previousPoints,newPoints,fromStatus,toStatus,occurredAt`. | Íntegro para Sprint iniciada após captura; âncora parcial para Sprint já ativa; terminal anterior sem prova. | Alta condicional à cobertura integral e cadeia consistente; sem backfill inferido. |
| I48–I52 | `TestCase.currentVersion,deletedAt,status`; `TestExecution.result,executedAt,testCaseVersion`; steps. | Execuções versionadas persistem. | Alta para execuções; saúde atual deve reutilizar última execução da versão atual da projeção S1-09. |
| I53–I58 | `Defect.status,severity,createdAt,deletedAt`; `DefectHistoryEntry.action,occurredAt`; `DefectRetest`, `TestExecution.result`. | Eventos de validação existem para fluxo novo; legado sem backfill. | Alta para fotografia/retestes novos; parcial para tempo histórico. |
| I59–I60 | `Defect.requirementId`, `DefectTask.ORIGIN`, Task→Requirement. | Relações atuais; projeção S1-09 deduplica caminhos. | Alta para concentração atual; um Defect pode pertencer a mais de um Requirement. |
| I61–I67 | Requirement, Task, vínculos técnicos, TestCase, Defect, `RequirementTraceabilityState/HistoryEntry`, policy S1-09. | Situação atual + transições; histórico de vínculos anterior pode faltar. | Alta para current; período histórico inseguro. Não duplicar policy. |
| I68 | Mesmas fontes I61–I67. | Irrelevante à decisão. | **NOT_RECOMMENDED**: dimensões não são subconjuntos cumulativos. |
| I69–I70 | `Milestone.status,dueDate,deletedAt`. | Estado atual e datas; sem fotografia histórica do prazo. | Alta para current; período histórico não recomendado. |

### Baselines de domínio que não podem ser reescritos

- Sprint terminal: [PLANNING_HISTORY](../data/PLANNING_HISTORY.md), `SprintTask` e `closingTaskSnapshot` são autoridade; `Task.sprintId/status/actualEffort` vivos não substituem a participação congelada. O [serviço de progresso](../../backend/src/modules/sprints/services/sprint-progress.service.js) já entrega `historicalLimitations`, `effort` e `burndown`; [calculadora de burndown](../../backend/src/modules/sprints/sprint.burndown.calculator.js) é a owner do cálculo.
- Esforço: [TASK_EFFORT_HISTORY](../data/TASK_EFFORT_HISTORY.md) e [sprint.effort.calculator.js](../../backend/src/modules/sprints/sprint.effort.calculator.js) definem horas, legado e incompletude. `actualEffort` é derivado; não somar sessões novamente sobre o campo derivado.
- TestCase/Requirement: [REQUIREMENT_TRACEABILITY_HISTORY](../data/REQUIREMENT_TRACEABILITY_HISTORY.md) exige última execução da **currentVersion** por `executedAt DESC,id DESC`; `VALIDADO` legado não é validação atual. [readProjectionMetrics](../../backend/src/modules/traceability/requirement-projection-summary.repository.js) já une relações tipadas e deduplica TestCases/Defects por requisito.
- Projeto/membership: aplicar autorização de membro ativo antes de qualquer agregado, inclusive métricas por responsável; `OWNER` não é papel global. Dados apagados/anônimos não recebem inferência retrospectiva de autoria.

## 4. Prontidão P0 — fotografia histórica

Esta distribuição registra a fotografia P0. O status atual de cada ID está no catálogo e nas atualizações P1–P5.1 abaixo; I46 deixa `NEEDS_HISTORY` no P5.1 somente para Sprints com cobertura integral, sem promover o RF inteiro a “entregue”.

| Status | IDs e justificativa |
|---|---|
| READY | I01, I23, I26, I27, I36, I38–I42, I44, I45, I53, I61, I67, I71: fonte/semântica atuais ou cálculo existente; disponibilidade por projeto ainda depende de dados/snapshot. |
| DERIVABLE | I02–I04, I06, I09–I18, I21–I22, I28–I35, I37, I43, I47–I52, I54–I56, I58–I60, I62–I66, I69, I70, I72–I74: fonte/contrato existem, cálculo/painel não. I02–I04/I06 dependem de sync e cobertura comprovados; I14 mantém limite de Issue. |
| NEEDS_HISTORY | I20, I24, I25, I46, I57: baseline antigo, exclusões ou série intermediária insuficientes. |
| NEEDS_SCHEMA | Nenhum; P1 adicionou modelo de PR e campos mínimos, sem `IndicatorSnapshot`. |
| NEEDS_GITHUB_DATA | I19: reviews formais não são coletadas. |
| NEEDS_PRODUCT_DECISION | I05, I07, I08: composição e "ativo no período" ainda precisam de especificação de produto; D01–D15 estão aprovadas. |
| NOT_RECOMMENDED | I68: funil não cumulativo. |

**Distribuição P1:** 16 READY, 48 DERIVABLE, 5 NEEDS_HISTORY, 0 NEEDS_SCHEMA, 1 NEEDS_GITHUB_DATA, 3 NEEDS_PRODUCT_DECISION, 1 NOT_RECOMMENDED = 74. P0: 16/39/6/0/1/11/1. Mudança de prontidão não marca nenhum RF como IMPLEMENTADO.

## 5. Gaps que bloqueiam ou limitam P1/P2

| Gap | Evidência atual | Decisão/efeito |
|---|---|---|
| Histórico de PR reaberta | `PullRequestLifecycleEvent` guarda eventos oficiais após sync; `PullRequest` ainda é fotografia corrente. | Backfill depende de eventos que a API GitHub realmente retorna e de sync completo. Sem cobertura, RF18/RF54 ficam PARTIAL/UNAVAILABLE no futuro Engine. |
| GitHub Reviews | [github.client.js](../../backend/src/modules/github/github.client.js) lista PRs, não reviews; schema não contém review. | I19 exige coleta, **se** aprovado como indicador separado; RF54 merge/closed não depende disso. |
| Branch `main`/identidade | P1 reconcilia links por branch após varredura completa do SHA e grava `Commit.authorGithubUserId` quando disponível. | Antes do primeiro sync P1, links legados não têm generation; projeto sem `main` permanece UNAVAILABLE. Sem GitHub ID, autor não associado. |
| Task e responsável no tempo | Novos `TaskMovement` têm snapshot nullable do responsável resultante; antigos continuam `null`; exclusão física de Task remove seus movimentos. | D02–D06 aprovadas; dados legados e Tasks excluídas permanecem PARTIAL, sem backfill por nome. |
| Filtros/história de estado | `Task.updatedAt`, `PullRequest.updatedAtGithub`, `Defect.updatedAt` não são relógios de todos eventos. | D14/D15: intervalo UTC half-open por ficha; `U` quando filtro causaria afirmação falsa. |
| Burnup e Velocity | `SprintTask` guarda baseline e fechamento; mudanças intermediárias de pontos podem faltar. | D07/D08: publicar apenas com série justificável; respeitar congelamento. |
| Projeção S1-09 | Summary atual não constitui “as-of” de qualquer dia. | D11: usar policy existente para cobertura atual; série histórica exige estudo separado. |

### Endpoint legado `/tasks/metrics`

`GET /api/projects/:projectId/tasks/metrics` chama [task-metrics.service.js](../../backend/src/modules/tasks/services/task-metrics.service.js) e devolve `totalTasksCreated` por `Task.createdAt`. Está documentado em [API_CONTRACTS](../api/API_CONTRACTS.md) e coberto por teste de API; busca em `frontend/src` não encontrou consumidor. **Não atende RF15 nem RF17**. Recomendação: preservar contrato nesta etapa, não reaproveitar o nome para progresso e considerar depreciação apenas com inventário de clientes/telemetria em rodada posterior. O componente [TaskMetrics](../../frontend/src/features/tasks/components/TaskMetrics.jsx) calcula contagens atuais de outra fonte.

## 6. Índices e desempenho

Inventário estático P0 do [schema Prisma](../../backend/prisma/schema.prisma). P1 não criou os índices especulativos abaixo; o [documento de fundação](S2_INDICATOR_DATA_FOUNDATION.md) registra a medição e os índices estritamente necessários aos novos modelos/constraints.

| Consulta candidata | Índice no HEAD | Classificação | Risco de cálculo |
|---|---|---|---|
| Task por projeto/status | `Task(projectId,status)` | EXISTS | LOW |
| Task criada por período | `Task(projectId,createdAt)` | EXISTS | LOW |
| Task por projeto/Sprint | `Task(projectId,sprintId)` | EXISTS | LOW |
| TaskMovement por projeto/data | `TaskMovement(projectId,movedAt)` | EXISTS | MEDIUM para séries/reconstrução |
| TaskHistoryEntry por projeto/campo/data | `projectId,occurredAt` e `field,occurredAt` separados | LIKELY_NEEDED para atribuição histórica em volume | HIGH se reconstruir timeline por Task |
| Commit por projeto/data | `Commit(projectId,date)` | EXISTS | MEDIUM com join branch/autoria |
| CommitBranch por branch/commit | PK `(commitId,branchId)` + `branchId` | EXISTS | MEDIUM; `COUNT DISTINCT` e reachability importam |
| PullRequest por merge | Só `(projectId,createdAtGithub)` e `(projectId,updatedAtGithub)` | LIKELY_NEEDED para `(projectId,mergedAtGithub)` se volume justificar | LOW/MEDIUM |
| PullRequest por fechamento | Mesmos índices acima | LIKELY_NEEDED para `(projectId,closedAtGithub)` se volume justificar | LOW/MEDIUM |
| Issue por fechamento | Só projeto/criação e projeto/atualização | LIKELY_NEEDED para `(projectId,closedAtGithub)` se volume justificar | LOW/MEDIUM |
| TestExecution por projeto/execução | `(projectId,executedAt)` e índice de versão atual por caso | EXISTS | MEDIUM para current health |
| Defect por projeto/criação | Índices por estado, severidade, responsável, requisito; sem `(projectId,createdAt)` | LIKELY_NEEDED se volume justificar | LOW/MEDIUM |
| DefectHistoryEntry por projeto/data | `(projectId,occurredAt)` e `(defectId,occurredAt,id)` | EXISTS | MEDIUM |
| SprintTask por Sprint/Task | `UNIQUE(sprintId,taskId)`, `(sprintId,removedAt)` | EXISTS | LOW para summary; MEDIUM para burnup |
| SprintBurnupEvent por Sprint/data/ID (P5.1) | `(sprintId,occurredAt,id)` | EXISTS; EXPLAIN local usa índice | MEDIUM em volume elevado; sem N+1 |
| Milestone por projeto/prazo | `(projectId,dueDate)` | EXISTS | LOW |
| `IndicatorSnapshot`/índice genérico | Nenhuma consulta justifica por si | NOT_NEEDED agora | Evitar persistência/cache prematuros |

**Estratégia inicial:** agregações sob demanda com recorte por projeto e período; reutilizar endpoints/cálculos de Sprint e policy S1-09. Risco **HIGH** concentra-se em reconstrução diária do cumulative flow/Task histórica, burnup com escopo mutável, associação temporal pessoa–commit e projeção de requisitos em projetos grandes. [S1-09](../data/REQUIREMENT_TRACEABILITY_HISTORY.md) já lê agregados em lotes sob RepeatableRead; benchmark específico antes de propor cache/materialização. Nenhum cache ou `IndicatorSnapshot` nesta etapa.

**Risco estimado por ficha (sem benchmark):** `HIGH` para I02–I08, I20–I22, I24–I25, I46, I57 e I66, por dependência histórica, associação/joins ou agregação composta; `MEDIUM` para I15–I19, I31–I35, I44–I45, I47–I52, I58–I65, I67 e I73–I74, por junções, cálculo de duração, snapshots ou policy; `LOW` para as demais fichas calculáveis por contagem/consulta já existente. I68 é `NOT_RECOMMENDED` e seu custo não justifica implementação. Esses níveis são risco de cálculo **e** integridade, não tempos medidos.

**Atualização P4:** I20–I24 e I26–I35 possuem cálculo backend e API. I20/I24 continuam com cobertura histórica parcial quando faltam eventos; `eligibleCount`, `excludedCount` e `limitations` tornam essa lacuna visível. I25 conserva `NEEDS_HISTORY`: a API expõe somente série parcial da coorte sobrevivente com movimentos consistentes, ou `UNAVAILABLE` quando não há coorte comprovável. Nenhuma migração ou backfill P4 recupera Tasks excluídas fisicamente ou prova o estado inicial de todo o projeto. `EXPLAIN` no banco de teste vazio mostrou lookup por projeto para agregados/listas e range scan de `TaskMovement.movedAt` com sort por Task/data; não é evidência de custo em produção. Reavaliar índice composto apenas com volume representativo.

**Atualização P5:** I36–I45, I47, I71 e I72 têm cálculo backend/API, com as limitações de baseline e fechamento legados propagadas pelo owner de Sprint. I47 passou de `DERIVABLE` para `IMPLEMENTED BACKEND`: lê `CONCLUIDA` e `SprintTask` em lote e só publica `completedPoints` de snapshots íntegros; Sprints canceladas, atuais e legadas incompletas não viram velocity. I46 continua `NEEDS_HISTORY` e a API o informa como `UNAVAILABLE`/sem pontos. `SprintTask` preserva baseline, entrada/saída corrente e snapshot terminal, mas revisões intermediárias de estimativa não são garantidas e uma participação reativada reutiliza a linha, perdendo parte da cronologia intermediária. Nenhuma migration ou backfill foi feita no P5.

**Atualização P5.1:** I46 passa a **IMPLEMENTED BACKEND condicional**. `TaskEffortHistoryEntry` registra segundos realizados de sessões e não `estimatedEffort`; `TaskHistoryEntry` tampouco registra estimativa, `SprintTask` colapsa reentradas e hard delete elimina `TaskMovement`. Por isso a migration incremental introduz `SprintBurnupEvent` e `Sprint.burnupCoverageStartedAt`. Sprint nova captura baseline no start e mudanças de entrada/saída, estimativa e status na transação da mutação; uma Sprint ativa anterior recebe apenas âncora do estado no instante da migration (`PARTIAL`), sem datas inventadas. Sprint encerrada anterior segue `UNAVAILABLE`. O diário guarda `taskKey` sem FK para Task e FKs com cascade para Sprint/Project. I46 lê eventos em lote e devolve série somente para cobertura demonstrável; `PARTIAL` também informa `null` de estimativa e teto 180. O risco de performance do P0 permanece sujeito a medição em volume representativo; `EXPLAIN` local pequeno usou `(sprintId,occurredAt,id)`.

## 7. Dependências e proposta de roadmap futuro

```text
PR lifecycle history ──> RF18 ──> RF54 retrabalho ──> tendência de reabertura
GitHub Reviews (opcional) ──> I19, separado da fórmula oficial RF54
Task status + responsabilidade histórica ──> RF17 ──> lead/cycle/throughput/cumulative flow
S1-09 projection ──> implementação/coberturas/rastreabilidade atual
TestExecution + Defect + DefectRetest ──> qualidade de testes e reteste
SprintTask frozen ──> burndown/effort/velocity
SprintBurnupEvent + cobertura ──> I46 condicional
```

**Sequência após P1:** revisão humana da fundação; P2 Indicator Engine de progresso/atividade/fluxo/Sprint/GitHub; etapa posterior de qualidade, painel e filtros; homologação de fórmulas com amostra e fonte GitHub, desempenho e visual. O roadmap atual S2-04/S2-05 cobre os oito RFs e não foi alterado. Nenhum DPI foi convertido em RF oficial.

## 8. Riscos e gate de aceite local

- **Semântica:** denominador de retrabalho diverge entre Quadros 346/348; fórmula de merge é chamada “aprovação em revisões”; “ativo no período” e conclusão repetida exigem regra estável.
- **Dados:** PR lifecycle/reviews ausentes; links de commit à `main` podem ficar stale; dados legados de Task/Defect/Sprint têm limitações explícitas; exclusão física afeta séries de Task.
- **Produto:** painel com zero enganoso, filtro ignorado, score individual ou health score composto quebraria o propósito; notas de estado/limite são parte do contrato.
- **Operação:** sincronização GitHub não equivale a atualização em tempo real; comparar fontes com `asOf` distintos sem indicar isso seria enganoso.

**Gate P0 documental (histórico):** 8 RFs + UC14, categorias, fichas, D01–D15, gaps, índices, risco e arquivos foram conferidos antes do P1. Os gates de implementação P1 estão no [relatório de entrega](../deliveries/S2_P1_INDICATOR_DATA_FOUNDATION_REPORT.md).

**Resultado P0, antes desta implementação:** 74 IDs únicos; 16 READY, 39 DERIVABLE, 6 NEEDS_HISTORY, 0 NEEDS_SCHEMA, 1 NEEDS_GITHUB_DATA, 11 NEEDS_PRODUCT_DECISION, 1 NOT_RECOMMENDED. O `PASS LOCAL` P0 era restrito à auditoria documental; a distribuição vigente é a da seção 4. P1 não comprova homologação externa da GitHub App nem entrega os cálculos dos indicadores.
