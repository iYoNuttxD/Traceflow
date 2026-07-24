# E0 — Endpoints e contratos atuais

## Convenções realmente observadas

- Base REST: `/api`; o health check fica fora da base em `/health`.
- Não existe versionamento da API, autenticação, autorização ou middleware de validação.
- Todos os bodies são JSON e `express.json()` usa o limite padrão da biblioteca.
- Erro usual: `{ "message": "..." }`. Não há código estável, detalhes por campo ou request ID.
- Coleções não têm paginação. Filtros existentes são `search`, `startDate`, `endDate`, `type`, `taskId` e `movedBy` conforme as tabelas.
- Datas de entrada com filtro usam `YYYY-MM-DD`; datas de resposta vêm serializadas em ISO pelo Express/Prisma.
- Deletes implementados retornam HTTP 200 com mensagem; não retornam 204.
- Todas as rotas abaixo têm autenticação e autorização **AUSENTES**. Qualquer cliente com acesso de rede pode chamá-las.
- Erros conhecidos comuns: 400 para ID/entrada/regra inválida, 404 para recurso ausente, 409 para duplicidade de alguns vínculos/repositórios, 500 para falha não classificada e 501 para placeholders. Nem todos os endpoints distinguem todas essas situações.

Estados usados: `IMPLEMENTADO`, `PARCIAL`, `PLACEHOLDER`, `RETORNA_501`, `NÃO_UTILIZADO`, `INCERTO`.

## Health

| Método e caminho | Arquivo → controller/service/repository → models | Entrada | Sucesso | RF / consumidor | Estado |
|---|---|---|---|---|---|
| GET `/health` | `app.js` inline; sem camadas/model | Sem entrada | 200 `{status:"ok", message}` | Infra; sem consumidor frontend | IMPLEMENTADO |

## Projetos, membros e artefatos consolidados

Arquivo de rota principal: `backend/src/modules/projects/project.routes.js`. O endpoint de artefatos é aninhado por `artifact.routes.js`.

| Método e caminho | Controller → service → repository → models | Parâmetros/query/body | Resposta de sucesso | RF / consumidor frontend | Estado |
|---|---|---|---|---|---|
| POST `/api/projects/from-github` | `createFromGithub` → `createProjectFromGithubRepository` → project repo → Project; client Octokit | Body obrigatório: `githubRepositoryId`, `githubOwner`, `githubRepositoryName`, `githubRepositoryFullName`, `githubRepositoryUrl`, `githubDefaultBranch`; opcionais `name`/`nome`, `description`, `responsibleTeam`, `githubAutoSyncEnabled` | 201 `{message, project}` | RF01/RF02; sem consumidor | IMPLEMENTADO |
| POST `/api/projects/join` | `join` → `joinProject`/`addProjectMember` → project repo → Project, ProjectMember | Body: `accessCode`, `name` obrigatórios; `email`, `role` opcionais | 201 `{message, project:{id,name}, member}` | RF24 parcial; JoinProjectPage | IMPLEMENTADO |
| PATCH `/api/projects/:projectId/github/sync-settings` | `updateGithubSyncSettings` → homônimo → project repo → Project | Route `projectId`; body `{githubAutoSyncEnabled:boolean}` | 200 `{message, project}` | RF21; sem consumidor | IMPLEMENTADO |
| GET `/api/projects/:projectId/artifacts` | artifact controller → `listProjectArtifacts` → artifact repo → Project, Commit, PullRequest, Issue | Route `projectId`; query `type=commit|pull_request|issue`, `startDate`, `endDate` | 200 `{project, filters, summary, artifacts[]}` | RF06; RepositoryInfoPage | IMPLEMENTADO |
| GET `/api/projects/:projectId/members` | `listMembers` → `listProjectMembers` → project repo → Project, ProjectMember | Route `projectId` | 200 `{projectId, members[]}` | RF26 parcial; Details/Tasks/Kanban | IMPLEMENTADO |
| POST `/api/projects/:projectId/members` | `addMember` → `addProjectMember` → project repo → Project, ProjectMember | Route `projectId`; body `name` obrigatório, `email` e `role` opcionais | 201 `{message, member}` | RF24/RF25 parcial; ProjectDetailsPage | IMPLEMENTADO |
| POST `/api/projects` | `create` → `createProject` → project repo → Project | Body: `name`, `responsibleTeam` e dados `githubOwner`, `githubRepo`, `githubUrl` obrigatórios no fluxo atual; `description`, `status` opcionais | 201 `{message, project}` | RF01/RF02; ProjectsPage | IMPLEMENTADO |
| GET `/api/projects` | `findAll` → `findAllProjects` → project repo → Project | Sem query | 200 `{projects[]}` com todos os campos do model | RF01; ProjectsPage | IMPLEMENTADO |
| GET `/api/projects/:id` | `findById` → `getProjectById` → project repo → Project | Route `id` | 200 `{project}` | RF01/RF22; várias páginas | IMPLEMENTADO |
| PUT `/api/projects/:id` | `update` → `updateProject` → project repo → Project | Route `id`; body editável `name`, `description`, `responsibleTeam`, `status`; GitHub legado aceito se enviado completo | 200 `{message, project}` | RF22; ProjectDetailsPage | IMPLEMENTADO |
| DELETE `/api/projects/:id` | `notImplemented` | Route `id`; body ignorado | 501 `{message}` | Não confirmado; sem consumidor | RETORNA_501 |

O contrato do Project devolve campos internos como `accessCode`, `inviteLink`, `githubLastSyncError` e metadados do repositório porque não há DTO/select de saída.

## GitHub e coleções específicas

Arquivo: `backend/src/modules/github/github.routes.js`.

| Método e caminho | Controller → service/repository/client → models | Entrada | Resposta de sucesso | RF / consumidor | Estado |
|---|---|---|---|---|---|
| GET `/api/github/auth/check` | `checkAuthentication` → github service → GitHub client/Octokit | Sem entrada | 200 `{message, githubUser:{login,id,type}}` | RF02; sem consumidor | IMPLEMENTADO |
| GET `/api/github/repositories` | `listRepositories` → github service → Octokit | Sem query; internamente `per_page=100`, `sort=updated` | 200 `{repositories:[{githubRepositoryId,name,owner,fullName,url,defaultBranch,private,description}]}` | RF02; ProjectsPage | PARCIAL (primeira página) |
| POST `/api/projects/:projectId/github/sync` | `syncProjectGithubArtifacts` → githubSync service → project/commit/PR/issue repos + Octokit → Project, Commit, PullRequest, Issue | Route `projectId`; sem body | 200 `{message, summary:{commits,pullRequests,issues}, project}` | RF03-RF05/RF21; ProjectDetailsPage | PARCIAL |
| GET `/api/projects/:projectId/commits` | `listProjectCommits` → commit service → commit repo → Project, Commit | Route `projectId`; query opcional `search` | 200 `{commits[]}` | RF03/RF06; TasksPage pesquisa | IMPLEMENTADO |
| GET `/api/projects/:projectId/pull-requests` | `listProjectPullRequests` → PR service → PR repo → Project, PullRequest | Route `projectId`; query `search` por título/autor/número | 200 `{pullRequests[]}` | RF04/RF06/RF09; TasksPage | IMPLEMENTADO |
| GET `/api/projects/:projectId/issues` | `listProjectIssues` → issue service → issue repo → Project, Issue | Route `projectId`; query `search` por título/autor/número | 200 `{issues[]}` | RF05/RF06/RF12; TasksPage | IMPLEMENTADO |
| GET `/api/projects/:projectId/github/artifacts` | `notImplemented`; sem service/repo | Route `projectId` | 501 `{message}` | Não confirmado; sem consumidor | RETORNA_501 |

Detalhes do sync: commits do default branch, PRs `state=all` sem filtro de base, issues `state=all` excluindo itens que são PR; cada chamada limita-se a 100. Commits só inserem novos; PRs/issues fazem upsert. Se uma fase falhar, fases anteriores não são revertidas.

## Requisitos

Arquivo: `backend/src/modules/requirements/requirement.routes.js`.

| Método e caminho | Controller → service → repository → models | Entrada | Resposta | RF / consumidor | Estado |
|---|---|---|---|---|---|
| POST `/api/projects/:projectId/requirements` | `create` → `createRequirement` → requirement repo → Project, Requirement, Task | Route `projectId`; body `title` obrigatório, `description`, `type` opcionais; default `FUNCIONAL`; status forçado `CADASTRADO` | 201 `{message, requirement}` | RF48 base; RequirementsPage | IMPLEMENTADO |
| GET `/api/projects/:projectId/requirements` | `findByProject` → `findRequirementsByProject` → requirement repo → Project, Requirement, Task | Route; query `search` por título/tipo/status | 200 `{total, requirements[]}` | RF48/RF49; Requirements/Tasks | IMPLEMENTADO |
| GET `/api/projects/:projectId/traceability/requirement-task-coverage` | `getTaskCoverage` → `getRequirementTaskCoverage` → requirement repo → Project, Requirement, Task | Route `projectId` | 200 `{projectId,totalRequirements,linkedRequirements,coveragePercentage}` | RF48/RF49; RequirementsPage | IMPLEMENTADO |
| GET `/api/requirements/:id` | `findById` → `getRequirementById` → requirement repo → Requirement, Project, Task | Route `id` | 200 `{requirement}` | RF49; helper existe, sem uso confirmado | NÃO_UTILIZADO |
| PUT `/api/requirements/:id` | `update` → `updateRequirement` → requirement repo → Requirement, Task | Route; body editável `title`, `description`, `type` | 200 `{message, requirement}` | RF48; RequirementsPage | IMPLEMENTADO |
| DELETE `/api/requirements/:id` | `delete` → `deleteRequirement` → requirement repo (transação) → Requirement, Task | Route `id` | 200 `{message}`; tarefas são desvinculadas | RF48; RequirementsPage | IMPLEMENTADO |
| PATCH `/api/requirements/:id/status` | `updateStatus` → `updateRequirementStatus` → requirement repo → Requirement | Route; body `{status}` em lista aceita pelo service | 200 `{message, requirement}` | RF49; sem consumidor direto | NÃO_UTILIZADO |
| PATCH `/api/requirements/:id/confirm-completion` | `confirmCompletion` → homônimo → requirement repo → Requirement | Route; sem body; exige status `VALIDADO` | 200 `{message, requirement}` | RF49; RequirementsPage | IMPLEMENTADO |
| GET `/api/requirements/:id/tasks` | `findTasksByRequirement` → homônimo → requirement repo → Requirement, Task | Route `id` | 200 `{requirementId,total,tasks[]}` | RF48/RF49; helper existe, sem uso confirmado | NÃO_UTILIZADO |

Tipos aceitos pelo backend: `FUNCIONAL`, `NAO_FUNCIONAL`, `REGRA_NEGOCIO`. A UI só cria/edita os dois primeiros e preserva legado. Status aceitos incluem `CADASTRADO`, `APROVADO`, `EM_IMPLEMENTACAO`, `VALIDADO`, `CONCLUIDO`, `PENDENTE`, `EM_ANDAMENTO`, `CANCELADO`; a mensagem de erro lista apenas cinco.

## Tarefas, vínculos, Kanban e métricas

Arquivo: `backend/src/modules/tasks/task.routes.js`.

| Método e caminho | Controller → service → repository → models | Entrada | Resposta | RF / consumidor | Estado |
|---|---|---|---|---|---|
| POST `/api/projects/:projectId/tasks` | `create` → `createTask` → task repo → Project, Task, Requirement | Route; body `title` obrigatório; opcionais `description`, `priority`, `responsible`, `deadline`, `estimatedEffort`, `requirementId`; `actualEffort` proibido | 201 `{message, task}` | RF07/RF48; TasksPage | IMPLEMENTADO |
| GET `/api/projects/:projectId/tasks` | `findByProject` → `findTasksByProject` → task repo → Project, Task e relações | Route; query `search` por título/responsável/status | 200 `{total,tasks[]}` | RF07/RF52 parcial; Tasks/Requirements | IMPLEMENTADO |
| GET `/api/projects/:projectId/tasks/metrics` | `getMetrics` → `getTaskMetrics` → task repo → Project, Task | Query `startDate`, `endDate` | 200 `{projectId,indicator,metric,startDate?,endDate?,totalTasksCreated}` | RF15/RF34 não confirmado; sem consumidor | NÃO_UTILIZADO |
| GET `/api/projects/:projectId/traceability/pull-request-coverage` | `getPullRequestCoverage` → homônimo → task repo → Project, Task | Route | 200 `{projectId,totalTasks,linkedTasks,coveragePercentage}` | RF09; TasksPage | IMPLEMENTADO |
| GET `/api/projects/:projectId/traceability/commit-coverage` | `getCommitCoverage` → homônimo → task repo → Project, TaskCommit | Route | Mesmo formato de cobertura | RF11; TasksPage | IMPLEMENTADO |
| GET `/api/projects/:projectId/traceability/issue-coverage` | `getIssueCoverage` → homônimo → task repo → Project, TaskIssue | Route | Mesmo formato de cobertura | RF12; TasksPage | IMPLEMENTADO |
| GET `/api/projects/:projectId/kanban` | `getKanbanBoard` → homônimo → task repo → Project, Task e relações | Route | 200 `{projectId,columns:{A_FAZER,EM_ANDAMENTO,CONCLUIDO},totals}` | RF08; KanbanPage | IMPLEMENTADO |
| GET `/api/projects/:projectId/kanban/movements` | `listMovements` → homônimo → task repo → Project, TaskMovement, Task | Query `startDate`, `endDate`, `taskId`, `movedBy`; `sprintId` não é lido da query | 200 `{projectId,total,movements[]}` | RF38; KanbanPage | IMPLEMENTADO |
| GET `/api/projects/:projectId/kanban/metrics` | `getKanbanMetrics` → homônimo → task repo → Project, TaskMovement | Mesmos filtros aceitos pelo service | 200 `{projectId,indicator,metric,startDate?,endDate?,totalMovements}` | RF38; KanbanPage | IMPLEMENTADO |
| GET `/api/tasks/:id` | `findById` → `getTaskById` → task repo → Task e relações | Route `id` | 200 `{task}` | RF07/RF52; sem consumidor confirmado | NÃO_UTILIZADO |
| PUT `/api/tasks/:id` | `update` → `updateTask` → task repo → Task, Requirement | Route; body editável `title`, `description`, `priority`, `responsible`, `deadline`, `estimatedEffort`, `actualEffort`, e `requirementId` tratado à parte | 200 `{message,task}` | RF07/RF48; TasksPage | IMPLEMENTADO |
| DELETE `/api/tasks/:id` | `delete` → `deleteTask` → task repo transacional → Task, TaskCommit, TaskIssue, TaskMovement | Route | 200 `{message}`; artefatos/requisito preservados | RF07; Tasks/Kanban | IMPLEMENTADO |
| PATCH `/api/tasks/:id/status` | `updateStatus` → `updateTaskStatus` → task repo → Task, Requirement | Body `{status:A_FAZER|EM_ANDAMENTO|CONCLUIDO}` | 200 `{message,task}`; não registra movimento | RF08/RF38 parcial; sem consumidor | NÃO_UTILIZADO |
| PATCH `/api/tasks/:id/requirement` | `linkRequirement` → homônimo → task repo → Task, Requirement | Body `{requirementId}`; valida mesmo projeto | 200 `{message,task}` | RF48; Tasks/Requirements | IMPLEMENTADO |
| DELETE `/api/tasks/:id/requirement` | `unlinkRequirement` → homônimo → task repo → Task, Requirement | Route | 200 `{message,task}` | RF48; Tasks/Requirements/Kanban | IMPLEMENTADO |
| PATCH `/api/tasks/:id/pull-request` | `linkPullRequest` → homônimo → task repo → Task, PullRequest | Body `{pullRequestId}`; `null`/vazio também desvincula | 200 `{message,task}` | RF09; TasksPage | IMPLEMENTADO |
| DELETE `/api/tasks/:id/pull-request` | `unlinkPullRequest` → homônimo → task repo → Task, PullRequest | Route | 200 `{message,task}` | RF09; Tasks/Kanban | IMPLEMENTADO |
| GET `/api/tasks/:id/commits` | `listCommits` → `listTaskCommits` → task repo → Task, TaskCommit, Commit | Route | 200 `{total,commits[]}` | RF11/RF52; helper existe, sem uso confirmado | NÃO_UTILIZADO |
| POST `/api/tasks/:id/commits` | `linkCommit` → homônimo → task repo → Task, TaskCommit, Commit | Body `{commitId}`; valida projeto/duplicidade | 201 `{message,commits[]}` | RF11; TasksPage | IMPLEMENTADO |
| DELETE `/api/tasks/:id/commits/:commitId` | `unlinkCommit` → homônimo → task repo → TaskCommit, Commit | Dois route params | 200 `{message,commits[]}` | RF11; Tasks/Kanban | IMPLEMENTADO |
| GET `/api/tasks/:id/issues` | `listIssues` → `listTaskIssues` → task repo → Task, TaskIssue, Issue | Route | 200 `{total,issues[]}` | RF12/RF52; helper existe, sem uso confirmado | NÃO_UTILIZADO |
| POST `/api/tasks/:id/issues` | `linkIssue` → homônimo → task repo → Task, TaskIssue, Issue | Body `{issueId}`; valida projeto/duplicidade | 201 `{message,issues[]}` | RF12; TasksPage | IMPLEMENTADO |
| DELETE `/api/tasks/:id/issues/:issueId` | `unlinkIssue` → homônimo → task repo → TaskIssue, Issue | Dois route params | 200 `{message,issues[]}` | RF12; Tasks/Kanban | IMPLEMENTADO |
| PATCH `/api/tasks/:id/move` | `moveTask` → homônimo → task repo (transação) → Task, TaskMovement, ProjectMember, Requirement | Body `{toStatus, projectMemberId}` preferido; fallback `{toStatus,movedBy}`; `sprintId` é descartado pelo service | 200 `{message,task,movement}` | RF08/RF38; KanbanPage | IMPLEMENTADO |

## Rastreabilidade central

Arquivo: `backend/src/modules/traceability/traceability.routes.js`.

| Método e caminho | Controller → service → repository → models | Entrada | Resposta | RF / consumidor | Estado |
|---|---|---|---|---|---|
| GET `/api/projects/:projectId/traceability/requirements-matrix` | `getRequirementsMatrix` → homônimo → traceability repo → Requirement, Task, PullRequest, TaskCommit/Commit, TaskIssue/Issue | Route | 200 `{projectId,summary,requirements[]}` | RF49; TraceabilityPage | IMPLEMENTADO |
| GET `/api/projects/:projectId/traceability/requirements/:requirementId` | `getRequirementTraceability` → homônimo → traceability repo → mesmos models | Dois route params, valida requisito no projeto | 200 `{projectId,requirement,tasks[]}` | RF49; TraceabilityPage/TraceabilityFlow | IMPLEMENTADO |
| POST `/api/projects/:projectId/trace-links` | `notImplemented`; sem service/repo | Contrato não foi possível confirmar pelo código | 501 `{message}` | Não confirmado; sem consumidor | RETORNA_501 |
| GET `/api/requirements/:requirementId/traceability` | `notImplemented` | Contrato não foi possível confirmar pelo código | 501 `{message}` | RF49; sem consumidor | RETORNA_501 |
| GET `/api/tasks/:taskId/traceability` | `notImplemented` | Contrato não foi possível confirmar pelo código | 501 `{message}` | RF52; sem consumidor | RETORNA_501 |
| GET `/api/github-artifacts/:artifactId/traceability` | `notImplemented` | Contrato não foi possível confirmar pelo código | 501 `{message}` | RF53; sem consumidor | RETORNA_501 |
| DELETE `/api/trace-links/:id` | `notImplemented` | Contrato não foi possível confirmar pelo código | 501 `{message}` | Não confirmado; sem consumidor | RETORNA_501 |

## Dependências diretas do frontend

O frontend consome 35 contratos distintos. Dependências especialmente sensíveis a mudanças:

- respostas de lista em chaves específicas (`projects`, `requirements`, `tasks`, `commits`, `pullRequests`, `issues`, `members`), sem envelope comum;
- helpers que retornam `response.data` e grupos `requirementsApi`, `kanbanApi` e `projectMembersApi` que retornam o objeto Axios completo;
- tarefa formatada com `commits` e `issues`, enquanto o repository trabalha com `commitLinks` e `issueLinks`;
- ProjectDetails depende de campos internos de status/erro/sync e convite;
- salvamento de requisito/tarefa depende de sequências de endpoints independentes; sucesso parcial é tratado como aviso na UI;
- matriz e grafo dependem das fórmulas e nomes `implementationStatus`, `hasTechnicalEvidence` e percentuais atuais.

Nenhum contrato novo é proposto nesta E0.
