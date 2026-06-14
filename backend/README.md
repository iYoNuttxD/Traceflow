# TRACEFLOW Backend

## Sobre

Backend do TRACEFLOW, responsável pela API REST, persistência dos dados, integração com GitHub e consolidação da rastreabilidade entre requisitos, tarefas e artefatos técnicos.

## Arquitetura

O backend segue o padrão:

```txt
routes -> controllers -> services -> repositories -> Prisma/MySQL
```

- Routes definem as rotas HTTP.
- Controllers recebem as requisições e formatam respostas.
- Services concentram regras de negócio.
- Repositories isolam o acesso ao banco.
- Prisma ORM persiste os dados no MySQL.

## Tecnologias

- Node.js
- Express
- Prisma ORM
- MySQL
- Octokit
- dotenv
- cors

## Estrutura de pastas

```txt
backend/
├── prisma/
│   ├── migrations/
│   └── schema.prisma
├── src/
│   ├── config/
│   ├── database/
│   ├── modules/
│   │   ├── artifacts/
│   │   ├── commits/
│   │   ├── github/
│   │   ├── issues/
│   │   ├── projects/
│   │   ├── pullRequests/
│   │   ├── requirements/
│   │   ├── tasks/
│   │   └── traceability/
│   ├── routes/
│   ├── app.js
│   └── server.js
└── package.json
```

## Instalação

```bash
cd backend
npm install
```

## Variáveis de ambiente

Criar `backend/.env` com valores equivalentes:

```env
DATABASE_URL="mysql://usuario:senha@localhost:3306/traceflow"
GITHUB_TOKEN="token_do_github"
PORT=3001
FRONTEND_URL="http://localhost:5173"
```

## Banco de dados e Prisma

Comandos úteis:

```bash
npx prisma validate
npx prisma generate
npx prisma migrate deploy
npx prisma migrate status
```

Durante desenvolvimento local, também pode ser usado:

```bash
npm run prisma:migrate
```

Não usar `prisma migrate reset`, pois ele apaga os dados locais.

## Executando o backend

```bash
npm run dev
```

Servidor padrão:

```txt
http://localhost:3001
```

## Principais módulos

- `projects`: cadastro, edição, membros, convite e integração inicial com repositórios.
- `github`: autenticação, listagem de repositórios e sincronização com GitHub.
- `commits`: consulta de commits importados.
- `pullRequests`: consulta de pull requests importados.
- `issues`: consulta de issues importadas.
- `artifacts`: visão consolidada de artefatos do repositório.
- `tasks`: tarefas, Kanban, vínculos com requisito, PRs, commits e issues.
- `requirements`: requisitos, status automático e vínculo com tarefas.
- `traceability`: matriz e cadeia de rastreabilidade.

## Principais endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/github/auth/check` | Verifica autenticação com GitHub |
| GET | `/api/github/repositories` | Lista repositórios GitHub |
| POST | `/api/projects/from-github` | Cria projeto a partir de repositório |
| GET | `/api/projects` | Lista projetos |
| GET | `/api/projects/:id` | Consulta projeto |
| PUT | `/api/projects/:id` | Atualiza projeto |
| POST | `/api/projects/:projectId/github/sync` | Sincroniza artefatos GitHub |
| GET | `/api/projects/:projectId/artifacts` | Lista artefatos do repositório |
| GET | `/api/projects/:projectId/commits` | Lista commits importados |
| GET | `/api/projects/:projectId/pull-requests` | Lista pull requests importados |
| GET | `/api/projects/:projectId/issues` | Lista issues importadas |
| GET | `/api/projects/:projectId/tasks` | Lista tarefas |
| POST | `/api/projects/:projectId/tasks` | Cria tarefa |
| PUT | `/api/tasks/:id` | Atualiza tarefa |
| DELETE | `/api/tasks/:id` | Exclui tarefa com segurança |
| PATCH | `/api/tasks/:id/move` | Move tarefa no Kanban |
| PATCH | `/api/tasks/:id/requirement` | Vincula requisito à tarefa |
| DELETE | `/api/tasks/:id/requirement` | Remove requisito da tarefa |
| PATCH | `/api/tasks/:id/pull-request` | Vincula PR à tarefa |
| DELETE | `/api/tasks/:id/pull-request` | Remove PR da tarefa |
| POST | `/api/tasks/:id/commits` | Vincula commit à tarefa |
| DELETE | `/api/tasks/:id/commits/:commitId` | Remove commit da tarefa |
| POST | `/api/tasks/:id/issues` | Vincula issue à tarefa |
| DELETE | `/api/tasks/:id/issues/:issueId` | Remove issue da tarefa |
| GET | `/api/projects/:projectId/requirements` | Lista requisitos |
| POST | `/api/projects/:projectId/requirements` | Cria requisito |
| PUT | `/api/requirements/:id` | Atualiza requisito |
| DELETE | `/api/requirements/:id` | Exclui requisito com segurança |
| PATCH | `/api/requirements/:id/confirm-completion` | Confirma conclusão de requisito validado |
| GET | `/api/requirements/:id/tasks` | Lista tarefas vinculadas ao requisito |
| GET | `/api/projects/:projectId/traceability/requirements-matrix` | Matriz de rastreabilidade |
| GET | `/api/projects/:projectId/traceability/requirements/:requirementId` | Cadeia de rastreabilidade do requisito |

## Sincronização GitHub

A sincronização usa Octokit para importar commits, pull requests e issues do repositório integrado ao projeto.

Campos importantes no projeto:

- `githubLastSyncAt`: última sincronização concluída com sucesso.
- `githubLastSyncAttemptAt`: última tentativa de sincronização, com sucesso ou falha.
- `githubSyncStatus`: status da última tentativa.
- `githubLastSyncError`: mensagem resumida da última falha.

Em caso de falha, o backend persiste o erro sem atualizar `githubLastSyncAt`.

## Rastreabilidade

O backend consolida a rastreabilidade pela cadeia:

```txt
Requirement -> Task -> Issue / PullRequest / Commit
```

A matriz calcula progresso, tarefas concluídas, evidências técnicas e situação de implementação. Issues aparecem como artefatos relacionados, mas evidência técnica de implementação considera pull requests e commits.

## Exclusão segura

Tarefa:

- Remove a tarefa.
- Remove vínculos com commits e issues.
- Remove vínculo com pull request junto com a tarefa.
- Remove movimentações do Kanban relacionadas.
- Mantém requisitos e artefatos importados do GitHub.

Requisito:

- Remove o requisito.
- Mantém tarefas cadastradas.
- Desvincula tarefas do requisito.
- Mantém artefatos importados do GitHub.

## Validações

```bash
node --check src/server.js
npx prisma validate
npx prisma generate
npx prisma migrate status
```
