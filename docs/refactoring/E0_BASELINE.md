# E0 — Baseline executável e inventário de contratos

## Identificação

| Item | Valor |
|---|---|
| Data da análise | 24/07/2026 (America/Sao_Paulo) |
| Branch analisada | `daniel-dev` |
| Commit inicial analisado | `75f8921f719d87e9d6c27e05ac0016285c07ea5c` |
| Upstream após `git fetch --prune origin` | `origin/daniel-dev`, `+0/-0` |
| Estado inicial | Árvore limpa; nenhum arquivo modificado, removido ou não rastreado |
| Alterações locais preexistentes | Nenhuma identificada |
| Node local | `v25.9.0` |
| npm local | `11.12.1` |
| Node da CI | `22` |
| Versão declarada pelo projeto | Não há `engines`, `.nvmrc` ou `.node-version`; a CI é a única referência explícita |

O arquivo obrigatório `TRACEFLOW_MAPEAMENTO_REFATORACAO.md` não existe no checkout. Foi lida a cópia externa aberta no IDE em `/Users/daniel/Downloads/TRACEFLOW_MAPEAMENTO_REFATORACAO.md`, sem copiá-la para o repositório e sem alterá-la.

## Baseline de instalação e execução

| Comando | Resultado | Estado | Mensagem principal | Impacto |
|---|---|---|---|---|
| `git fetch --prune origin` | Referências atualizadas | SUCESSO | Sem saída; branch permaneceu `+0/-0` | Commit analisado confirmado sincronizado |
| `npm ci` (raiz) | Não executou instalação | FALHA ESPERADA | Não existe `package-lock.json` na raiz | A raiz não é instalável por `npm ci`; `install:all` usa `npm install` nos subprojetos |
| `npm ci` (backend) | 153 pacotes instalados | SUCESSO | Instalação concluída | Backend reproduzível pelo lockfile |
| `npm ci` (frontend) | 71 pacotes instalados | SUCESSO | Instalação concluída | Frontend reproduzível pelo lockfile |
| `npx prisma validate` (sandbox) | Cache externo bloqueado | FALHA DE AMBIENTE | `EPERM` em `~/.cache/prisma` | Reexecutado com permissão apropriada |
| `npx prisma validate` | Schema válido | SUCESSO | `prisma/schema.prisma is valid` | Estrutura Prisma sintaticamente válida |
| `npx prisma generate` | Client v6.19.3 gerado | SUCESSO | Prisma Client gerado em `node_modules` | Imports Prisma disponíveis |
| `find src ... node --check` | Todos os `.js` aceitos | SUCESSO | Sem saída | Sintaxe backend válida |
| `npx prisma migrate status` | 15 migrations encontradas e aplicadas | SUCESSO | `Database schema is up to date` | Banco local consultado está alinhado; não prova outros ambientes |
| `npm run build` (frontend) | Bundle criado | SUCESSO COM AVISO | JS minificado de 545,92 kB excede 500 kB | Risco de desempenho/carregamento; não bloqueia build |
| `npm start` (sandbox) | Bind de porta bloqueado | FALHA DE AMBIENTE | `listen EPERM 0.0.0.0:3001` | Reexecutado fora da restrição de bind |
| `npm start` | Servidor iniciou na porta 3001 | SUCESSO | `TRACEFLOW backend running on port 3001` | Startup confirmado |
| `curl -i http://127.0.0.1:3001/health` | HTTP 200 e JSON esperado | SUCESSO | `{"status":"ok",...}` | Smoke test local aprovado; expôs `X-Powered-By` e CORS `*` |

Os hashes SHA-1 dos lockfiles foram conferidos antes e depois: backend `7312776519b3477e8986618c75123684de350636` e frontend `1fc58ba89fef03548ba449ac3e9d8dd9f20c0a54`. Nenhum lockfile foi alterado. Não há scripts `test`, `lint` ou `format` nos manifests.

## Visão geral do backend

Arquitetura observada: Express → routes → controllers → services → repositories → Prisma/MySQL, com Octokit chamado pelos services GitHub. O app registra `cors()` e `express.json()` sem opções, `/health` e o agregador `/api`.

| Módulo | Arquivos e responsabilidade atual | Rotas | Models | Dependências | Problemas | Estado |
|---|---|---|---|---|---|---|
| bootstrap/config | `app.js`, `server.js`, `config/env.js`, `database/prismaClient.js` | `/health`, `/api/*` | Todos via client | Express, CORS, dotenv, Prisma | Sem validação de env, error middleware, shutdown, limites ou headers | PARCIAL |
| projects | route/controller/service/repository | Projetos, membros, convite, integração inicial e sync settings | Project, ProjectMember | Prisma, client GitHub | Service de 459 linhas; convite previsível; sem auth | IMPLEMENTADO |
| github | client/controller/routes/service/sync service/repository vazio | auth, repositórios, sync, listas, placeholder | Project, Commit, PullRequest, Issue | Octokit, Prisma indireto | Sem paginação completa/timeout; sync não transacional; repo vazio | PARCIAL |
| artifacts | route/controller/service/repository | lista consolidada | Project, Commit, PullRequest, Issue | Prisma | Sem paginação; conceito duplica `GithubArtifact`, que não usa | IMPLEMENTADO |
| commits | service/repository | lista e suporte ao sync/vínculo | Commit, TaskCommit | Prisma | Filtros limitados; funções sem consumidor | IMPLEMENTADO |
| pullRequests | service/repository | lista e upsert no sync | PullRequest, Task | Prisma | Upserts sequenciais; cardinalidade Task→PR singular | IMPLEMENTADO |
| issues | service/repository | lista e upsert no sync | Issue, TaskIssue | Prisma | Upserts sequenciais; sem paginação | IMPLEMENTADO |
| requirements | route/controller/service/repository | CRUD, status, conclusão, tarefas e cobertura | Requirement, Task, Project | Prisma | Estados/tipos livres e listas divergentes | IMPLEMENTADO |
| tasks | route/controller/service/repository | CRUD, vínculos, Kanban, histórico e métricas | Task, Requirement, PullRequest, Commit, Issue, TaskCommit, TaskIssue, TaskMovement, ProjectMember | Prisma | Service 941 e repository 419 linhas; múltiplas responsabilidades | IMPLEMENTADO |
| traceability | route/controller/service/repository | matriz e detalhe por requisito; cinco placeholders | Requirement, Task, Commit, PullRequest, Issue | Prisma | Consultas reversas e mutação genérica retornam 501 | PARCIAL |

Tratamento de erros é local e repetido. Alguns controllers registram o objeto de erro com `console.error`; outros retornam apenas mensagem genérica. Não há middleware central de 404/erro, logging estruturado ou correlation ID.

## Visão geral do frontend

SPA React/Vite com React Router, Axios e React Flow. As chamadas estão concentradas em `src/api/api.js`, mas páginas também chamam a instância `api` diretamente. Não existem diretórios de hooks, contextos ou testes.

| Página | Rota frontend | Componentes | APIs principais | RFs | Responsabilidades/estado | Problemas |
|---|---|---|---|---|---|---|
| Projetos | `/projects` | Card, ProjectForm | GET/POST projects; GET GitHub repositories | RF01, RF02 | Lista e cria projeto | Criação comum exige GitHub pela UI; não usa `/from-github` |
| Detalhes | `/projects/:id` | Card, ProjectForm, ProjectSectionNav | projeto, membros, sync | RF21, RF22, RF24/RF26 parcial | Edita, convida, mostra sync e membros | Expõe código/link de convite; sem autorização |
| Entrada | `/join`, `/join/:accessCode` | Card | POST join | RF24 parcial | Adiciona membro por código | Acesso anônimo e código reutilizável |
| Requisitos | `/projects/:projectId/requirements` | Card, ProjectSectionNav | CRUD, cobertura, vínculo tarefa | RF48, RF49 e fluxo de requisito | CRUD e associação | 637 linhas; associação faz várias requests sem atomicidade |
| Tarefas | `/projects/:projectId/tasks` | Card, TaskForm, ProjectSectionNav | CRUD, buscas, vínculos e coberturas | RF07, RF09, RF11, RF12, RF48, RF52 parcial | Agrega formulário, buscas, métricas e vínculos | 936 + TaskForm 595 linhas; salvamento parcial possível |
| Kanban | `/projects/:projectId/kanban` | KanbanColumn, ProjectSectionNav | board, move, movimentos, métricas e unlink/delete | RF08, RF38 | Drag/drop, histórico, modal | 1067 linhas; paginação apenas client-side |
| Repositório | `/projects/:projectId/repository` | ProjectSectionNav | artefatos consolidados | RF03-RF06 | Tabela e filtros | Sem paginação; título/autor podem expor dados GitHub |
| Artefatos placeholder | `/projects/:id/github-artifacts` | Nenhum | Nenhuma | RF03-RF06 não confirmado | Texto estático | PLACEHOLDER, sem link de navegação conhecido |
| Rastreabilidade | `/projects/:projectId/traceability` | Card, ProjectSectionNav, TraceabilityFlow | matriz e detalhe | RF49 | Matriz, indicadores e grafo | Fórmulas no backend sem contrato versionado; componente 530 linhas |

Todas as páginas principais têm estados de loading/erro/vazio em algum nível, mas não há tratamento global de erro, timeout/cancelamento, 401/403 ou ErrorBoundary.

## Fluxos funcionais atuais

### Fluxo A — Projeto e GitHub

- **Ponto inicial:** `/projects`.
- **Arquivos:** `ProjectsPage` → `ProjectForm` → Axios → project route/controller/service/repository → Project; listagem de repositórios passa por github service/client/Octokit.
- **Dados recebidos/persistidos:** nome, descrição, equipe, status e tripla GitHub legada; Project também armazena metadados, status de sync e convite.
- **Resposta:** projeto criado/listado; detalhes permitem sync manual. O endpoint especializado `/projects/from-github` verifica o repositório real, mas não é consumido pelo frontend.
- **Sincronização:** ProjectDetails → POST sync → githubSyncService → Octokit (máximo 100 por coleção) → Commit/PullRequest/Issue → status em Project.
- **Falhas:** token global; sem paginação além da primeira página; sync parcial pode persistir dados antes de falhar; sem timeout/retry; não validado contra GitHub real nesta execução.
- **RFs:** RF01-RF06, RF21, RF22; RF50 parcial.
- **Estado:** PARCIAL.

### Fluxo B — Requisito e tarefa

- **Ponto inicial:** páginas Requirements ou Tasks.
- **Arquivos:** páginas/formulários → endpoints de requirements/tasks → services/repositories → Requirement/Task.
- **Dados:** requisito (title, description, type) e tarefa (campos de planejamento); vínculo por `Task.requirementId`.
- **Persistência/resposta:** CRUD persistente, listagens incluem relações; status do requisito é recalculado após mudanças de tarefa.
- **Falhas:** criação/edição e atualização dos vínculos são requests separadas no frontend; uma etapa pode passar e outra falhar. Tipos/estados são strings e regras divergem do schema/doc.
- **RFs:** RF07, RF48, RF49; RF52 parcial.
- **Estado:** IMPLEMENTADO com risco de sucesso parcial.

### Fluxo C — Tarefa e artefato técnico

- **Ponto inicial:** TaskForm/TasksPage.
- **Arquivos:** buscas de commits/PRs/issues → endpoints de vínculo → task service/repository.
- **Persistência:** PR em `Task.pullRequestId`; commits em TaskCommit; issues em TaskIssue.
- **Resposta:** tarefa formatada ou listas atualizadas; UI exibe e permite desvincular.
- **Falhas:** até quatro grupos de requests após salvar a tarefa; sem transação global. PR é relação singular. Associação automática de commit não existe.
- **RFs:** RF09, RF11, RF12; RF41 não implementado; RF52 parcial.
- **Estado:** IMPLEMENTADO para vínculo manual, PARCIAL como fluxo atômico.

### Fluxo D — Kanban

- **Ponto inicial:** KanbanPage.
- **Arquivos:** KanbanPage → kanbanApi → task controller/service/repository → Task + TaskMovement.
- **Dados:** `toStatus` e `projectMemberId`; service deriva `movedBy` do ProjectMember.
- **Persistência:** update de Task e criação de TaskMovement na mesma transação Prisma.
- **Resposta:** tarefa e movimento; quadro, histórico e contagem são recarregados.
- **Falhas:** não há usuário autenticado; qualquer cliente pode indicar um membro do projeto. Sem proteção concorrente/versão de estado.
- **RFs:** RF08, RF38.
- **Estado:** IMPLEMENTADO com autoria não autenticada.

### Fluxo E — Rastreabilidade

- **Ponto inicial:** TraceabilityPage.
- **Arquivos:** matriz/detalhe → traceability controller/service/repository → Requirement e relações tipadas → React Flow.
- **Dados/resposta:** matriz de cobertura e grafo Requirement→Task→PR/Commit/Issue; indicadores calculados em memória.
- **Persistência:** somente os vínculos tipados já existentes; consulta não grava dados.
- **Falhas:** consultas reversas por tarefa/artefato e TraceLink retornam 501; issue isolada não conta como evidência técnica na fórmula; e-mail de autor de commit é enviado no detalhe.
- **RFs:** RF49 implementado; RF52 e RF53 parciais; RF41 ausente.
- **Estado:** PARCIAL.

## Relação frontend/backend prioritária

| Tela/ação | Função frontend | Endpoint | Controller → Service → Repository | Models | RF |
|---|---|---|---|---|---|
| Criar projeto | `api.post` | POST `/api/projects` | project → project → project | Project | RF01/RF02 parcial |
| Sincronizar | `syncProjectGithub` | POST `/api/projects/:id/github/sync` | github → githubSync → project/commit/PR/issue repos | Project, Commit, PullRequest, Issue | RF03-RF05/RF21 |
| Consultar repositório | `getProjectArtifacts` | GET `/api/projects/:id/artifacts` | artifact → artifact → artifact | Project, Commit, PullRequest, Issue | RF06 |
| Criar requisito | `requirementsApi.create` | POST `/api/projects/:id/requirements` | requirement → requirement → requirement | Project, Requirement | RF48 (entidade não possui RF próprio no baseline) |
| Criar tarefa | `api.post` | POST `/api/projects/:id/tasks` | task → task → task | Project, Task, Requirement | RF07/RF48 |
| Vínculos técnicos | helpers `linkTask*` | PATCH/POST `/api/tasks/:id/*` | task → task → task | Task, PullRequest, TaskCommit/Commit, TaskIssue/Issue | RF09/RF11/RF12 |
| Mover no Kanban | `kanbanApi.moveTask` | PATCH `/api/tasks/:id/move` | task → task → task | Task, TaskMovement, ProjectMember | RF08/RF38 |
| Matriz/grafo | `getRequirementsTraceabilityMatrix`, `getRequirementTraceability` | GET `/api/projects/:id/traceability/...` | traceability → traceability → traceability | Requirement, Task, artefatos tipados | RF49 |

## Divergências documentação × implementação

| Documento/afirmação | Estado real | Classificação | Impacto |
|---|---|---|---|
| README: capacidades atuais completas | Há sete rotas 501 e placeholders frontend | IMPLEMENTAÇÃO_PARCIAL | Capacidades reversas/genéricas não estão disponíveis |
| Arquitetura: CORS restrito, body limitado, headers, auth/autorização | `cors()` aberto, `express.json()` padrão, sem esses controles | IMPLEMENTAÇÃO_PARCIAL | Exposição e abuso possíveis |
| Arquitetura: resposta envelope `data/meta` e erros estruturados | Contratos usam chaves variadas e `{message}` | IMPLEMENTAÇÃO_DIVERGENTE | Consumidores acoplados e padronização futura arriscada |
| Arquitetura: paginação obrigatória | Collections retornam tudo; sync busca somente 100 | IMPLEMENTAÇÃO_PARCIAL | Dados truncados ou respostas grandes |
| README/backend: exclusões com 204 conforme convenção | Deletes implementados retornam 200 + mensagem | IMPLEMENTAÇÃO_DIVERGENTE | Contrato atual deve ser caracterizado antes de mudar |
| README/backend: sync atualiza artefatos idempotentemente | Commits só criam novos; PR/issues atualizam, mas só primeira página e sem transação | IMPLEMENTAÇÃO_PARCIAL | Estado pode ficar incompleto |
| RF50: PRs da branch principal | Sync de PRs usa `state: all`, sem filtro por `base` | IMPLEMENTAÇÃO_DIVERGENTE | RF50 não confirmado |
| Schema TODO: vínculos Requirement→Task e Task→artefato ainda futuros | Relações tipadas já existem e são usadas | DOCUMENTAÇÃO_DESATUALIZADA | TODOs induzem diagnóstico errado |
| GitHub service TODO: importação futura | `githubSync.service.js` já importa commits/PRs/issues | DOCUMENTAÇÃO_DESATUALIZADA | Comentário contradiz runtime |
| Backend README: GitHub status sanitizado | Mensagem é normalizada, mas controllers ainda logam objetos de erro | IMPLEMENTAÇÃO_PARCIAL | Log pode conter detalhes externos/PII |
| Roadmap: Node compatível | Só CI fixa Node 22; local executou Node 25 | NÃO_CONFIRMADO | Paridade local/CI não está formalizada |
| Mapeamento E0 no repositório | Arquivo ausente; apenas cópia em Downloads | NÃO_CONFIRMADO | Fonte não versionada junto ao commit analisado |

## Conclusão e bloqueios para E1

O MVP inicia, responde ao health check, compila e possui schema/migrations locais alinhados. Os contratos, porém, não têm testes de caracterização e combinam respostas/erros heterogêneos. Os principais bloqueios para iniciar E1 com segurança são: revisar estes contratos como baseline (inclusive comportamentos defeituosos), definir banco de teste isolado, escolher runners sem alterar produção, definir fronteira testável para Octokit, impedir que testes usem `.env`/banco de desenvolvimento e decidir quais rotas 501 devem ser apenas caracterizadas.

## Confirmações de escopo

A análise foi realizada na branch daniel-dev.  
Nenhum código funcional foi alterado.  
Nenhum arquivo funcional foi removido.  
Nenhuma migration foi criada.  
Nenhuma dependência foi adicionada.  
Nenhum contrato de API foi alterado.  
Nenhuma nova branch foi criada.  
Nenhum commit foi criado.  
Nenhum push foi realizado.  
Nenhum pull request foi aberto.
