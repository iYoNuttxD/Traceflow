# Matriz vigente RF → código → teste

`IMPLEMENTADO` significa fluxo presente e protegido pela suíte; `PARCIAL` indica apenas parte do RF;
`NÃO IMPLEMENTADO` não deve ser inferido de campos isolados. GitHub OAuth é identidade de
autenticação; GitHub App/Installation é a autoridade de repositórios e artefatos. Homologações
externas de SMTP, GitHub, webhook e browser permanecem distintas da cobertura automatizada e não
são declaradas como `PASS`.

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
| RF09 | Task–PullRequest singular | `PATCH/DELETE /tasks/:id/pull-request` | task-pull-request | Task.pullRequestId | TaskForm/List | mvp-contracts, traceability | IMPLEMENTADO |
| RF10 | definir cronograma do projeto | `GET /projects/:projectId/schedule`; CRUD `/sprints`, `/milestones`; `PATCH/DELETE /tasks/:id/sprint` | sprint-crud, sprint-status, milestone, schedule, task-sprint | Sprint (`milestoneId` — o vínculo invertido pelo ADR-011 D01), Milestone, **SprintTask** (fonte histórica), Task.sprintId (ponteiro corrente), TaskHistoryEntry (`SPRINT`) | SprintsScreen, MilestonesScreen, ScheduleScreen (ScheduleCalendar — grade mensal que substituiu a agenda textual), SprintTasksPanel, SprintList/SprintActionsMenu, MilestoneList; histórico ajustado | sprint.calculator, sprint.service, schedule-contracts, rf10-sprint-schedule, rf10-rf35-bateria, SprintsScreen, MilestonesScreen, ScheduleScreen, TaskHistorySprint | IMPLEMENTADO |
| RF11 | Task–Commit | `GET/POST/DELETE /tasks/:id/commits` | task-commit | TaskCommit | TaskForm/List | mvp-contracts, RF41 | IMPLEMENTADO |
| RF35 | evolução por sprint | `GET /sprints/:id/progress` | sprint-progress; `sprint.progress.calculator` e `sprint.burndown.calculator` (puros) | **SprintTask** (`exitStatus`, `addedAfterStart`, `carriedFromSprintId`, `removedAt`, `closedAt`), Sprint.startedAt/completedAt | SprintProgressPanel, SprintBurndownChart, SprintList | sprint.progress.calculator, sprint.burndown.calculator, sprint.service, schedule-contracts, rf10-sprint-schedule, rf10-rf35-bateria, SprintsScreen, SprintBurndownChart | IMPLEMENTADO |
| RF12 | Task–Issue | `GET/POST/DELETE /tasks/:id/issues` | task-issue | TaskIssue | TaskForm/List | mvp-contracts | IMPLEMENTADO |
| RF21 | atualizar sync GitHub | `POST .../github/sync` | sync-project-github | Project + artefatos | ProjectDetails | projects-github-e9 | IMPLEMENTADO |
| RF22 | editar projeto | `PUT /api/projects/:id` | project-crud | Project | ProjectDetails/ProjectForm | mvp-contracts, ProjectDetailsPage | IMPLEMENTADO |
| RF23 | cadastrar usuário | `POST /api/auth/register`, `POST /api/auth/email-verification/verify` | auth/email | User, Session, EmailVerificationToken | RegisterScreen, VerifyEmailScreen, EmailVerificationBanner | `backend/test/api/auth-authorization.test.js`, `backend/test/unit/identity-policy.test.js`, `frontend/test/pages/AuthForms.test.jsx`, `frontend/test/auth/EmailVerification.test.jsx` | IMPLEMENTADO; SMTP EXTERNO PENDENTE PARA VERIFICAÇÃO REAL |
| RF24 | vincular usuário ao projeto | convite por token; convites pessoais `GET .../invitations/mine` e respostas por ID; membership; ingresso por código/link como capacidade adicional | project-invitation/project-membership/project-access-code | ProjectInvitation, ProjectMembership | AcceptInvitationPage, PendingProjectInvitations, JoinProjectPage, ProjectMembersPanel | `backend/test/api/auth-authorization.test.js`, `backend/test/api/project-access-l5-1.test.js`, `frontend/test/pages/AcceptInvitationPage.test.jsx`, `frontend/test/pages/ProjectsPage.test.jsx`, `frontend/test/pages/ProjectAccessFlows.test.jsx` | IMPLEMENTADO; SMTP EXTERNO PENDENTE PARA CONVITE REAL |
| RF25 | definir perfil contextual ao projeto | `PATCH .../members/:membershipId`, reativação, saída e transferência de ownership | project-membership | ProjectMembership.role | ProjectMembersPanel | `backend/test/api/auth-authorization.test.js`, `frontend/test/features/ProjectMembersPanel.test.jsx` | IMPLEMENTADO; OWNER NÃO É ADMINISTRADOR GLOBAL |
| RF26 | consultar equipe | `GET .../members` | project-membership | ProjectMembership, User | ProjectMembersPanel, TaskForm | `backend/test/api/auth-authorization.test.js`, `frontend/test/features/ProjectMembersPanel.test.jsx`, `frontend/test/components/TaskForm.test.jsx` | IMPLEMENTADO |
| RF27 | autenticar | login por username/e-mail, `me`, `csrf`, logout; login GitHub como capacidade adicional | auth/github-auth | User, Session, GitHubIdentity, GitHubOAuthState | AuthContext, LoginScreen, ProtectedRoute, GuestOnlyRoute | `backend/test/api/auth-authorization.test.js`, `backend/test/api/github-auth-l1-1.test.js`, `frontend/test/auth/AuthContext.test.jsx`, `frontend/test/auth/ProtectedRoute.test.jsx`, `frontend/test/auth/GuestOnlyRoute.test.jsx`, `frontend/test/pages/AuthForms.test.jsx` | IMPLEMENTADO; HOMOLOGAÇÃO GITHUB EXTERNA PENDENTE |
| RF28 | recuperar senha sem enumerar contas | `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` | auth/email | PasswordResetToken | ForgotPasswordScreen, ResetPasswordScreen | `backend/test/api/auth-authorization.test.js`, `backend/test/unit/identity-policy.test.js`, `frontend/test/pages/AuthForms.test.jsx` | IMPLEMENTADO; RESPOSTA GENÉRICA; SMTP EXTERNO PENDENTE |
| RF38 | histórico de alterações | `GET .../tasks/history`, movements | task-movement/history | TaskHistoryEntry, TaskMovement | Kanban history | mvp-contracts, KanbanPage | IMPLEMENTADO |
| RF41 | sugerir Commit–Task | commit-suggestions scan/list/review | commit-suggestion | TaskCommitSuggestion, TaskCommit | Task edit/suggestions | rf41 API/unit, CommitSuggestionsCard | IMPLEMENTADO |
| RF48 | Requirement–Task | `PUT /requirements/:id/tasks` | requirement-task | Task.requirementId | RequirementsScreen | mvp-contracts, RequirementsPage | IMPLEMENTADO |
| RF49 | rastreabilidade do requisito | `GET .../traceability/requirements/:id` | traceability | relações canônicas | TraceabilityScreen/Flow | mvp-contracts, traceability tests | IMPLEMENTADO |
| RF50 | sync de PRs da branch principal | `POST .../github/sync` | sync-project-github/PRs | ProjectGitHubIntegration.defaultBranch, PullRequest | ProjectDetails/Repository | projects-github-e9, githubSync | IMPLEMENTADO |
| RF51 | responsável ativo | Task create/update | task-crud | Task.responsibleUserId | TaskForm | mvp-contracts, TaskForm | IMPLEMENTADO; legado preservado |
| RF52 | rastreabilidade da Task | `GET .../traceability/tasks/:taskId` | traceability | Task e vínculos tipados | TraceabilityScreen/Flow | mvp-contracts, TraceabilityPage | IMPLEMENTADO |
| RF53 | rastreabilidade reversa do artefato | `GET .../traceability/artifacts/:type/:id` | traceability | artefato, Task links, Requirement | TraceabilityScreen/Flow | mvp-contracts, TraceabilityPage | IMPLEMENTADO |

## Parcial ou fora do estado atual

- Esforço estimado/real e métricas técnicas existentes não constituem, sozinhos, RF33, RF34 e RF36 completos; esses RFs permanecem `PARCIAL` ou `NÃO IMPLEMENTADO` conforme o roadmap. O RF35 saiu deste conjunto: ele é entregue por `GET /sprints/:id/progress` sobre `SprintTask`.
- RF13, RF15–RF18, RF29–RF34, RF36, RF37, RF39–RF40, RF42–RF46 e RF54–RF64 não foram implementados como capacidades completas. O intervalo é enumerado em torno do RF35 de propósito: escrevê-lo como `RF29–RF37` engoliria um requisito que esta mesma matriz marca como `IMPLEMENTADO`.
- A numeração oficial não define RF14, RF19, RF20 e RF47; eles não foram inventados.

Matriz histórica da E0: [E0_TRACEABILITY_MATRIX.md](../refactoring/E0_TRACEABILITY_MATRIX.md).
