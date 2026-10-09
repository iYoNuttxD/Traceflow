# Matriz vigente RF → código → teste

`IMPLEMENTADO` significa fluxo presente e protegido pela suíte; `PARCIAL` indica apenas parte do RF;
`NÃO IMPLEMENTADO` não deve ser inferido de campos isolados. GitHub OAuth é identidade de
autenticação; GitHub App/Installation é a autoridade de repositórios e artefatos. Homologações
externas permanecem distintas da cobertura automatizada. A sync GitHub e a inspeção
com sessão/API reais foram executadas no P10; isso não homologa SMTP, OAuth novo ou
webhooks de produção. As evidências e limitações atuais estão no
[relatório P10](../deliveries/S2_P10_FINAL_CODE_REVIEW_RELEASE_READINESS_REPORT.md).

## Decisões vigentes de identidade e acesso

- `OWNER` é o papel de administração de um projeto. Ele **não** é Administrador do Sistema, não possui autoridade global e não comprova a implementação de um módulo de administração global. Essa capacidade permanece apenas como ideia futura.
- Sem conta TraceFlow, uma pessoa não autentica nem acessa a plataforma. Uma pessoa com conta válida, mas sem `ProjectMembership` ativa, pode autenticar; `GET /api/projects` retorna apenas seus vínculos e recursos de projetos sem vínculo permanecem inacessíveis. Esse comportamento é intencional e não constitui lacuna do UC01.
- `POST /api/auth/forgot-password` mantém resposta pública uniforme para e-mail existente ou inexistente. A diferença em relação ao texto literal do UC02 é uma decisão de segurança contra enumeração de contas; tokens continuam restritos ao adapter de e-mail fora de testes controlados.
- `ProjectMembership` e `ProjectInvitation` são as fontes canônicas dos fluxos de equipe, perfis e convites entregues na L2.1. A L5.1 acrescenta a perspectiva pessoal do UC05. Código/link de acesso é uma capacidade adicional do produto e **não** é apresentado como requisito do TCC.

| RF | Fluxo funcional | Endpoint principal | Service | Persistência | Frontend | Evidência de teste | Estado |
|---|---|---|---|---|---|---|---|
| RF01 | cadastrar projeto | `POST /api/projects` | project-crud | Project, ProjectMembership | ProjectsScreen/ProjectForm | mvp-contracts, ProjectsPage | IMPLEMENTADO |
| RF02 | integrar repositório GitHub | GitHub App callback + Installation Token + `POST /api/projects/from-github`; independente de GitHubIdentity | github-app/project-github | GitHubInstallation, GitHubInstallationAuthorization, ProjectGitHubIntegration, Project | ProjectsScreen, IntegrationsSettingsPage | github-app service/controller, github-boundary, github-auth-l1-1, projects-github-e9, ProjectsPage, SettingsPages | IMPLEMENTADO; HOMOLOGAÇÃO GITHUB EXTERNA PENDENTE |
| RF03 | importar commits | `POST .../github/sync` | sync-project-commits | Commit | ProjectDetails/Repository | projects-github-e9, githubSync | IMPLEMENTADO |
| RF04 | importar Pull Requests | `POST .../github/sync` | sync-project-pull-requests | PullRequest | Repository | projects-github-e9, githubSync | IMPLEMENTADO |
| RF05 | importar Issues | `POST .../github/sync` | sync-project-issues | Issue | Repository | projects-github-e9, githubSync | IMPLEMENTADO |
| RF06 | consultar repositório | `GET .../artifacts`, commits, PRs, issues | artifact/typed services | Commit, PullRequest, Issue | RepositoryInfoScreen | mvp-contracts, RepositoryInfoPage | IMPLEMENTADO |
| RF07 | CRUD de tarefas | `/projects/:id/tasks`, `/tasks/:id` | task-crud | Task | TasksScreen/TaskForm/List | mvp-contracts, TaskForm/Presentation | IMPLEMENTADO |
| RF08 | quadro Kanban | `GET .../kanban`, `PATCH /tasks/:id/move` (409 `TASK_SPRINT_LOCKED` em sprint congelada) | task-kanban/movement | Task, TaskMovement | KanbanScreen/Board, TaskDetailsPanel (troca de status sem arrasto) | mvp-contracts, rf08-terceira-bateria, KanbanPage | IMPLEMENTADO |
| RF09 | Task–PullRequest singular | `PATCH/DELETE /tasks/:id/pull-request` | task-pull-request | Task.pullRequestId | TaskForm, Task Details e Rastreabilidade; sem indicador agregado na Tasks Page | mvp-contracts, traceability | IMPLEMENTADO |
| RF10 | definir cronograma do projeto | `GET /projects/:projectId/schedule`; CRUD `/sprints`, `/milestones`; `PATCH/DELETE /tasks/:id/sprint` | sprint-crud, sprint-status, milestone, schedule, task-sprint | Sprint (`milestoneId` — o vínculo invertido pelo ADR-011 D01), Milestone, **SprintTask** (fonte histórica), Task.sprintId (ponteiro corrente), TaskHistoryEntry (`SPRINT`) | SprintsScreen, MilestonesScreen, ScheduleScreen (ScheduleCalendar — grade mensal que substituiu a agenda textual), SprintTasksPanel, SprintList/SprintActionsMenu, MilestoneList; histórico ajustado | sprint.calculator, sprint.service, schedule-contracts, rf10-sprint-schedule, rf10-rf35-bateria, SprintsScreen, MilestonesScreen, ScheduleScreen, TaskHistorySprint | IMPLEMENTADO |
| RF11 | Task–Commit | `GET/POST/DELETE /tasks/:id/commits` | task-commit | TaskCommit | TaskForm, Task Details e Rastreabilidade; sem indicador agregado na Tasks Page | mvp-contracts, RF41 | IMPLEMENTADO |
| RF35 | evolução por sprint | `GET /sprints/:id/progress` | sprint-progress; `sprint.progress.calculator` e `sprint.burndown.calculator` (puros) | **SprintTask** (`exitStatus`, `addedAfterStart`, `carriedFromSprintId`, `removedAt`, `closedAt`), Sprint.startedAt/completedAt | SprintProgressPanel, SprintBurndownChart, SprintList | sprint.progress.calculator, sprint.burndown.calculator, sprint.service, schedule-contracts, rf10-sprint-schedule, rf10-rf35-bateria, SprintsScreen, SprintBurndownChart | IMPLEMENTADO |
| RF12 | Task–Issue | `GET/POST/DELETE /tasks/:id/issues` | task-issue | TaskIssue | TaskForm, Task Details e Rastreabilidade; sem indicador agregado na Tasks Page | mvp-contracts | IMPLEMENTADO |
| RF15 | progresso atual: Tasks CONCLUIDO / total | `GET /api/projects/:projectId/indicators/progress` | indicators | Task.status | I01 em Indicadores / Geral e Meu painel | `backend/test/unit/indicators.test.js`, `backend/test/api/indicators-p2.test.js`; P8.1 valor real na UI | PARCIAL — BACKEND E VISUALIZAÇÃO I01 IMPLEMENTADOS; AVALIAÇÃO INTEGRAL DO RF/S2-04 PENDENTE |
| RF16 | commits distintos da main literal por responsável/período | `GET /api/projects/:projectId/indicators/activity` (I02) | indicators | Commit, CommitBranch, GitBranch, GitHubIdentity | I02 na visão GitHub e elegível no Meu painel; sem controle global de responsável inoperante | indicators unit/API; fundação P1; P8.1 GitHub real | PARCIAL — BACKEND E VISUALIZAÇÃO I02 IMPLEMENTADOS; RECORTE SEGURO POR RESPONSÁVEL E COBERTURA GITHUB CONDICIONAM O RF |
| RF17 | Tasks distintas com conclusão vigente por responsável/período | `GET /api/projects/:projectId/indicators/activity` (I03) | indicators | TaskMovement.responsibleUserIdSnapshot | painel visual pendente | indicators unit/API; fundação P1 | PARCIAL — BACKEND IMPLEMENTADO; legado sem snapshot e visualização pendente |
| RF18 | retrabalho: PRs distintas fechadas e reabertas na coorte / PRs distintas fechadas | `GET /api/projects/:projectId/indicators/github` (I04) | indicators / github-analytics | PullRequestLifecycleEvent, ProjectGitHubIntegration.pullRequestLifecycleCoverageFrom | I04 na visão GitHub | indicators-p3 API/unit; fundação P1; upgrade P3; P8.1 GitHub real | PARCIAL — BACKEND E VISUALIZAÇÃO I04 IMPLEMENTADOS; COBERTURA TEMPORAL DE LIFECYCLE AINDA CONDICIONA O RF |
| RF36 | vetor de Tasks concluídas e commits main por responsável, sem score | `GET /api/projects/:projectId/indicators/activity` (I05) | indicators | fontes RF16/RF17 + membership atual | painel visual pendente | indicators unit/API | PARCIAL — BACKEND IMPLEMENTADO; visualização pendente, sem inferir membership histórica |
| RF54 | qualidade: I04 e taxa de PRs mescladas da mesma coorte fechada | `GET /api/projects/:projectId/indicators/github` (I06) | indicators / github-analytics | PullRequestLifecycleEvent, PullRequest.mergedAtGithub | I06 nas visões GitHub e Qualidade | indicators-p3 API/unit; fundação P1; P8.1 GitHub real | PARCIAL — BACKEND E VISUALIZAÇÃO I06 IMPLEMENTADOS; COBERTURA TEMPORAL E I19 REVIEWS SEPARADO AINDA EXIGEM AVALIAÇÃO |
| RF55 | painel consolidado com fórmula, fonte e horário/frescor por indicador sob demanda | `GET /api/projects/:projectId/indicators/dashboard`, `.../catalog` | dashboard aggregate + services de indicadores | projeções existentes, sem tabela de Dashboard | `IndicatorsScreen` → `DashboardPanel` → `IndicatorCard`/`DashboardHelp`; disclosure “Detalhes do cálculo” (PR23-FIX-02) fechado por padrão | `DashboardPanel.test.jsx`, `indicator-audit-display.test.js` (catálogo backend real), contrato `IndicatorResult` em API_CONTRACTS; inspeção real PR23-FIX-02 no Visual Validation Log e `evidence/pr23-fix-02` | IMPLEMENTADO LOCALMENTE — critério de auditabilidade RF55 corrigido na PR23-FIX-02; P8.4 visual histórica não promovida |
| RF56 | filtro temporal comum sobre indicadores compatíveis | `GET /api/projects/:projectId/indicators/dashboard` | dashboard aggregate + indicator-period.policy | fatos temporais canônicos de cada service | filtro global recolhível em `DashboardPanel`; URL preservada entre oito categorias e Meu painel; De/Até/Sprint, aplicação automática e compatibilidade por indicador | dashboard-view unit; indicators-p7 API/DST; DashboardPanel P8; P8.1 período/Sprint/responsável reais na UI | IMPLEMENTADO PARA RECORTES COMPATÍVEIS — período e Sprint conforme fonte; responsável sem controle na UI enquanto não houver aplicação segura |
| RF21 | atualizar sync GitHub | `POST .../github/sync` | sync-project-github | Project + artefatos | ProjectDetails | projects-github-e9 | IMPLEMENTADO |
| RF22 | editar projeto | `PUT /api/projects/:id` | project-crud | Project | ProjectDetails/ProjectForm | mvp-contracts, ProjectDetailsPage | IMPLEMENTADO |
| RF23 | cadastrar usuário | `POST /api/auth/register`, `POST /api/auth/email-verification/verify` | auth/email | User, Session, EmailVerificationToken | RegisterScreen, VerifyEmailScreen, EmailVerificationBanner | `backend/test/api/auth-authorization.test.js`, `backend/test/unit/identity-policy.test.js`, `frontend/test/pages/AuthForms.test.jsx`, `frontend/test/auth/EmailVerification.test.jsx` | IMPLEMENTADO; SMTP EXTERNO PENDENTE PARA VERIFICAÇÃO REAL |
| RF24 | vincular usuário ao projeto | convite por token; convites pessoais `GET .../invitations/mine` e respostas por ID; membership; ingresso por código/link como capacidade adicional | project-invitation/project-membership/project-access-code | ProjectInvitation, ProjectMembership | AcceptInvitationPage, PendingProjectInvitations, JoinProjectPage, ProjectMembersPanel | `backend/test/api/auth-authorization.test.js`, `backend/test/api/project-access-l5-1.test.js`, `frontend/test/pages/AcceptInvitationPage.test.jsx`, `frontend/test/pages/ProjectsPage.test.jsx`, `frontend/test/pages/ProjectAccessFlows.test.jsx` | IMPLEMENTADO; SMTP EXTERNO PENDENTE PARA CONVITE REAL |
| RF25 | definir perfil contextual ao projeto | `PATCH .../members/:membershipId`, reativação, saída e transferência de ownership | project-membership | ProjectMembership.role | ProjectMembersPanel | `backend/test/api/auth-authorization.test.js`, `frontend/test/features/ProjectMembersPanel.test.jsx` | IMPLEMENTADO; OWNER NÃO É ADMINISTRADOR GLOBAL |
| RF26 | consultar equipe | `GET .../members` | project-membership | ProjectMembership, User | ProjectMembersPanel, TaskForm | `backend/test/api/auth-authorization.test.js`, `frontend/test/features/ProjectMembersPanel.test.jsx`, `frontend/test/components/TaskForm.test.jsx` | IMPLEMENTADO |
| RF27 | autenticar | login por username/e-mail, `me`, `csrf`, logout; login GitHub como capacidade adicional | auth/github-auth | User, Session, GitHubIdentity, GitHubOAuthState | AuthContext, LoginScreen, ProtectedRoute, GuestOnlyRoute | `backend/test/api/auth-authorization.test.js`, `backend/test/api/github-auth-l1-1.test.js`, `frontend/test/auth/AuthContext.test.jsx`, `frontend/test/auth/ProtectedRoute.test.jsx`, `frontend/test/auth/GuestOnlyRoute.test.jsx`, `frontend/test/pages/AuthForms.test.jsx` | IMPLEMENTADO; HOMOLOGAÇÃO GITHUB EXTERNA PENDENTE |
| RF28 | recuperar senha sem enumerar contas | `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` | auth/email | PasswordResetToken | ForgotPasswordScreen, ResetPasswordScreen | `backend/test/api/auth-authorization.test.js`, `backend/test/unit/identity-policy.test.js`, `frontend/test/pages/AuthForms.test.jsx` | IMPLEMENTADO; RESPOSTA GENÉRICA; SMTP EXTERNO PENDENTE |
| RF29 | registrar comentário em tarefa | `POST /api/tasks/:id/comments` | task-comment | TaskComment | TaskDetailsPanel/TaskComments | `backend/test/api/task-comments-s1-05.test.js`, `backend/test/unit/task-comment.service.test.js`, `frontend/test/components/TaskComments.test.jsx` | IMPLEMENTADO |
| RF31 | consultar histórico de comentários da tarefa | `GET /api/tasks/:id/comments` | task-comment | TaskComment | TaskDetailsPanel/TaskComments | `backend/test/api/task-comments-s1-05.test.js`, `frontend/test/components/TaskComments.test.jsx` | IMPLEMENTADO |
| RF32 | definir prioridade da tarefa de forma acessível | `POST/PUT /api/tasks` (`priority`) | task-crud | Task.priority | TaskForm, TaskList, KanbanBoard e TaskDetailsPanel (badge com texto, não só cor) | `backend/test/api/mvp-contracts.test.js`, `frontend/test/components/TaskPresentation.test.jsx` | IMPLEMENTADO |
| RF33 | estimar esforço em unidade única (horas) | `POST/PUT /api/tasks` (`estimatedEffort`) | task-crud, task-time-entry (presenter) | Task.estimatedEffort | TaskForm, TaskDetailsPanel/TaskEffortTracker | `backend/test/api/task-time-entries-s1-06.test.js`, `backend/test/unit/task-time-entry.presenter.test.js`, `frontend/test/components/TaskEffortTracker.test.jsx` | IMPLEMENTADO |
| RF34 | registrar esforço realizado e comparar com o estimado | `GET/POST/DELETE /api/tasks/:id/time-entries`, `.../start`, `.../stop`; `effort` em `GET /api/sprints/:id/progress` | task-time-entry, sprint-progress | TaskTimeEntry, Task.actualEffort (derivado) | TaskDetailsPanel/TaskEffortTracker | `backend/test/api/task-time-entries-s1-06.test.js`, `backend/test/unit/task-time-entry.service.test.js`, `backend/test/unit/sprint.effort.calculator.test.js`, `frontend/test/components/TaskEffortTracker.test.jsx`, `frontend/test/components/effort-summary.test.js` | IMPLEMENTADO |
| RF38 | histórico de alterações | `GET .../tasks/history`, movements | task-movement/history | TaskHistoryEntry, TaskMovement | Kanban history | mvp-contracts, KanbanPage | IMPLEMENTADO |
| RF41 | sugerir Commit–Task | commit-suggestions scan/list/review | commit-suggestion | TaskCommitSuggestion, TaskCommit | Task edit/suggestions | rf41 API/unit, CommitSuggestionsCard | IMPLEMENTADO |
| RF48 | Requirement–Task | `PUT /requirements/:id/tasks` | requirement-task | Task.requirementId | RequirementsScreen | mvp-contracts, RequirementsPage | IMPLEMENTADO |
| RF49 | rastreabilidade do requisito | `GET .../traceability/requirements/:id` | traceability | relações canônicas | TraceabilityScreen/Flow | mvp-contracts, traceability tests | IMPLEMENTADO |
| RF50 | sync de PRs da branch principal | `POST .../github/sync` | sync-project-github/PRs | ProjectGitHubIntegration.defaultBranch, PullRequest | ProjectDetails/Repository | projects-github-e9, githubSync | IMPLEMENTADO |
| RF51 | responsável ativo | Task create/update | task-crud | Task.responsibleUserId | TaskForm | mvp-contracts, TaskForm | IMPLEMENTADO; legado preservado |
| RF52 | rastreabilidade da Task | `GET .../traceability/tasks/:taskId` | traceability | Task e vínculos tipados | TraceabilityScreen/Flow | mvp-contracts, TraceabilityPage | IMPLEMENTADO |
| RF53 | rastreabilidade reversa do artefato | `GET .../traceability/artifacts/:type/:id` | traceability | artefato, Task links, Requirement | TraceabilityScreen/Flow | mvp-contracts, TraceabilityPage | IMPLEMENTADO |
| RF42 | casos de teste persistidos, versões, execução e evidências | `/projects/:id/test-cases`, `/test-cases/:id`, `/test-executions/:id`, `/test-evidence/:id/content` | test-case, test-execution | TestCase, TestCaseStep, TestCaseVersion, TestCaseHistoryEntry, TestExecution, TestExecutionStep, TestEvidence | `TestCasesPage` / `features/testCases`, CRUD, execução, histórico e download reais | `test/unit/test-cases`, `test/integration/test-cases-s1-07.test.js`, `test/api/test-cases-s1-07.test.js`, `frontend/test/testCases` | IMPLEMENTADO LOCALMENTE — testes e smoke; CI e homologação visual completa pendentes |
| RF43 | base técnica de relações tipadas de casos de teste | CRUD de TestCase | test-case | TestCaseTask e TestCase.requirementId | seletores e vínculos persistidos em Casos de teste | integração S1-07, isolamento e versões | PARCIAL — relações backend/frontend S1-07; sem declarar RF completo |
| RF62 | base técnica TestCase–Task/Requirement | CRUD de TestCase | test-case | TestCaseTask e TestCase.requirementId | seletores e vínculos persistidos em Casos de teste | integração S1-07 | PARCIAL — relações backend/frontend S1-07; sem declarar RF completo |
| RF44 | rastreabilidade consolidada de testes por Requirement | `GET .../traceability/requirements`, `.../:id/current`, `.../:id/history` | traceability projection/policy/reconciliation | relações tipadas + RequirementTraceabilityState/HistoryEntry | RequirementCatalog, RequirementDetails e TraceabilityWorkspace, com situação/histórico canônicos | unit requirement-traceability; integração/API s109-traceability; frontend requirement/traceability | PARCIAL — BACKEND E FRONTEND PRESENTES; não promove S1-09 integralmente por esta auditoria |
| RF45 | defeitos com detecção FAIL, correções e reteste | `/projects/:id/defects`, `/defects/:id` e execução contextual | defects / testCases / tasks | Defect, DefectTask, DefectRetest, DefectHistoryEntry | DefectsScreen / DefectFlow | unit/defects, integração/API S1-08 e frontend/test/defects | PARCIAL — backend e frontend integrados; matriz visual completa pendente |
| RF46 | histórico e acompanhamento de defeitos | `/defects/:id/history`, `/defects/:id/retests` | defects | ciclos, execução e projeção persistida | DefectDetails / DefectHistory | integração/API S1-08 e frontend/test/defects | PARCIAL — histórico integrado; não declara RF completo |
| RF63 | rastreabilidade de defeitos | criação/edição/candidatos Defect | defects | requisito singular, ORIGIN Tasks e versão executada | DefectForm / DefectDetails / criação contextual TestCase | herança histórica e isolamento S1-08 | PARCIAL — relações navegáveis e projeção S1-09 consumidas no frontend; conclusão integral do RF requer avaliação separada |
| RF64 | relação entre correção e teste | correções e execução contextual | defects / testCases / tasks | CORRECTION Tasks, ciclos e DefectRetest | CorrectionManager / TestExecutionWizard / TaskCorrectionContext | projeção, concorrência e reteste S1-08 | PARCIAL — fluxo integrado; frozen correction metadata ausente e homologação pendente |

S1-08 acrescenta ao RF42 a obrigação backend de requisito ou Task na criação e
atualização resultante. A UX de criação a partir de Task/Requirement permanece
pendente. As linhas S1-08 indicam base técnica, sem declarar entrega completa do RF.

## Parcial ou fora do estado atual

- O P2 entrega a capacidade backend de RF15/RF16/RF17/RF36 com API, autorização e testes; nenhum dos quatro recebe status de fluxo completo sem a visualização. RF36 exibe as duas unidades separadas, sem score, e propaga lacunas de autoria e frescor. O RF35 é entregue por `GET /sprints/:id/progress` sobre `SprintTask`; RF32–RF34 são entregues pelo S1-06 (`TaskTimeEntry`, `Task.actualEffort` derivado das sessões e `effort` consolidado na evolução da sprint).
- O P4 acrescenta indicadores técnicos de Flow/Task I20–I35 em `GET /api/projects/:projectId/indicators/tasks`, com I25 apenas parcial/indisponível pela lacuna de histórico. Esses indicadores DPI não alteram o texto oficial nem promovem RF15–RF18/RF36, S2-04 ou S2-05 a entrega completa; painel e etapas P5–P10 permanecem pendentes.
- O P5 acrescenta I36–I47/I71–I72 em `GET /api/projects/:projectId/indicators/sprints`, reutilizando progresso, esforço e burndown canônicos; I46 permanece indisponível por história intermediária insuficiente. São indicadores técnicos DPI, sem novo RF. A capacidade visual e a consolidação continuam pendentes, portanto S2-04/S2-05 não mudam de status por este backend.
- O P5.1 acrescenta a captura histórica de Burnup (`SprintBurnupEvent`, cobertura por Sprint) e torna I46 `AVAILABLE` apenas para cobertura íntegra, `PARTIAL` para âncora tardia/estimativa ausente e `UNAVAILABLE` para legado sem fatos. O diário sobrevive à exclusão física de Task e é purgado com Sprint/Project. I45 mantém o owner canônico anterior; painel/visualização e S2-04/S2-05 permanecem abertos.
- O P5.2 reconcilia I45 v2 e I46 v2 nos dias cobertos por `SprintBurnupEvent`: o owner de Sprint projeta `scope`, `completed` e `remaining` uma vez, sem recalcular o passado a partir da Task viva. Sprints legadas e âncoras parciais mantêm suas limitações explícitas. Sem novo RF, migration ou painel; S2-04/S2-05 permanecem abertos.
- O P6 acrescenta os derivados de produto I48–I67 nos endpoints Quality e Traceability, reutilizando projeção S1-09, histórico de validação e reteste persistido. Isso sustenta o futuro painel UC14/RF55, sem alterar RF54 (qualidade de PR do P3), criar RF novo ou entregar RF55/RF56. I68 segue `NOT_RECOMMENDED`; S2-04/S2-05 permanecem abertos até P7–P10.
- O P7 compõe sete views e um catálogo público a partir dos services existentes. RF56 ganha filtro temporal de backend com período/fuso normalizados, compatibilidade e aplicação explícitas por indicador; Sprint e responsável são validados, mas ficam sem aplicação onde a fonte ainda não suporta recorte seguro. RF55 ganha base agregada, sem visualização. I68 continua fora do catálogo implementável; S2-04/S2-05 seguem abertos.
- O P8 integra o painel à Visão Geral existente, consome o agregado P7 e oferece sete visões, filtro temporal explícito, estados/frescor/limitações por indicador, SVG/tabela e responsividade. A inspeção foi feita em fixture local renderizada, com dados sintéticos; a sessão autenticada consumindo a API real e o GitHub externo não foram homologados nesta rodada. I03/I05 seguem fora das views padrão até seleção futura; RF15–RF18/RF36/RF54–RF56 e os cartões S2-04/S2-05 não são promovidos a fluxo completo apenas por P8.
- O P8.1 comprovou o fluxo autenticado `/projects` → Project → Dashboard P7 → banco de desenvolvimento e sync GitHub externa com refetch/freshness atualizados. I46 `AVAILABLE` foi gerado por eventos de domínio via API real e renderizado no frontend autenticado do banco de teste; I46 `PARTIAL`/`UNAVAILABLE` foram renderizados com dados reais do Project de desenvolvimento. GENERAL/SPRINT/QUALITY/TRACEABILITY foram inspecionadas com API real em Light/Dark a 768/390 px; Sprint foi medida também a 1440/1280 px. P8.1/P8 e RF55/RF56 recebem `PASS LOCAL`, preservadas limitações de dados e filtros `UNSAFE`. S2-04/S2-05 exigem avaliação separada do conjunto de requisitos e não são concluídos por esta rodada.
- RF13, RF15–RF18, RF30, RF36, RF37, RF39–RF40, RF43–RF46, RF54 e RF57–RF64 não foram implementados como capacidades **completas**. RF15/RF16/RF17/RF36 têm backend P2; RF15/I01 e RF16/I02 foram vistos no painel real, enquanto I03/I05 ainda não têm widget padrão. RF18/RF54 têm backend P3 e widgets I04/I06, condicionados à cobertura temporal de lifecycle; a sync GitHub externa P8.1 foi executada, sem provar cobertura histórica completa. S1-07 integra RF42 localmente, com testes em `frontend/test/testCases`, regressão backend e smoke persistido; CI remoto e homologação visual completa permanecem pendentes. As relações tipadas para RF43/RF62 não completam esses RFs; RF44 não é promovido por tested-references. A enumeração exclui de propósito RF29, RF31, RF32–RF34, RF35, RF42, RF55 e RF56, já marcados como `IMPLEMENTADO` nesta matriz.
- A numeração oficial não define RF14, RF19, RF20 e RF47; eles não foram inventados.

Matriz histórica da E0: [E0_TRACEABILITY_MATRIX.md](../refactoring/E0_TRACEABILITY_MATRIX.md).

**P8.3 / RF55 — capacidade derivada:** Project Health Model v1 acrescenta assessment individual,
cobertura ponderada, dimensões e drivers explicáveis ao painel consolidado. Não cria novo RF, não
altera fórmulas oficiais e não avalia pessoas. A validação da capacidade consta do
[relatório P8.3](../deliveries/S2_P8_3_INDICATOR_PROJECT_HEALTH_REPORT.md); seu estado não
reclassifica RF15–RF18/RF36/RF54 como completos.


### S1-09 — Etapa 2 (2026-09-10)

BACKEND IMPLEMENTADO / FRONTEND PENDENTE para a projeção de Requirement com 11
situações, validação da currentVersion e histórico de transições. RF43/RF62 mantêm
as relações tipadas e acrescentam união deduplicada direta/via Task; RF44 recebe
consulta consolidada atual; RF46/RF63/RF64 acrescentam projeção dos Defects,
precedência e efeito de correções/retestes no histórico do Requirement.
Esses incrementos são parciais quanto aos RFs completos: cards, summary visual,
filtros, histórico visual e grafo ampliado não foram implementados. RF49 e APIs
legadas preservados. [Contrato e limites](../data/REQUIREMENT_TRACEABILITY_HISTORY.md).


**P8.4 / RF55–RF56 — validação integral local:** sete visões reconciliadas contra os 74 IDs;
GENERAL passa a incluir I46 junto de I45, por exigência desta etapa. Período da Geral também
controla a janela de Project Health; o catálogo publica compatibilidade por visão sem alterar
`appliedFilters` individuais. Sprint/Responsável sem fonte segura são explicados; I03/I05 continuam
fora das views padrão. Snapshot, ajuda, eixos, layout e unidade do resumo I17 foram corrigidos.
API/sessão/banco de teste e capturas Light/Dark foram declarados no relatório histórico;
regressão frontend/backend e gates locais foram registrados. Retificação PR23-FIX-02: pacote
visual ausente do repositório, sem original local comprovável; status histórico **TECHNICALLY VERIFIED**,
sem homologação visual canônica P8.4. O [Relatório P8.4](../deliveries/S2_P8_4_FULL_DASHBOARD_VALIDATION_REGRESSION_RECOVERY_REPORT.md)
registra limites de Chromium/zoom de renderer, WCAG, CI remoto e sync GitHub externa. A rodada
não conclui automaticamente S2-04/S2-05 nem altera RF54 ou Health Model v1.


### P8.5 — Atualização da superfície RF55/RF56

RF55 passa a ter workspace próprio de Indicadores, com saúde completa em Geral e
resumo compacto na Visão Geral. RF56 reutiliza o disclosure canônico com período,
Sprint e responsável no mesmo contexto de URL naquela etapa. Desde P8.6C, a UI
expõe apenas De/Até e Sprint; a infraestrutura de responsável continua na API sem
aplicação silenciosa de recortes inseguros.
A API mantém compatibilidade: a nova categoria `PLANNING` e
`includeProjectHealth=true` são aditivos. Referências/deltas expõem bases existentes
do Health Model v1. Testes: `IndicatorsScreen.test.jsx`, `DashboardPanel.test.jsx`,
`ProjectDetailsPage.test.jsx`, `project-health.test.js`, `indicators-p7.test.js`.
O veredito específico de P8.5 está em
[relatório de entrega](../deliveries/S2_P8_5_INDICATORS_WORKSPACE_COMMERCIAL_UX_REPORT.md),
sem reaproveitar a homologação visual P8.1 como aprovação da nova superfície.

### P10 — evidência atual, sem promoção automática de escopo

- RF15/I01, RF16/I02, RF18/I04, RF54/I06, RF55 e RF56 foram revisados em código,
  API e UI real. RF17/I03 e RF36/I05 continuam com backend testado e sem presenter
  standalone aprovado. Reviews GitHub/I19 continuam ausentes; taxa de merge não
  passa a significar aprovação de review.
- O painel consolidado possui oito categorias mais Meu painel. A preferência
  `ProjectDashboardPreference` é individual por usuário/projeto e não altera Health.
- A Visão Geral segue a decisão final P8.6C: coração, título, nota, status e barra
  dentro do container existente, sem CTA/cobertura/drivers.
- P10 revalidou o fluxo artificial Requirement → Task → TestCase → FAIL → Defect
  → correção → reteste PASS/VALIDADO, além da sync real do repositório existente.
  Isso não altera o texto oficial dos RFs nem conclui S2-04/S2-05 como um todo.
- Registros P2–P8.5 acima preservam a cronologia de entrega. Seu uso de “pendente”
  deve ser lido no contexto da etapa, prevalecendo os contratos e evidências atuais.

## Referências técnicas de Indicadores — PR23-FIX-06

As fases históricas S2 P* são denominadas **IND-P*** no
[roadmap](../../TRACEFLOW_ROADMAP_INCREMENTAL.md#fases-internas-de-indicadores-ind);
não correspondem aos cartões S2-01…S2-10. IND-P10 foi revisão interna final, sem alegação de
independência de autoria. Seus registros não encerram automaticamente S2-04/S2-05.

A rota atual RF55/RF56 é `/projects/:projectId/indicators` (`IndicatorsScreen` → `DashboardPanel`);
a Overview contém apenas `ProjectHealthSummary`. RF55 conserva o resultado de FIX-02/FIX-02.1:
regra/fórmula, fonte e frescor sob demanda na ajuda, sem novo rebaixamento de implementação.
Autorização das 12 rotas e exceção pessoal VIEWER:
[matriz](../security/AUTHORIZATION_MATRIX.md#indicadores-e-preferência-pessoal--pr23-fix-06).
Privacidade/retenção: [inventário](../privacy/PERSONAL_DATA_INVENTORY.md) e
[política](../privacy/DATA_RETENTION_POLICY.md), conferidos com schema/export/anonimização.
Evidência executável: [API e preferências](../../backend/test/api/indicators-p9.test.js),
[privacidade](../../backend/test/api/privacy-governance.test.js) e
[inventário canônico](../design/UI_SURFACE_INVENTORY.md).
