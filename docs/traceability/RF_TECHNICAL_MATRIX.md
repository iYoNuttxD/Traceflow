# Matriz vigente RF → código → teste

Estado consolidado após a E15. `IMPLEMENTADO` significa fluxo presente e protegido pela suíte; `PARCIAL` indica apenas parte do RF; `NÃO IMPLEMENTADO` não deve ser inferido de campos isolados.

| RF | Fluxo funcional | Endpoint principal | Service | Persistência | Frontend | Evidência de teste | Estado |
|---|---|---|---|---|---|---|---|
| RF01 | cadastrar projeto | `POST /api/projects` | project-crud | Project, ProjectMembership | ProjectsScreen/ProjectForm | mvp-contracts, ProjectsPage | IMPLEMENTADO |
| RF02 | integrar repositório GitHub | `POST /api/projects/from-github` | project-github | Project | ProjectsScreen | projects-github-e9, ProjectsPage | IMPLEMENTADO |
| RF03 | importar commits | `POST .../github/sync` | sync-project-commits | Commit | ProjectDetails/Repository | projects-github-e9, githubSync | IMPLEMENTADO |
| RF04 | importar Pull Requests | `POST .../github/sync` | sync-project-pull-requests | PullRequest | Repository | projects-github-e9, githubSync | IMPLEMENTADO |
| RF05 | importar Issues | `POST .../github/sync` | sync-project-issues | Issue | Repository | projects-github-e9, githubSync | IMPLEMENTADO |
| RF06 | consultar repositório | `GET .../artifacts`, commits, PRs, issues | artifact/typed services | Commit, PullRequest, Issue | RepositoryInfoScreen | mvp-contracts, RepositoryInfoPage | IMPLEMENTADO |
| RF07 | CRUD de tarefas | `/projects/:id/tasks`, `/tasks/:id` | task-crud | Task | TasksScreen/TaskForm/List | mvp-contracts, TaskForm/Presentation | IMPLEMENTADO |
| RF08 | quadro Kanban | `GET .../kanban`, `PATCH /tasks/:id/move` | task-kanban/movement | Task, TaskMovement | KanbanScreen/Board | mvp-contracts, KanbanPage | IMPLEMENTADO |
| RF09 | Task–PullRequest singular | `PATCH/DELETE /tasks/:id/pull-request` | task-pull-request | Task.pullRequestId | TaskForm/List | mvp-contracts, traceability | IMPLEMENTADO |
| RF10 | definir cronograma do projeto | `GET /projects/:projectId/schedule`; CRUD `/sprints`, `/milestones`; `PATCH/DELETE /tasks/:id/sprint` | sprint-crud, sprint-status, milestone, schedule, task-sprint | Sprint (`milestoneId` — o vínculo invertido pelo ADR-011 D01), Milestone, **SprintTask** (fonte histórica), Task.sprintId (ponteiro corrente), TaskHistoryEntry (`SPRINT`) | SprintsScreen, MilestonesScreen, ScheduleScreen (ScheduleCalendar — grade mensal que substituiu a agenda textual), SprintTasksPanel, SprintList/SprintActionsMenu, MilestoneList; histórico ajustado | sprint.calculator, sprint.service, schedule-contracts, rf10-sprint-schedule, rf10-rf35-bateria, SprintsScreen, MilestonesScreen, ScheduleScreen, TaskHistorySprint | IMPLEMENTADO |
| RF11 | Task–Commit | `GET/POST/DELETE /tasks/:id/commits` | task-commit | TaskCommit | TaskForm/List | mvp-contracts, RF41 | IMPLEMENTADO |
| RF35 | evolução por sprint | `GET /sprints/:id/progress` | sprint-progress; `sprint.progress.calculator` e `sprint.burndown.calculator` (puros) | **SprintTask** (`exitStatus`, `addedAfterStart`, `carriedFromSprintId`, `removedAt`, `closedAt`), Sprint.startedAt/completedAt | SprintProgressPanel, SprintBurndownChart, SprintList | sprint.progress.calculator, sprint.burndown.calculator, sprint.service, schedule-contracts, rf10-sprint-schedule, rf10-rf35-bateria, SprintsScreen, SprintBurndownChart | IMPLEMENTADO |
| RF12 | Task–Issue | `GET/POST/DELETE /tasks/:id/issues` | task-issue | TaskIssue | TaskForm/List | mvp-contracts | IMPLEMENTADO |
| RF21 | atualizar sync GitHub | `POST .../github/sync` | sync-project-github | Project + artefatos | ProjectDetails | projects-github-e9 | IMPLEMENTADO |
| RF22 | editar projeto | `PUT /api/projects/:id` | project-crud | Project | ProjectDetails/ProjectForm | mvp-contracts, ProjectDetailsPage | IMPLEMENTADO |
| RF23 | cadastrar usuário | `POST /api/auth/register` | auth | User, Session | RegisterPage | auth-authorization, AuthForms/AuthContext | IMPLEMENTADO |
| RF24 | vincular usuário ao projeto | invitations/accept, memberships | invitation/membership | ProjectMembership, Invitation | ProjectMembersPanel | auth-authorization, members panel | IMPLEMENTADO |
| RF25 | definir perfil | `PATCH .../members/:membershipId` | membership | ProjectMembership.role | ProjectMembersPanel | auth-authorization | IMPLEMENTADO |
| RF26 | consultar equipe | `GET .../members` | membership | ProjectMembership, User | ProjectMembersPanel/TaskForm | auth-authorization, members panel | IMPLEMENTADO |
| RF27 | autenticar | `/api/auth/login`, me, logout, csrf | auth | User, Session | AuthContext/Login | auth-authorization, AuthContext/ProtectedRoute | IMPLEMENTADO |
| RF28 | recuperar senha | forgot/reset-password | auth/email | PasswordResetToken | Forgot/Reset pages | auth tests, AuthForms | IMPLEMENTADO |
| RF38 | histórico de alterações | `GET .../tasks/history`, movements | task-movement/history | TaskHistoryEntry, TaskMovement | Kanban history | mvp-contracts, KanbanPage | IMPLEMENTADO |
| RF41 | sugerir Commit–Task | commit-suggestions scan/list/review | commit-suggestion | TaskCommitSuggestion, TaskCommit | Task edit/suggestions | rf41 API/unit, CommitSuggestionsCard | IMPLEMENTADO |
| RF48 | Requirement–Task | `PUT /requirements/:id/tasks` | requirement-task | Task.requirementId | RequirementsScreen | mvp-contracts, RequirementsPage | IMPLEMENTADO |
| RF49 | rastreabilidade do requisito | `GET .../traceability/requirements/:id` | traceability | relações canônicas | TraceabilityScreen/Flow | mvp-contracts, traceability tests | IMPLEMENTADO |
| RF50 | sync de PRs da branch principal | `POST .../github/sync` | sync-project-github/PRs | Project.defaultBranch, PullRequest | ProjectDetails/Repository | projects-github-e9, githubSync | IMPLEMENTADO |
| RF51 | responsável ativo | Task create/update | task-crud | Task.responsibleUserId | TaskForm | mvp-contracts, TaskForm | IMPLEMENTADO; legado preservado |
| RF52 | rastreabilidade da Task | `GET .../traceability/tasks/:taskId` | traceability | Task e vínculos tipados | TraceabilityScreen/Flow | mvp-contracts, TraceabilityPage | IMPLEMENTADO |
| RF53 | rastreabilidade reversa do artefato | `GET .../traceability/artifacts/:type/:id` | traceability | artefato, Task links, Requirement | TraceabilityScreen/Flow | mvp-contracts, TraceabilityPage | IMPLEMENTADO |

## Parcial ou fora do estado atual

- Esforço estimado/real e métricas técnicas existentes não constituem, sozinhos, RF33, RF34 e RF36 completos; esses RFs permanecem `PARCIAL` ou `NÃO IMPLEMENTADO` conforme o roadmap. O RF35 saiu deste conjunto: ele é entregue por `GET /sprints/:id/progress` sobre `SprintTask`.
- RF13, RF15–RF18, RF29–RF34, RF36, RF37, RF39–RF40, RF42–RF46 e RF54–RF64 não foram implementados como capacidades completas. O intervalo é enumerado em torno do RF35 de propósito: escrevê-lo como `RF29–RF37` engoliria um requisito que esta mesma matriz marca como `IMPLEMENTADO`.
- A numeração oficial não define RF14, RF19, RF20 e RF47; eles não foram inventados.

Matriz histórica da E0: [E0_TRACEABILITY_MATRIX.md](../refactoring/E0_TRACEABILITY_MATRIX.md).
