# Revisao pos-merge da arquitetura

## 1. Resumo da revisao

Esta revisao analisou a branch atual apos o merge de `origin/joao-dev`, com foco na compatibilidade entre RF01, RF02, RF03, RF04, RF05, RF07 e RF08.

O backend permanece organizado no padrao:

```txt
Routes -> Controller -> Service -> Repository -> Database
```

Foram encontradas inconsistencias reais pequenas no fluxo de convite por codigo/link e na validacao de `githubAutoSyncEnabled` durante criacao via GitHub. Essas correcoes foram aplicadas de forma pontual.

## 2. Escopo analisado

- Backend de projetos, membros, GitHub, commits, pull requests, issues e tarefas.
- Schema Prisma e migrations existentes.
- Rotas agregadas em `backend/src/routes/index.js`.
- Frontend relacionado a projetos, convite, tarefas e Kanban.
- Compatibilidade entre criacao manual de projeto, criacao via GitHub e sincronizacao de artefatos.

## 3. Arquivos analisados

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/*/migration.sql`
- `backend/src/modules/projects/*`
- `backend/src/modules/tasks/*`
- `backend/src/modules/github/*`
- `backend/src/modules/commits/*`
- `backend/src/modules/pullRequests/*`
- `backend/src/modules/issues/*`
- `backend/src/config/env.js`
- `frontend/src/api/api.js`
- `frontend/src/components/ProjectForm.jsx`
- `frontend/src/components/TaskForm.jsx`
- `frontend/src/pages/ProjectsPage.jsx`
- `frontend/src/pages/ProjectDetailsPage.jsx`
- `frontend/src/pages/JoinProjectPage.jsx`
- `frontend/src/pages/TasksPage.jsx`
- `frontend/src/pages/KanbanPage.jsx`
- `frontend/src/routes/AppRoutes.jsx`

## 4. Pontos criticos revisados

### Convite por link/codigo

- Todo projeto criado pelo RF01 recebe `accessCode` e `inviteLink`.
- Todo projeto criado via GitHub tambem recebe `accessCode` e `inviteLink`.
- `joinProject` usa `accessCode` para localizar o projeto.
- Membros duplicados com o mesmo email no mesmo projeto sao bloqueados no service e no indice composto `ProjectMember_projectId_email_key`.
- Membros sem email podem ser adicionados mais de uma vez; isso foi mantido porque a regra solicitada fala de duplicidade por email.
- O papel padrao permanece `MEMBRO`.

### URL do frontend no convite

Problema real encontrado: `inviteLink` era montado com `http://localhost:5173` fixo.

Correcao aplicada:

- Adicionado `FRONTEND_URL` em `backend/.env.example`.
- Adicionado `frontendUrl` em `backend/src/config/env.js`.
- `buildInviteLink` agora usa `FRONTEND_URL`, com fallback local para desenvolvimento.

### Geracao de accessCode

Problema real encontrado: `accessCode` usava `Math.random` sem consulta previa ao banco.

Correcao aplicada:

- Criada geracao com ate 5 tentativas.
- Cada tentativa verifica `findProjectByAccessCode` antes de retornar o codigo.
- `joinProject` normaliza o codigo para uppercase antes da consulta.

Observacao: `Math.random` foi mantido para evitar refatoracao maior, mas a checagem de unicidade reduz o risco pratico no MVP.

### Coleta e validacao de URL GitHub

- A criacao manual de projeto usa `githubOwner`, `githubRepo` e `githubUrl`.
- A URL precisa ser `github.com` ou `www.github.com`.
- A URL deve ter exatamente owner/repo.
- Sufixo `.git` e normalizado no nome do repositorio.
- Divergencia entre owner/repo informados e URL e rejeitada.
- A criacao via GitHub usa dados confirmados pela API e preenche tambem os campos detalhados.

### Campos GitHub duplicados semanticamente

Mantidos sem renomear:

```txt
githubOwner / githubRepo / githubUrl
```

Representam a forma simples usada pelo cadastro manual e pelo sync como fallback.

```txt
githubRepositoryId / githubRepositoryName / githubRepositoryFullName / githubRepositoryUrl
```

Representam a integracao validada via GitHub API.

O sync usa `githubRepositoryName || githubRepo`, preservando compatibilidade.

## 5. Problemas encontrados

### Problemas reais corrigidos

1. `inviteLink` fixo em `localhost:5173`.
2. `accessCode` sem tentativa de unicidade antes de persistir.
3. `joinProject` nao normalizava o codigo digitado.
4. `githubAutoSyncEnabled` em `POST /api/projects/from-github` aceitava valores nao booleanos e tratava string como `false`.

### Riscos futuros documentados

1. Migrations antigas usam nomes SQL gerados em momentos diferentes; o schema esta valido, mas a portabilidade deve ser observada em ambientes MySQL com configuracao case-sensitive.
2. `githubRepo/githubUrl` e `githubRepositoryName/githubRepositoryUrl` sao redundantes, mas foram mantidos por compatibilidade.
3. `ProjectMember` permite multiplos membros sem email no mesmo projeto. Isso foi mantido porque a regra atual bloqueia duplicidade por email.
4. `DELETE /api/tasks/:id` nao existe hoje, apesar de aparecer como possibilidade em alguns roteiros. Nao foi criado porque isso seria novo comportamento.

### Observacoes

- RF06 nao foi implementado.
- Nao foram criados filtros novos, dashboards, relatorios, webhooks, cron jobs ou frontend novo.
- A sincronizacao automatica segue sendo decisao do frontend; o backend apenas armazena `githubAutoSyncEnabled`.

## 6. Correcoes realizadas

- `backend/src/config/env.js`: adicionado `frontendUrl`.
- `backend/.env.example`: adicionado `FRONTEND_URL`.
- `backend/src/modules/projects/project.service.js`:
  - `inviteLink` passa a usar `FRONTEND_URL`.
  - `accessCode` passa a ser checado contra o banco antes de retornar.
  - `joinProject` normaliza `accessCode` para uppercase.
  - `githubAutoSyncEnabled` opcional passa a ser validado quando enviado em `POST /projects/from-github`.
- `backend/src/modules/projects/project.repository.js`:
  - mantida consulta por `accessCode` para suportar a validacao de unicidade.

## 7. Pontos mantidos sem alteracao

- Rotas existentes de projetos e GitHub.
- Contratos de resposta dos endpoints atuais.
- Regras de sync:
  - commit novo cria; existente ignora;
  - pull request novo cria; existente atualiza;
  - issue nova cria; existente atualiza.
- `githubLastSyncAt` continua sendo atualizado apenas apos sync completo bem-sucedido.
- `ProjectMember` e `TaskMovement` foram mantidos sem refatoracao.
- Frontend foi revisado, mas nao recebeu alteracao visual.

## 8. Recomendacoes futuras

1. Considerar usar gerador criptograficamente mais forte para `accessCode`.
2. Adicionar migration ou rotina administrativa para atualizar `inviteLink` antigo quando `FRONTEND_URL` mudar.
3. Decidir em documentacao se criacao manual de projeto deve sempre exigir GitHub ou se RF01 deve permitir projeto sem repositorio.
4. Avaliar endpoint de exclusao de tarefas apenas se entrar no escopo de RF07.
5. Consolidar futuramente a nomenclatura dos campos GitHub, se houver tempo para migracao segura.
6. Adicionar testes automatizados para join por codigo, sync settings e sincronizacao idempotente.

## 9. Testes e validacoes executadas

Backend:

```txt
npm exec prisma -- validate --schema prisma/schema.prisma
npm exec prisma -- generate --schema prisma/schema.prisma
npm exec prisma -- migrate status --schema prisma/schema.prisma
node --check nos arquivos JS de backend
git diff --check
```

Resultado:

- `prisma validate`: passou.
- `prisma generate`: passou.
- `node --check`: passou para os arquivos JS do backend.
- `git diff --check`: passou.
- `prisma migrate status`: executou com acesso elevado ao MySQL local e apontou migrations pendentes do merge:
  - `20260606233000_add_responsible_team_to_project`
  - `20260607021903_add_task_module`
  - `20260607024213_use_integer_task_effort`
  - `20260607030000_add_task_movements_for_kanban`
  - `20260607170000_adjust_kanban_project_members`
- Tentativa de `prisma migrate dev` para aplicar as migrations pendentes falhou no shadow database com permissao MySQL insuficiente para `UPDATE` na tabela `Project`.

Conclusao sobre migrations: o schema e valido, mas o banco local usado nesta revisao ainda nao esta em sincronia com as migrations mergeadas por limitacao de permissao do usuario MySQL no fluxo de shadow database do Prisma.

Frontend:

```txt
npm install
npm run build
```

Resultado:

- `npm install`: a primeira tentativa no sandbox falhou por erro interno do npm ao usar diretorios fora do workspace; a repeticao com permissao elevada passou.
- `npm run build`: passou com Vite.

## 10. Status final antes do RF06

Status final desta revisao:

- RF01 compativel com Project, ProjectMember, accessCode e inviteLink.
- RF02 compativel com integracao GitHub, criacao via repositorio e sync settings.
- RF03, RF04 e RF05 compativeis no endpoint unico de sync.
- RF07 compativel com Task e validacoes de projeto.
- RF08 compativel com Kanban, TaskMovement e ProjectMember.
- Base preparada para RF06 sem implementar RF06 nesta etapa.
- Pendencia operacional: aplicar as migrations mergeadas no banco local com um usuario MySQL que tenha permissoes suficientes para o fluxo de shadow database do Prisma, ou usar o fluxo adequado de deploy/resolution para o ambiente.

## 11. Correcoes complementares apos revisao do Copilot

Problemas confirmados e correcoes aplicadas:

- Casing da tabela `Task` corrigido nas migrations que ainda usavam `task` em minusculo.
- Backfill de `inviteLink` com `http://localhost:5173` removido da migration `20260607170000_adjust_kanban_project_members`; a migration preserva apenas o `accessCode`, e a aplicacao monta novos links com `FRONTEND_URL`.
- `JoinProjectPage` agora sincroniza o `accessCode` vindo de `/join/:accessCode` com o estado do formulario via `useEffect`.
- `JoinProjectPage` normaliza o codigo para uppercase no campo e no envio.
- Dependencias `"latest"` removidas de `frontend/package.json`, usando ranges baseados nas versoes resolvidas pelo `package-lock.json`.
- Definicoes duplicadas de `.kanban-empty` consolidadas em um unico bloco.
- Placeholder `notImplemented` de projetos conferido em portugues: `"Endpoint de projeto preparado para desenvolvimento futuro."`
- Regra CSS invalida com `min(100% - 1rem, ...)` corrigida para `min(calc(100% - 1rem), ...)`.
- `normalizeOptionalText` corrigida para tratar `undefined`/`null` como ausencia e converter valores nao-string para texto antes do `trim()`.
- `parseMetricDate` ajustado para interpretar `YYYY-MM-DD` em UTC com `Date.UTC` e getters UTC.
- `buildCreatedAtFilter` ajustado para avancar `endDate` com `setUTCDate`/`getUTCDate`.
- `buildMovedAtFilter` ajustado para avancar `endDate` com `setUTCDate`/`getUTCDate`.
- Endpoints GitHub de autenticacao e listagem de repositorios deixam de expor `error.message` ao cliente.
- `selectedProjectMemberId` agora e validado contra a lista de membros do projeto atual no Kanban.
- `estimatedEffort` e `actualEffort` nao transformam valores invalidos em `NaN` no payload; valores nao numericos sao preservados para validacao do backend.
- Handlers de erro inesperado relacionados a GitHub, artefatos e criacao via GitHub nao expõem `error.message` ao cliente.
- Placeholders `notImplemented` revisados para portugues nos controllers de projetos, GitHub, requisitos e rastreabilidade.
- READMEs revisados para acentuacao e clareza nos trechos recentes.
- Repository de projetos padronizado para usar `findById`, evitando duplicacao com `findProjectById`.
- `normalizeOptionalText` ajustada para permitir limpar campos opcionais de projeto com `null` ou string vazia sem tratar campo omitido como limpeza.
- `githubDefaultBranch` deixou de ser obrigatorio para considerar projeto vinculado ao GitHub; projetos manuais com owner/repo seguem validos.
- Sincronizacao de commits passa a enviar `sha` somente quando ha branch definido, deixando a API GitHub usar o branch padrao quando ausente.
- Atualizacao de `githubAutoSyncEnabled` passa a funcionar para projetos manuais vinculados por `githubOwner` e `githubRepo`.
- Mensagens expostas pela API em projetos e GitHub foram revisadas com acentuacao em portugues.

Arquivos alterados nesta rodada:

- `backend/prisma/migrations/20260607021903_add_task_module/migration.sql`
- `backend/prisma/migrations/20260607024213_use_integer_task_effort/migration.sql`
- `backend/prisma/migrations/20260607170000_adjust_kanban_project_members/migration.sql`
- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/src/pages/JoinProjectPage.jsx`
- `frontend/src/styles/global.css`
- `backend/src/modules/projects/project.service.js`
- `backend/src/modules/tasks/task.service.js`
- `backend/src/modules/github/github.controller.js`
- `backend/src/modules/github/github.client.js`
- `backend/src/modules/github/githubSync.service.js`
- `backend/src/modules/projects/project.controller.js`
- `backend/src/modules/projects/project.repository.js`
- `backend/src/modules/projects/project.service.js`
- `backend/src/modules/requirements/requirement.controller.js`
- `backend/src/modules/traceability/traceability.controller.js`
- `frontend/src/pages/KanbanPage.jsx`
- `frontend/src/components/TaskForm.jsx`
- `README.md`
- `backend/README.md`
- `frontend/README.md`
- `docs/ARCHITECTURE_REVIEW_AFTER_MERGE.md`

Validacoes executadas nesta rodada:

```txt
npm exec prisma -- validate --schema prisma/schema.prisma
npm exec prisma -- generate --schema prisma/schema.prisma
npm exec prisma -- migrate status --schema prisma/schema.prisma
node --check src/modules/projects/project.controller.js
node --check src/modules/projects/project.service.js
node --check src/modules/tasks/task.service.js
node --check src/modules/github/github.controller.js
node --check src/modules/github/github.client.js
node --check src/modules/github/githubSync.service.js
node --check src/modules/projects/project.controller.js
node --check src/modules/projects/project.repository.js
node --check src/modules/projects/project.service.js
node --check src/modules/tasks/task.controller.js
node --check src/modules/requirements/requirement.controller.js
node --check src/modules/traceability/traceability.controller.js
npm install
npm run build
git diff --check
```

Status final apos as correcoes:

- Nenhuma migration referencia `Task` como `task`.
- Nenhuma migration persiste `http://localhost:5173` em `inviteLink`.
- Nenhuma regra CSS usa `min(100% - 1rem, ...)` sem `calc()`.
- `normalizeOptionalText` nao retorna numeros, booleanos ou objetos diretamente para campos textuais opcionais.
- Filtros de metricas/historico baseados em `YYYY-MM-DD` usam UTC para evitar deslocamento por timezone local.
- `GET /api/github/auth/check` e `GET /api/github/repositories` retornam mensagens genericas em erro, sem expor detalhes internos do Octokit ou configuracao.
- O membro responsavel por movimentacao no Kanban nao fica preservado se nao existir no projeto atual.
- Campos de esforco no frontend nao serializam `NaN` como `null` silenciosamente.
- `createFromGithub`, listagens de commits, pull requests e issues usam mensagens genericas em erros inesperados.
- READMEs mantem portugues acentuado e texto mais claro nos trechos revisados.
- Busca de projeto por id usa um unico metodo no repository de projetos.
- Campos opcionais de projeto podem ser limpos em edicao com `null`, `""` ou texto em branco; campos omitidos permanecem sem alteracao.
- Projetos criados manualmente com `githubOwner` e `githubRepo` sao reconhecidos como vinculados ao GitHub mesmo sem `githubDefaultBranch`.
- Sync de commits nao envia `sha` indefinido para a API GitHub.
- Configuracao de sincronizacao GitHub aceita projetos manuais com owner/repo.
- Mensagens de resposta revisadas mantem acentuacao em portugues.
- `prisma validate`, `prisma generate` e `prisma migrate status` passaram; a pendencia operacional anterior de migrations foi revalidada e o banco local esta em dia.
- `node --check`, `git diff --check` e `npm run build` passaram.
- Frontend continua compilando.
- RF06 segue nao implementado.
