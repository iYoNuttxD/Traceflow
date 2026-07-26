# E0 — Código incompleto e dívida técnica

Este documento cataloga o estado atual; nenhuma correção foi implementada. “CANDIDATO_A_LEGADO” significa apenas ausência aparente de consumo ou sobreposição, nunca autorização para remoção.

## Resumo priorizado

| Prioridade | Achado | Evidência/impacto |
|---|---|---|
| CRÍTICA | Ausência total de autenticação/autorização | Todas as 59 rotas HTTP são anônimas; IDs permitem acesso entre projetos |
| CRÍTICA | Credencial GitHub global | `GITHUB_TOKEN` global atende todos os projetos/usuários; ownership não existe |
| ALTA | Nenhum teste automatizado | Não há scripts/testes; E1 não possui rede de proteção para 35 contratos consumidos |
| ALTA | Sync parcial e truncado | 100 itens por coleção, sem paginação/transação/timeout/retry; writes anteriores sobrevivem a falha |
| ALTA | Salvamentos frontend não atômicos | Tasks/Requirements salvam entidade e vínculos em várias requests, podendo terminar parcialmente |
| ALTA | Modelagem duplicada | GithubArtifact/TraceLink coexistem com models/relações tipadas |
| ALTA | Módulos monolíticos | `task.service.js` 941, `KanbanPage.jsx` 1067 e `TasksPage.jsx` 936 linhas |
| MÉDIA | Contratos/erros heterogêneos | Shapes diferentes, errors `{message}`, deletes 200, sem paginação |
| MÉDIA | CI insuficiente | Sem lint/test/migration DB; `--if-present` não garante testes |
| MÉDIA | Bundle grande | Build produz chunk JS 545,92 kB e aviso >500 kB |
| BAIXA | TODOs e comentários desatualizados | Parte afirma que vínculos/importações ainda são futuros, apesar de implementados |

## Arquivos grandes e responsabilidades misturadas

| Arquivo (linhas) | Responsabilidades acumuladas | Prioridade |
|---|---|---|
| `frontend/src/styles/global.css` (2128) | Todo o design system, páginas, componentes, modal, Kanban, traceability e responsividade | MÉDIA |
| `frontend/src/pages/KanbanPage.jsx` (1067) | Fetch, drag/drop, filtros, paginação local, métricas, modal, exclusão e desvínculos | ALTA |
| `backend/src/modules/tasks/task.service.js` (941) | CRUD, validação, vínculos, Kanban, histórico, métricas e coberturas | ALTA |
| `frontend/src/pages/TasksPage.jsx` (936) | Carregamento de oito fontes, buscas, formulário, CRUD, quatro tipos de vínculo e cards | ALTA |
| `frontend/src/pages/RequirementsPage.jsx` (637) | CRUD, busca/vínculo de tarefas, resumo, cobertura e apresentação | MÉDIA |
| `frontend/src/components/TaskForm.jsx` (595) | Normalização, quatro pickers pesquisáveis, debounce, formulário e seleção de membros | ALTA |
| `frontend/src/components/TraceabilityFlow.jsx` (530) | Formatação de domínio, layout de grafo, detalhes, estado de expansão e renderização | MÉDIA |
| `frontend/src/pages/ProjectDetailsPage.jsx` (514) | Projeto, edição, membros, convite, sync/status e clipboard | MÉDIA |
| `backend/src/modules/projects/project.service.js` (459) | CRUD, membros, convite, validação URL, Octokit e sync settings | ALTA |
| `backend/src/modules/tasks/task.repository.js` (419) | Persistência de Task, quatro relações, Kanban, histórico e métricas | ALTA |
| `backend/src/modules/tasks/task.controller.js` (330) | 24 handlers e respostas repetidas | MÉDIA |
| `backend/src/modules/traceability/traceability.service.js` (303) | DTOs, fórmulas, matriz e detalhe | MÉDIA |
| `backend/src/modules/requirements/requirement.service.js` (294) | CRUD, regras de status e cobertura | MÉDIA |
| `frontend/src/api/api.js` (278) | Cliente base e funções de todos os domínios, com retornos inconsistentes | MÉDIA |
| `backend/src/modules/artifacts/artifact.service.js` (278) | Validação, filtros, DTOs, ordenação e métricas de completude | MÉDIA |
| `backend/src/modules/github/githubSync.service.js` (269) | Client calls, mapping, sync de três coleções, erro e status | ALTA |

## TODO/FIXME/HACK

Foram encontrados 34 TODOs e nenhum `FIXME`/`HACK`.

### Backend runtime

- `app.js`: middlewares adicionais.
- `routes/index.js`: organização de endpoints.
- `server.js`: shutdown controlado.
- `config/env.js`: validação de configuração.
- `database/prismaClient.js`: comentário obsoleto sobre acesso real.
- `github.client.js`: comentário obsoleto sobre operações futuras.
- `github.service.js`: comentário obsoleto; importação já está em githubSync.
- `githubSync.service.js`: manter foco de orquestração.
- `github.routes.js`/controller: RF06/RF50 ainda apontados como futuros.
- `github.repository.js`: persistência idempotente futura.
- commit e PR service/repository: filtros/consultas futuras.
- traceability routes: vínculos manuais ainda placeholder.

### Prisma

- Revisão dos campos Project.
- Comentários afirmam que Requirement→Task, Task→Commit e Task→PR ainda serão implementados, mas já existem.
- Restrição do tipo GithubArtifact.
- TraceLink genérico ainda sem implementação.
- Models futuros User, Sprint, TestCase, Defect, Alert, Notification, Report, Indicator e Comment.

### Frontend

- App/providers, main, routes, Navbar, Layout, Card, FormInput e API base.
- `GithubArtifactsPage` e `TraceabilityList` declaram funcionalidades futuras.
- `frontend/index.html` ainda tem TODO de metadados/identidade.

Os TODOs desatualizados devem ser convertidos em evidência/issue apenas em etapa posterior; não foram removidos.

## Placeholders e endpoints 501

Sete rotas usam três handlers 501:

| Endpoint | Handler | Classificação | Consumidor |
|---|---|---|---|
| DELETE `/api/projects/:id` | `projectController.notImplemented` | RETORNA_501 | Nenhum |
| GET `/api/projects/:id/github/artifacts` | `githubController.notImplemented` | RETORNA_501 | Nenhum |
| POST `/api/projects/:id/trace-links` | `traceabilityController.notImplemented` | RETORNA_501 | Nenhum |
| GET `/api/requirements/:id/traceability` | idem | RETORNA_501 | Nenhum |
| GET `/api/tasks/:id/traceability` | idem | RETORNA_501 | Nenhum |
| GET `/api/github-artifacts/:id/traceability` | idem | RETORNA_501 | Nenhum |
| DELETE `/api/trace-links/:id` | idem | RETORNA_501 | Nenhum |

Placeholders frontend:

- `GithubArtifactsPage.jsx`: rota `/projects/:id/github-artifacts`, texto estático, sem API e sem link conhecido.
- `TraceabilityList.jsx`: texto estático, sem import/consumidor.
- `.gitkeep` em `frontend/src/assets`: não é código funcional.

## Candidatos a legado ou não uso

| Item | Evidência | Classificação |
|---|---|---|
| `backend/src/modules/github/github.repository.js` | Exporta objeto vazio e não é importado | CANDIDATO_A_LEGADO |
| `frontend/src/components/TraceabilityList.jsx` | Não importado; substituído na prática por TraceabilityFlow | CANDIDATO_A_LEGADO |
| `frontend/src/components/FormInput.jsx` | Não importado | CANDIDATO_A_LEGADO |
| `frontend/src/pages/GithubArtifactsPage.jsx` | Importada só pela rota; conteúdo placeholder e sem navegação conhecida | CANDIDATO_A_LEGADO |
| `Project.controller.getById` | Alias não registrado em rota | CANDIDATO_A_LEGADO |
| `projectRepository.updateGithubLastSyncAt` | Única ocorrência é a definição | CANDIDATO_A_LEGADO |
| `commitRepository.findByProjectIdAndHash` | Única ocorrência é a definição | CANDIDATO_A_LEGADO |
| `pullRequestRepository.findByProjectIdAndGithubId` | Única ocorrência é a definição | CANDIDATO_A_LEGADO |
| `GithubArtifact` | Nenhum acesso Prisma atual | CANDIDATO_A_LEGADO |
| `TraceLink` | Nenhum acesso Prisma atual; rotas retornam 501 | CANDIDATO_A_LEGADO |
| GET task/requirement/vínculos individuais e status direto | Rotas existem; helpers ou consumidores não confirmados | NÃO_UTILIZADO (endpoint) |

Não foram encontrados arquivos de código vazios. A detecção é estática e pode não capturar consumidores externos à SPA.

## Duplicações

- Validação repetida de IDs positivos, datas `YYYY-MM-DD`, strings opcionais e projeto existente em quase todos os services.
- Classes de erro locais por service, todas com `message/statusCode`.
- Helpers `sendError`/`send*Error` repetidos nos controllers; formato quase igual, logging diferente.
- `getErrorMessage` repetido em todas as páginas.
- Formatadores de data/status/PR/commit/issue repetidos em páginas e componentes.
- GithubArtifact duplica Commit/PullRequest/Issue; TraceLink duplica relações tipadas.
- Campos `githubOwner/repo/url` duplicam `githubRepositoryName/FullName/Url`.
- `Task.responsible`, `TaskMovement.movedBy` e `ProjectMember.name` repetem identidade textual.
- `buildCreatedAtFilter`, `buildMovedAtFilter` e filtros de Artifact têm lógica temporal semelhante.
- API frontend mistura helpers que retornam `response.data` com grupos que retornam resposta Axios.

## Logging e tratamento de erro

- 7 usos de `console.log/error`: startup, três no GitHub controller, um project controller helper, um requirement helper e um artifact controller.
- Alguns controllers não registram exceções inesperadas; outros registram o objeto inteiro.
- Não há redaction, nível, timestamp estruturado, request ID, middleware 404/erro ou audit log.
- `githubLastSyncError` é normalizado, mas erros externos podem aparecer em `console.error`.

## Outros riscos de qualidade

- Node local 25 versus CI 22, sem engines formalizados.
- `npm ci` não funciona na raiz por falta de lockfile; script raiz usa `npm install`, potencialmente alterando locks se executado.
- Não há lint; imports não utilizados só podem ser inferidos estaticamente.
- Não há paginação no backend; Kanban pagina apenas array já carregado no browser.
- Não há cancelamento de requests; buscas debounced podem chegar fora de ordem.
- Build não separa React Flow e gera chunk acima do limite de aviso.
- `Task.status` pode ser atualizado fora do endpoint move, produzindo mudança sem TaskMovement.
- `sprintId` existe no schema/repository, mas não há model Sprint e o service não encaminha o body.
- `githubAutoSyncEnabled` é persistido sem qualquer scheduler/webhook.

## Priorização sugerida para etapas futuras

Sem implementar nesta E0:

- **CRÍTICA:** caracterizar autorização inexistente e isolamento entre projetos; proteger ambiente de testes.
- **ALTA:** testes dos contratos centrais; fronteira Octokit; sync/paginação/falha parcial; atomicidade dos vínculos; decomposição task/Kanban.
- **MÉDIA:** erro/validação/logging compartilhados; DTOs/paginação; modelagem canônica e índices; frontend por domínio.
- **BAIXA:** comentários obsoletos, componentes não usados e metadados, removidos somente após busca/testes e plano de compatibilidade.
