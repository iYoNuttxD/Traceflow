# E0 — Matriz de rastreabilidade técnica

Fonte dos RFs: `TRACEFLOW_CONTEXTO_ARQUITETURA.md` e `TRACEFLOW_ROADMAP_INCREMENTAL.md`. A numeração oficial foi preservada; não foram criados RFs para operações que não possuem evidência documental suficiente.

## RF → rota → controller → service → repository → model → tela

| RF | Descrição oficial resumida | Rota(s) backend | Controller → Service → Repository | Model Prisma | Rota frontend / tela | Estado | Observações |
|---|---|---|---|---|---|---|---|
| RF01 | Cadastrar projeto | POST `/api/projects`; POST `/api/projects/from-github`; GET `/api/projects`; GET `/api/projects/:id` | projectController → projectService → projectRepository | Project | `/projects` ProjectsPage; `/projects/:id` Details | IMPLEMENTADO | UI usa POST comum e exige repositório; endpoint especializado não é consumido |
| RF02 | Integrar repositório GitHub | GET `/api/github/auth/check`; GET `/api/github/repositories`; POST `/api/projects/from-github`; POST `/api/projects` | github/project controllers → github/project services → client/project repo | Project | `/projects` ProjectsPage | PARCIAL | Token global; listagem limitada a 100; UI não usa `from-github`, que é o fluxo que revalida o repositório |
| RF03 | Importar commits | POST `/api/projects/:id/github/sync`; GET `/api/projects/:id/commits`; GET `/api/projects/:id/artifacts` | github/artifact controllers → githubSync/commit/artifact services → commit/artifact repos | Commit, Project | Details/Repository/Tasks | PARCIAL | Apenas primeira página (100); novos commits são idempotentes por hash |
| RF04 | Importar pull requests | sync; GET `/pull-requests`; GET `/artifacts` | github/artifact → githubSync/PR/artifact → PR/artifact repos | PullRequest, Project | Details/Repository/Tasks | PARCIAL | Upsert; primeira página; sync sem transação global |
| RF05 | Importar issues | sync; GET `/issues`; GET `/artifacts` | github/artifact → githubSync/issue/artifact → issue/artifact repos | Issue, Project | Details/Repository/Tasks | PARCIAL | Exclui itens que representam PR; primeira página |
| RF06 | Exibir informações do repositório | GET `/api/projects/:id/artifacts`; listas específicas | artifact/github controllers → artifact/collection services → repos correspondentes | Project, Commit, PullRequest, Issue | `/projects/:id/repository` | IMPLEMENTADO | Filtros por tipo/período, sem paginação; rota `/github/artifacts` retorna 501 mas não é necessária à tela atual |
| RF07 | Cadastrar tarefas | POST/GET `/api/projects/:id/tasks`; GET/PUT/DELETE `/api/tasks/:id` | taskController → taskService → taskRepository | Task, Project, Requirement | `/projects/:id/tasks` TasksPage | IMPLEMENTADO | CRUD persistente; sem testes/autorização |
| RF08 | Organizar tarefas em quadro ágil | GET `/api/projects/:id/kanban`; PATCH `/api/tasks/:id/move`; PATCH `/api/tasks/:id/status` | taskController → taskService → taskRepository | Task, TaskMovement | `/projects/:id/kanban` KanbanPage | IMPLEMENTADO | Movimento principal é transacional; status direto não registra histórico |
| RF09 | Relacionar tarefas a pull requests | PATCH/DELETE `/api/tasks/:id/pull-request`; cobertura PR | taskController → taskService → taskRepository | Task, PullRequest | TasksPage/KanbanPage | IMPLEMENTADO | Uma tarefa suporta apenas uma PR; várias tarefas podem apontar à mesma PR |
| RF11 | Relacionar tarefas a commits | GET/POST/DELETE `/api/tasks/:id/commits...`; cobertura commit | taskController → taskService → taskRepository | TaskCommit, Task, Commit | TasksPage/KanbanPage | IMPLEMENTADO | Vínculo manual N:N e validação de projeto |
| RF12 | Relacionar tarefas a issues | GET/POST/DELETE `/api/tasks/:id/issues...`; cobertura issue | taskController → taskService → taskRepository | TaskIssue, Task, Issue | TasksPage/KanbanPage | IMPLEMENTADO | Vínculo manual N:N e validação de projeto |
| RF21 | Atualizar sincronização com GitHub | POST `/api/projects/:id/github/sync`; PATCH `/github/sync-settings` | github/project controllers → githubSync/project services → project + artifact repos | Project, Commit, PullRequest, Issue | ProjectDetailsPage | PARCIAL | Manual funciona; auto-sync só persiste boolean, sem job; falha parcial deixa writes anteriores |
| RF22 | Editar projeto | PUT `/api/projects/:id` | projectController → projectService → projectRepository | Project | ProjectDetailsPage | IMPLEMENTADO | Campos GitHub não são editados pela tela |
| RF38 | Registrar histórico de alterações das tarefas | PATCH `/api/tasks/:id/move`; GET `/kanban/movements`; GET `/kanban/metrics` | taskController → taskService → taskRepository | TaskMovement, Task, ProjectMember | KanbanPage | PARCIAL | Registra movimentações de coluna, não toda alteração de tarefa; ator não autenticado |
| RF41 | Associar commits automaticamente a tarefas | Não confirmado | Não confirmado | TaskCommit/Commit seriam candidatos | Não confirmado | NÃO_CONFIRMADO | Somente associação manual foi encontrada; nenhuma regra automática determinística |
| RF48 | Relacionar requisitos a tarefas | PATCH/DELETE `/api/tasks/:id/requirement`; CRUD/listagens de requirements | task/requirement controllers → services → repos | Task, Requirement | RequirementsPage/TasksPage | IMPLEMENTADO | Relação 1 requisito por tarefa; UI faz múltiplas requests |
| RF49 | Consultar rastreabilidade de requisitos | GET `/api/projects/:id/traceability/requirements-matrix`; GET `/.../requirements/:requirementId`; cobertura requisito-tarefa | traceability/requirement controllers → services → repos | Requirement, Task, artefatos tipados | TraceabilityPage/TraceabilityFlow | IMPLEMENTADO | Rota alternativa `/api/requirements/:id/traceability` retorna 501; tela usa as duas rotas implementadas |
| RF50 | Sincronizar pull requests da branch principal | POST `/api/projects/:id/github/sync` | githubController → githubSyncService → pullRequestRepository | Project, PullRequest | ProjectDetailsPage | IMPLEMENTAÇÃO_DIVERGENTE | A chamada `pulls.list` não envia `base`; sincroniza todas as branches da primeira página |
| RF52 | Consultar rastreabilidade de uma tarefa | GET `/api/tasks/:id`; GET vínculos específicos; tarefa incluída no detalhe por requisito; GET `/api/tasks/:taskId/traceability` | task/traceability controllers → services → repos | Task e relações | TasksPage/KanbanPage; sem tela dedicada | PARCIAL | Dados existem em vários contratos, mas endpoint direto oficializado no placeholder retorna 501 |
| RF53 | Consultar rastreabilidade de artefato técnico | GET listas/artefatos; GET `/api/github-artifacts/:artifactId/traceability` | artifact/github controllers; placeholder traceability | Commit/PullRequest/Issue; GithubArtifact legado | RepositoryInfoPage; sem visão reversa | PARCIAL | Não há consulta reversa artefato→tarefas→requisitos; placeholder retorna 501 |

## Operações existentes sem RF confirmado

| Capacidade | Rotas/telas | Motivo para `Não confirmado` |
|---|---|---|
| CRUD completo de requisito | `/api/projects/:id/requirements`, `/api/requirements/:id`; RequirementsPage | Os documentos listam RF48/RF49 para vínculo/consulta, mas não apresentam nesta fonte um RF específico de cadastro de requisito |
| Membros e convite atuais | project members/join; Details/Join | Relacionável futuramente a RF24-RF26, porém não há User, autenticação ou autorização; não foi marcado como atendimento completo |
| Métrica de volume de tarefas | GET `/api/projects/:id/tasks/metrics` | Não há evidência suficiente para associar a RF15/RF34; contrato só conta tarefas criadas |
| Métrica de movimentações | GET `/kanban/metrics` | Evidência de apoio a RF38, mas não demonstra os indicadores oficiais mais amplos |
| `GithubArtifact` e `TraceLink` genéricos | Schema e rotas 501 | Não há uso runtime atual que comprove atendimento a um RF |

## Cobertura por fluxo de interface

| Tela | Ação | Função frontend | Endpoint | Camadas | Models | RF |
|---|---|---|---|---|---|---|
| ProjectsPage | listar/cadastrar | `api.get/post` | GET/POST `/projects` | project C/S/R | Project | RF01/RF02 parcial |
| ProjectDetailsPage | editar | `api.put` | PUT `/projects/:id` | project C/S/R | Project | RF22 |
| ProjectDetailsPage | sincronizar | `syncProjectGithub` | POST `/projects/:id/github/sync` | github C → githubSync S → quatro repos | Project e artefatos | RF03-RF05/RF21/RF50 parcial |
| RequirementsPage | cadastrar/editar | `requirementsApi` | POST/PUT requirements | requirement C/S/R | Requirement | Não confirmado |
| RequirementsPage | vincular tarefa | `linkTaskRequirement` | PATCH `/tasks/:id/requirement` | task C/S/R | Task, Requirement | RF48 |
| TasksPage | cadastrar/editar | `api.post/put` | tasks | task C/S/R | Task | RF07 |
| TasksPage | vincular PR/commit/issue | helpers `linkTask*` | task subresources | task C/S/R | relações tipadas | RF09/RF11/RF12 |
| KanbanPage | mover | `kanbanApi.moveTask` | PATCH `/tasks/:id/move` | task C/S/R | Task, TaskMovement, ProjectMember | RF08/RF38 |
| RepositoryInfoPage | consultar artefatos | `getProjectArtifacts` | GET `/projects/:id/artifacts` | artifact C/S/R | Commit, PR, Issue | RF06 |
| TraceabilityPage | matriz | `getRequirementsTraceabilityMatrix` | GET requirements-matrix | traceability C/S/R | cadeia tipada | RF49 |
| TraceabilityPage | grafo | `getRequirementTraceability` | GET traceability/requirements/:id | traceability C/S/R | cadeia tipada | RF49 |
