# PLANNING-QA-FIX-02

## Decision

**PLANNING-QA-FIX-02 — TECHNICALLY PASS**

B1, B2 e I1 RESOLVED localmente. Fluxo real API/MySQL → browser passou sem associação manual.
Esta execução não é CI remoto nem substitui a próxima QA final de Planning.

## Baseline

| Campo | Valor |
| --- | --- |
| Branch | `joao-dev-v2` |
| HEAD | `d0b87c2287e40ba2ddc4fa94d7a4e181a3bd3576` |
| Working tree inicial | Limpo |
| Node | `v22.23.2` |
| MySQL | `9.7.1`, localhost:3306 |
| Equivalência CI | **NOT CI-EQUIVALENT**; CI usa MySQL 8.4.8 |
| Test DB | `traceflow_test_planning_fix_02_20260904` |
| Browser DB | `traceflow_test_planning_fix_02_core_20260904` |

Ambos os schemas foram criados exclusivamente nesta tarefa; bancos preexistentes não foram
limpos ou alterados. Os quatro documentos obrigatórios foram lidos integralmente antes do código,
além de CONTRIBUTING e ADR-010/ADR-011. O relatório anterior estava fora do repositório:
o usuário indicou [a cópia canônica desta QA](/private/tmp/planning-final-qa-20260904/PLANNING_FINAL_INTEGRATED_QA.md).
Não foi criada uma cópia divergente em docs/qa.

## B1 — Automatic Sprint Carry-over

**Status: RESOLVED.** A causa era `planBacklogReturn` incondicional em estados terminais;
nenhum destino era selecionado. O service agora seleciona o menor `startDate` válido de Sprint
PLANEJADA do mesmo projeto, posterior/contígua ao fim da origem, com menor ID no empate.
Reutiliza `sprintsOverlap` e a fronteira semiaberta. Atual/anterior, outro projeto e estados
EM_ANDAMENTO/CONCLUIDA/CANCELADA não são destinos.

Pending Task definition: ponteiro atual igual à origem e status diferente de CONCLUIDO.
Completed Tasks: permanecem na origem. Removidas antes do close não são ressuscitadas.
Added-after-start pendente participa normalmente da transferência.

No-next-Sprint fallback: backlog, sem criação automática. Cancelamento mantém backlog.
Transaction: snapshot + fechamento + plano canônico de escopo + ponteiro + histórico + eventual
conclusão do Marco pertencem à mesma transação. Os locks vêm antes das leituras, na ordem
Project → Sprints do projeto por ID → Tasks atuais da origem por ID → Marco.
Capacidade do destino continua em 100; excesso provoca rollback integral, sem salto para outra Sprint.

History: uma entrada SPRINT origem → destino, com actorUserId do fechamento. A origem congelada
não é fechada novamente pelo plano; o destino reutiliza a participação histórica quando houver.
API contract: `carryOver: {destinationSprintId,destinationSprintName,movedTasks}` aditivo;
`returnedToBacklog=0` com destino, `carryOver=null` no fallback. Mensagem e confirmação refletem isso.

Tests: 11 casos de integração em `planning-carry-over.test.js`, mais contrato HTTP autenticado
com fechamento concorrente [200,409]. Há prova de rollback com falha injetada **depois** de duas
Tasks já terem sido transferidas dentro da transação; nada fica persistido após a falha.
Reentrada, capacidade, múltiplas futuras, outro projeto, estados inválidos, fallback/cancelamento,
double close e preservação histórica passaram. Empate real não é permitido pela API devido ao
overlap; desempate defensivo testado no domínio. Nenhuma assertion foi relaxada.

## CORE FLOW

Sprint 1: [01/09/2026, 05/09/2026) UTC. Sprint 2: [05/09/2026, 12/09/2026), inicialmente PLANEJADA.

| Task | Pontos no close | Presença no start | Estado no close | Resultado automático |
| --- | ---: | --- | --- | --- |
| T1 | 3 | Sim | CONCLUIDO | S1 |
| T2 | 5 | Sim | EM_ANDAMENTO | S2 |
| T3 | 8 | Removida antes | Fora do escopo | Sem Sprint |
| T4 | 13 | Adicionada depois | A_FAZER | S2 |

Close result: HTTP 200, CONCLUIDA, movedTasks=2, returnedToBacklog=0.
Sprint 2 automatically received: T2/T4, imediatamente visíveis no Kanban por recorte S2.
Manual association required: **NO**. O start posterior de S2 captura T2/T4 no baseline.

[HTTP/DB e todas as etapas](/private/tmp/planning-qa-fix-02/core-evidence.json),
[Kanban S2 antes de qualquer trabalho posterior](/private/tmp/planning-qa-fix-02/before-sprint2-dark.png).

## Sprint 1 Frozen Verification

| Indicador | Imediatamente após close | Depois do trabalho em S2 |
| --- | --- | --- |
| Tasks no fechamento | 3 | 3 |
| Concluídas | 1 | 1 |
| Pontos concluídos/total | 3/21 | 3/21 |
| Progresso visual por pontos | 14% | 14% |
| Planejamento | 2 Tasks; 8 pontos | Idêntico |
| Scope change | added T4; removed vazio | Idêntico |
| Burndown real | [21, 21, 21, 18] | Idêntico |
| Burndown ideal | [21, 14, 7, 0] | Idêntico |
| Cutoff | `2026-09-04T23:54:13.606Z` | Idêntico |

Depois: S2 iniciou, T2 passou a CONCLUIDO, T4 a EM_ANDAMENTO; esforços T2 5→1 e T4 13→34;
T1 3→13 também foi exercitado, reproduzindo o DTO corrente de 2/3 e 14/48. Títulos, prioridade,
deadline próprio e rastreabilidade foram alterados via API real. S1 continuou 1/3, 3/21, 14%.

Comparison: **IDENTICAL**. SHA-256 normalizado: `10c8a8a424655530b363fc5599c9887c7c2554adeff7ae1a1c1fd5aeba69e401`.
A comparação contém Sprint/historicalSummary, baseline, planned/current, scopeChange, burndown,
cutoff e todas as participações de S1; metadata de continuidade futura não substitui esse histórico.
Os testes existentes 5→13, 5→1 e exclusão/reentrada/remoção posterior também passaram.

[Evolução antes Light](/private/tmp/planning-qa-fix-02/before-evolution-light.png),
[Evolução depois Dark](/private/tmp/planning-qa-fix-02/after-evolution-dark.png).

## B2 — Frozen Terminal Presentation

**Status: RESOLVED.** A causa era `summarizeSprintTasks` sobre Task DTOs atuais em surfaces
terminais. O backend agora projeta `historicalSummary` dos snapshots existentes em um único
calculator, usado por detalhe, listagem, Schedule e progress. A listagem busca participações em
lote; teste verifica uma única leitura para dez Sprints. Nenhum N+1 de `/progress` foi introduzido.

SprintProgressPanel: top metrics e gráfico descrevem o mesmo fechamento.
SprintList: card, contagens, pontos, barra e texto acessível usam a projeção congelada.
MilestoneSprintsPanel: S1=21 históricos + S2=35 live = 56; progresso do Marco continua 1/2=50%.
A escolha frontend é única, em `getSprintDisplayMetrics`.

Active Sprint regression: PLANEJADA/EM_ANDAMENTO continuam recalculando Tasks/effort atuais.
Legacy behavior: campos desconhecidos são null, com historicalLimitations; UI usa — e
“Dados históricos indisponíveis.”, sem Task atual como fallback. Soma do Marco não apresenta
um total parcial como completo. Zero real continua distinto de dado indisponível.

## I1 — Current Sprint in Schedule

**Status: RESOLVED.** Antes, o DTO omitia sprintId e o helper usava a primeira Sprint histórica.
New authority: **Task.sprintId**, agora presente no DTO minimizado do Schedule.
Sprint 2: lookup pelo ID retorna S2 para T2/T4. Backlog: null retorna Sem sprint.
Historical membership: preservado; Task concluída ainda apontando para S1 mostra S1.
Dedupe: uma Task por ID; ordens S1/S2 e S2/S1 produzem o mesmo resultado.
Deadline próprio permanece intacto; sem deadline não se cria data artificial.

[Rótulos S1/S2/backlog renderizados](/private/tmp/planning-qa-fix-02/schedule-labels-1-dark.png),
[fallback em projeto sem próxima Sprint](/private/tmp/planning-qa-fix-02/schedule-labels-2-light.png).

## New Business Rules

| Regra | Resultado |
| --- | --- |
| BR-SPRINT-016 | PASS — carry-over automático consistente |
| BR-SPRINT-017 | PASS — fallback backlog |
| BR-SPRINT-018 | PASS — concluída não transfere |
| BR-SPRINT-019 | PASS — histórico preservado |
| BR-SCHEDULE-013 | PASS — contexto atual pelo ponteiro |

Rules total after update: **107**, sem duplicados. As 102 anteriores permanecem textualmente
intactas: [comparação](/private/tmp/planning-qa-fix-02/rules-preservation.json), [inventário](/private/tmp/planning-qa-fix-02/rule-inventory.json).

## Regression — Existing Sprint Rules

| Regra | Resultado e evidência |
| --- | --- |
| BR-SPRINT-006 | PASS — snapshot na transação de start |
| BR-SPRINT-007 | PASS — T1/T2; T3 fora |
| BR-SPRINT-008 | PASS — T4 e reentrada tardia added |
| BR-SPRINT-009 | PASS — removida depois preserva planned |
| BR-SPRINT-010 | PASS — composição terminal congelada |
| BR-SPRINT-011 | PASS — proteção do Marco de Sprint terminal |
| BR-SPRINT-012 | PASS — pontos live/frozen, zero sem NaN |
| BR-SPRINT-013 | PASS — snapshots + DTO + renderização |
| BR-SPRINT-014 | PASS — histórico idêntico depois de S2 |

Suítes completas: `planning-history`, `rf10-sprint-schedule`, `schedule-contracts`, unitários
Sprint/progress/burndown/summary, mais todos os testes frontend/backend.

## Milestones Regression

PASS: conclusão automática, progresso por Sprints válidas, proteção terminal e associação parcial.
Painel renderizado mantém 21+35=56 pontos e 50% por Sprints, nos dois temas.

## Schedule Regression

PASS: intervalos, markers, prazos próprios, próximos prazos, dedupe, ordem histórica e contexto atual.

## Kanban Regression

PASS nas suítes completas: DnD, rollback, 409/reconcile, filtros de Sprint e summary.
Smoke real confirmou S2 automaticamente preenchida. Nenhum fluxo novo de movimentação foi criado.

## Task History

PASS: troca direta S1→S2, actor correto e uma única entrada por Task; eventos anteriores preservados.
Fechamentos concorrentes/repetidos não duplicam participação, history ou movimentação.

## Traceability / Comments

PASS: carry-over preserva Requirement e comentário comparado integralmente na integração nova.
Suítes completas de vínculos, Comments e SSE passaram. O stream permanece project/task-scoped;
a transferência não muda projectId/taskId. Não se afirma nova homologação externa do GitHub.

## Browser Smoke

Chrome controlado, aplicação real, backend local próprio em 3197, frontend em 5197, autenticação
artificial real e schema separado. Fechamento/mutations via API; leitura e navegação pelo browser.

Sprint 1: valores e gráfico congelados antes/depois. Sprint 2: T2/T4 no recorte sem associação manual.
Milestone: 56 pontos e 50%. Schedule: S2 atual e Sem sprint no fallback.
Light: PASS. Dark: PASS. Console: zero erros/warnings capturados no smoke final.

[Evidência de verificações](/private/tmp/planning-qa-fix-02/browser-evidence.json), [geometria dos rótulos](/private/tmp/planning-qa-fix-02/browser-labels.log).
O primeiro coletor interrompeu no Cronograma por usar uma classe CSS inexistente; o DOM mostrava
os rótulos corretos. O seletor temporário foi corrigido, as verificações renderizadas foram
concluídas e as capturas anteriores foram preservadas. Nenhum teste de produto foi relaxado.
Não houve promoção no Visual Validation Log ou no inventário de surfaces.

## Backend Impact

API: aditiva, com carryOver no fechamento, historicalSummary nos endpoints de leitura e
Task.sprintId no Schedule. Route → Controller → Service → Repository → Prisma preservado.
Schema: **UNCHANGED**. Migrations: **NONE**. As 46 migrations existentes foram aplicadas aos schemas
novos. Nenhum backfill, reset, migration antiga editada ou alteração no TCC.

## Frontend Gates

PASS: lint, format check, focais novos (12), full tests **699/699**, coverage e build.
Arquitetura/segredos: scripts canônicos compartilhados do backend inspecionam o repositório.
Audit: PASS, zero high/critical. Build mantém aviso conhecido de chunk >500 kB, sem falha.
[Resultados e durações](/private/tmp/planning-qa-fix-02/frontend-gates.json).

## Backend Gates

PASS: lint, format check, focais, unit **554/554**, integração/API **359 PASS + 5 skips canônicos**,
coverage, Prisma validate, migration status, arquitetura, segredos e audit (zero high/critical).
Supply-chain: **12/12** testes de política. [Resultados e durações](/private/tmp/planning-qa-fix-02/backend-gates.json).

Antes da implementação: 2 regressões backend e 6 frontend falharam pelas causas B1/B2/I1.
Na integração das mudanças foram ajustadas as fixtures do contrato aditivo e do snapshot; uma
variável não usada no teste novo também foi corrigida. Gates finais foram executados depois.
Essas tentativas permanecem nos logs red/focal/preflight; não são falhas de cobertura final.

## Coverage

Frontend: statements **80.57%**, branches **73.78%**, functions **76.03%**, lines **82.73%**.

| Backend | Testes | Statements | Branches | Functions | Lines | Resultado |
| --- | --- | --- | --- | --- | --- | --- |
| Run 1 | 913 PASS + 5 skips | 90.28% | 79.09% | 94.04% | 92.73% | [PASS](/private/tmp/planning-qa-fix-02/backend-coverage-1.log) |
| Run 2 | 913 PASS + 5 skips | 90.28% | 79.09% | 94.04% | 92.73% | [PASS](/private/tmp/planning-qa-fix-02/backend-coverage-2.log) |
| Run 3 | 913 PASS + 5 skips | 90.28% | 79.09% | 94.04% | 92.73% | [PASS](/private/tmp/planning-qa-fix-02/backend-coverage-3.log) |
| Run 4 | 913 PASS + 5 skips | 90.26% | 79.06% | 94.04% | 92.73% | [PASS](/private/tmp/planning-qa-fix-02/backend-coverage-4.log) |
| Run 5 | 913 PASS + 5 skips | 90.26% | 79.06% | 94.04% | 92.73% | [PASS](/private/tmp/planning-qa-fix-02/backend-coverage-5.log) |

Cinco execuções completas consecutivas com reports produzidos; nenhum retry, novo skip ou
serialização adicional. Os 5 skips canônicos são 4 de e11-legacy-responsibility e 1 de e6-backfill,
que exigem estado pré-LR.2. A diferença mínima de statements/branches nos runs 4–5 está em um
ramo do `github-sync-run.service.js` preexistente; linhas/functions e todos os testes permaneceram
iguais. Não se declara que os cinco percentuais foram idênticos.

## Documentation

API_CONTRACTS: fechamento, DTO histórico, legado e contexto atual atualizados.
PLANNING_HISTORY: continuidade, apresentação congelada e limitações documentadas.
PLANNING_BUSINESS_RULES: cinco regras autorizadas adicionadas após validação focal.
ADR-011 D07: revisado por decisão explícita desta tarefa; ADR-010 auditado e preservado.
PLANNING_FINAL_INTEGRATED_QA: **PRESERVED**, no caminho informado pelo usuário;
SHA-256 `8e315c0d7c8c008662465d77a48b1e8940e5bd284f95136e212234e5c04ae0ac` inalterado.

## Git

Branch: `joao-dev-v2`. HEAD: `d0b87c2287e40ba2ddc4fa94d7a4e181a3bd3576`.
Working tree final: alterações locais exclusivamente desta correção, listadas abaixo.
Diff check: PASS. Commit/push/merge/rebase/reset/PR review: **NOT EXECUTED**.

Changed files:

- `backend/src/modules/sprints/repositories/sprint.repository.js`
- `backend/src/modules/sprints/services/schedule.service.js`
- `backend/src/modules/sprints/services/sprint-crud.service.js`
- `backend/src/modules/sprints/services/sprint-progress.service.js`
- `backend/src/modules/sprints/services/sprint-status.service.js`
- `backend/src/modules/sprints/sprint.controller.js`
- `backend/src/modules/sprints/sprint.summary.calculator.js`
- `backend/test/api/schedule-contracts.test.js`
- `backend/test/integration/planning-carry-over.test.js`
- `backend/test/unit/sprint.service.test.js`
- `backend/test/unit/sprint.summary.calculator.test.js`
- `docs/api/API_CONTRACTS.md`
- `docs/architecture/ADR-011-MILESTONE-SPRINT-INVERSION.md`
- `docs/data/PLANNING_HISTORY.md`
- `docs/qa/PLANNING_BUSINESS_RULES.md`
- `docs/qa/PLANNING_QA_FIX_02.md`
- `frontend/src/features/schedule/components/MilestoneSprintsPanel.jsx`
- `frontend/src/features/schedule/components/SprintList.jsx`
- `frontend/src/features/schedule/components/SprintProgressPanel.jsx`
- `frontend/src/features/schedule/components/milestone-view.js`
- `frontend/src/features/schedule/components/schedule-calendar.js`
- `frontend/src/features/schedule/components/schedule-display.js`
- `frontend/test/features/MilestonesScreen.test.jsx`
- `frontend/test/features/SprintsScreen.test.jsx`
- `frontend/test/features/planning-terminal.test.jsx`
- `frontend/test/features/schedule-calendar.test.js`

## Remaining Issues

- BR-UX-005: **ENVIRONMENT BLOCKED** para touch/DnD real; mouse/automação não homologam touch.
- **KANBAN KEYBOARD MOVE ACCESSIBILITY GAP** preservado para decisão separada.
- MySQL local diferente da CI: **NOT CI-EQUIVALENT**; nenhuma CI remota executada.
- Limitações históricas legadas continuam explícitas, sem dados fabricados.
- Limpeza concluída: os dois schemas exclusivos foram removidos e sua ausência foi confirmada;
  servidores temporários e browser encerrados, perfil privado artificial removido. Evidência em
  [cleanup.json](/private/tmp/planning-qa-fix-02/cleanup.json). Bancos preexistentes preservados.

## Recommendation

**READY FOR FINAL PLANNING QA**
