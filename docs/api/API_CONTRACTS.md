# Catálogo atual de contratos HTTP do TRACEFLOW

## L2 — conta, segurança, privacidade e integrações

Todos os contratos abaixo exigem sessão e CSRF nas mutations, exceto as duas confirmações públicas. `requireAccountState` limita `DEACTIVATED` à conta/reativação e `DELETION_PENDING` ao status/cancelamento/exportação; `ANONYMIZED` não autentica.

| Método | Caminho | Regra principal |
|---|---|---|
| GET | `/settings/account` | conta própria e estado |
| PATCH | `/settings/account/profile` | altera somente nome; conta ativa |
| PATCH | `/settings/account/username` | política L1 e cooldown de 30 dias |
| POST/DELETE | `/settings/account/email-change` | senha; solicitação hashada/cancelamento |
| GET | `/settings/account/email-change/status` | solicitação própria pendente |
| GET | `/settings/account/email-change/confirm` | público; token único; revoga todas as sessões |
| POST | `/settings/security/password` | preserva sessão atual e revoga demais |
| GET/DELETE | `/settings/security/sessions[/:sessionId]` | UUID público e sessão própria |
| POST | `/settings/security/sessions/revoke-others` | preserva sessão atual |
| POST | `/settings/account/deactivate` | senha, confirmação e bloqueio de último OWNER |
| POST/GET | `/account/reactivation/start|confirm` | sessão restrita para start; confirmação pública |
| GET/POST/DELETE | `/settings/privacy/deletion` | 30 dias, modo restrito e cancelamento com senha |
| POST | `/settings/privacy/export` | ZIP/JSON; `ACTIVE` ou `DELETION_PENDING` |
| GET | `/settings/integrations/github` | autorizações pessoais, instalações/repos/projetos |
| DELETE | `/settings/integrations/github/authorizations/:authorizationId` | remove somente autorização própria |

A exportação retorna `application/zip` com manifesto 1.0 e não persiste o arquivo. IDs de sessão internos, tokens, hashes e secrets não integram DTOs. Instalações GitHub suspensas/removidas não acionam listagem externa.

## L1 — identidade, verificação e GitHub App

`POST /auth/register` recebe `{name,username,email,password}` e cria conta/sessão mesmo quando a entrega SMTP falha; `emailVerification.status` informa `accepted`, `temporary_failure` ou `permanent_failure`. `POST /auth/login` recebe `{identifier,password,rememberMe}` e aceita username/e-mail sem enumerar contas. `PATCH /auth/username` substitui o identificador técnico de usuário migrado. `POST /auth/email-verification/resend` exige sessão+CSRF; `POST /auth/email-verification/verify` é público e consome token único.

GitHub App: `POST /github/app/installations/start`, `GET /github-app/callback`, `GET /github/app/installations`, `GET /github/app/installations/:installationId/repositories`, `PUT /projects/:projectId/github/integration` e `POST /webhooks/github-app`. Start/list/connect exigem sessão; start/connect e sync exigem e-mail verificado. O callback é público e valida o state de uso único vinculado ao usuário, à sessão inicial e à intenção, sem depender do cookie no domínio do túnel. Após trocar o code, a fronteira externa pagina `GET /user/installations` com o user access token temporário e só aceita o `installation_id` presente nessa listagem; não usa username nem persiste ou registra o token. O webhook é público, sem CSRF, e exige HMAC/body raw/delivery ID. `POST /projects/from-github` aceita `{githubInstallationId,githubRepositoryId,name?,description?,responsibleTeam?}` e revalida o repositório com a instalação; metadados enviados pelo navegador não são autoridade.

`GET /github/app/installations/:installationId/repositories` retorna todos os repositórios acessíveis e aceita `projectId` opcional para reconexão. Cada item inclui `availability`, `alreadyConnected`, `connectedToCurrentProject` e `selectable`. Repositório ocupado por outro projeto é listado, mas não selecionável; os demais repositórios da mesma instalação continuam disponíveis. Uma instalação pode servir N projetos, mas `projectId` e `githubRepositoryId` são exclusivos em `ProjectGitHubIntegration`.

Os contratos sistêmicos `GET /github/auth/check` e `GET /github/repositories` foram removidos. Não há fallback para PAT ou configuração `GITHUB_TOKEN`.

## Evidência e rastreabilidade

Os caminhos abaixo são relativos ao prefixo `/api`, exceto os endpoints de health. Autenticação e autorização por papel estão consolidadas em `docs/security/AUTHORIZATION_MATRIX.md`; a relação entre requisito funcional, fluxo, endpoint, service, persistência, frontend e testes está em `docs/traceability/RF_TECHNICAL_MATRIX.md`. A auditoria E15 reconciliou este catálogo com os arquivos `*.routes.js`: o único contrato ativo deliberadamente não implementado é `DELETE /api/projects/:id`, que permanece `501`.

## Atualização E10 — requisitos e rastreabilidade canônica

`Task.requirementId`, `Task.pullRequestId`, `TaskCommit` e `TaskIssue` são as únicas fontes dos vínculos. A matriz passou a ser paginada sem carregar conteúdo integral de artefatos e mantém um summary global independente da página. As perspectivas de requisito, tarefa e artefato usam o mesmo DTO `{projectId,perspective,summary,nodes,edges,pagination}`; IDs de node são namespaced e as arestas usam `REQUIREMENT_TASK`, `TASK_COMMIT`, `TASK_PULL_REQUEST` ou `TASK_ISSUE`.

Os cinco placeholders baseados em `TraceLink`/`GithubArtifact` foram removidos e seguem o `404` global. O único `501` restante é `DELETE /projects/:id`. O fechamento definitivo do RF41 adotou exclusivamente `[TASK-<ID>]`, persiste sugestões revisáveis e só cria `TaskCommit` após confirmação humana.

## Atualização E9 — Projetos e sincronização GitHub

O cadastro integrado usa a operação especializada `POST /projects/from-github` e revalida o repositório externo. A sincronização pagina commits, pull requests e issues, deduplica/upserta por identificadores externos dentro do projeto e só marca sucesso após todas as coleções. Falha parcial preserva lotes já confirmados, o último sucesso e os vínculos técnicos; a resposta de sucesso permanece `{message,summary,project}`.

O alias legado redundante `GET /projects/:projectId/github/artifacts` foi removido após confirmação de ausência de consumidores; ele agora segue o `404 ROUTE_NOT_FOUND`. A rota canônica RF06 permanece `GET /projects/:projectId/artifacts`.

## Atualização E8 — persistência canônica sem ruptura HTTP

A cardinalidade funcional confirmada é Task 0..1 PullRequest e PullRequest 0..N Tasks. `Task.pullRequestId` é a única fonte canônica; o join experimental N:N, o dual-write e o fallback foram removidos. Os endpoints continuam singulares e preservam paths, status, mensagens e payloads. Na E8, nenhum dos sete placeholders 501 então existentes foi implementado.

## Atualização E6 — identidade e privacidade dos endpoints

Health permanece público. Também são públicos `POST /api/auth/register`, `login`, `forgot-password` e `reset-password`. As demais rotas `/api` exigem cookie de sessão; mutations exigem `X-CSRF-Token`. `GET /api/auth/me` restaura a identidade, `GET /api/auth/csrf` rotaciona CSRF, `POST /api/auth/logout` revoga a sessão e `POST /api/auth/change-password` revoga todas as sessões.

Convites canônicos: `GET|POST /api/projects/:projectId/invitations`, `DELETE /api/projects/:projectId/invitations/:invitationId` e `POST /api/projects/invitations/accept`. O join por `accessCode` permanece autenticado e deprecado. Papéis: OWNER, MANAGER, MEMBER e VIEWER. Ausência de membership pode retornar 404; papel insuficiente, 403. Placeholders retornam 401 sem sessão e preservam 501 autenticados.

Na conclusão da E6, `GET /api/projects/:projectId/members` passou a representar a fonte canônica `ProjectMembership` e retorna `{projectId,currentMembership,members}`. OWNER recebe e-mail completo; demais papéis recebem valor mascarado. Administração canônica: `PATCH|DELETE /api/projects/:projectId/members/:membershipId`, `POST .../reactivate`, `DELETE .../members/me` e `POST /api/projects/:projectId/ownership/transfer`. Desativação/saída é lógica; o último OWNER recebe `409 LAST_PROJECT_OWNER`.

Convite duplicado ativo é substituído (o anterior é revogado). Em produção, criação retorna somente `{invitation}` e o token segue pelo adapter de e-mail; o campo `token` existe apenas em testes controlados. Forgot-password continua uniforme e nunca retorna token fora de testes.

Novos erros seguem `{message,code,requestId}`: `AUTHENTICATION_REQUIRED`, `INVALID_CREDENTIALS`, `ACCOUNT_DISABLED`, `CSRF_INVALID`, `FORBIDDEN` e `INVITATION_INVALID`. Respostas de recuperação são uniformes. O cookie nunca é exposto a JavaScript e CORS usa credenciais somente para a allowlist.

## Escopo e convenções

As seções abaixo preservam os contratos funcionais documentados na conclusão da E4, agora sujeitos à autenticação/autorização descrita na atualização E6. Este catálogo não é uma especificação OpenAPI definitiva.

Todas as respostas incluem o header `X-Request-Id`. Erros de domínio preservam `{ "message": "..." }`. Erros de validação usam HTTP `400`:

```json
{
  "message": "O título da tarefa é obrigatório.",
  "code": "VALIDATION_ERROR",
  "details": [{ "field": "title", "message": "O título da tarefa é obrigatório." }],
  "requestId": "identificador-seguro"
}
```

`details` nunca contém o valor recebido. Bodies mutáveis são estritos e rejeitam campos desconhecidos. Params numéricos aceitam somente inteiro decimal positivo e são convertidos para `number`. Datas de filtro usam `YYYY-MM-DD`; `deadline` aceita esse formato ou datetime ISO-8601 completo. Query `search` é opcional e limitada a 255 caracteres.

Na E5, respostas de sucesso permaneceram iguais. A API exige JSON para bodies, aplica limite padrão de 100kb, CORS por allowlist e rate limiting. Novos erros de infraestrutura usam o formato seguro `{message,code,requestId}`: origem proibida `403 CORS_ORIGIN_DENIED`, JSON malformado `400 MALFORMED_JSON`, payload excessivo `413 PAYLOAD_TOO_LARGE`, content type incompatível `415 UNSUPPORTED_MEDIA_TYPE` e limite excedido `429 RATE_LIMITED`. Respostas `/api` incluem `Cache-Control: no-store`; o limiter pode incluir `RateLimit` e `Retry-After`.

## Infraestrutura

| Método | Caminho | Entrada | Sucesso | Erros principais |
|---|---|---|---|---|
| GET | `/health` | Nenhuma | `200`, `{status,message}` histórico | `500` inesperado |
| GET | `/health/live` | Nenhuma | `200`, `{status:"ok"}` | `500` inesperado |
| GET | `/health/ready` | Nenhuma | `200`, `{status:"ready"}` | `503` dependência indisponível |
| qualquer | rota desconhecida | — | — | `404`, `ROUTE_NOT_FOUND` |

## Projects e membros

| Método | Caminho | Params/query | Body aceito | Sucesso |
|---|---|---|---|---|
| POST | `/projects` | — | `name`, `responsibleTeam`, `githubOwner`, `githubRepo`, `githubUrl`; opcionais `description`, `status` | `201`, `{message,project}` |
| POST | `/projects/from-github` | — | metadados `githubRepository*`, owner, branch; opcionais `name`/`nome`, descrição, equipe e boolean `githubAutoSyncEnabled` | `201`, `{message,project}` |
| GET | `/projects` | — | — | `200`, `{projects}` |
| GET | `/projects/:id` | `id` positivo | — | `200`, `{project}` |
| PUT | `/projects/:id` | `id` positivo | subconjunto de `name`, `description`, `responsibleTeam`, `status` e tripla GitHub legada | `200`, `{message,project}` |
| DELETE | `/projects/:id` | baseline placeholder | — | `501` inalterado |
| POST | `/projects/join` | — | `accessCode`, `name`; opcionais `email`, `role` | `201`, `{message,project,member}` |
| GET | `/projects/:projectId/members` | `projectId` positivo | — | `200`, `{projectId,currentMembership,members}` |
| POST | `/projects/:projectId/members` | `projectId` positivo | `name`; opcionais `email`, `role` | `201`, `{message,member}` |
| PATCH | `/projects/:projectId/members/:membershipId` | IDs positivos | `role`: OWNER/MANAGER/MEMBER/VIEWER | `200`, `{message,membership}` |
| DELETE | `/projects/:projectId/members/:membershipId` | IDs positivos | — | `204`, desativação lógica |
| POST | `/projects/:projectId/members/:membershipId/reactivate` | IDs positivos | body vazio | `200`, `{message,membership}` |
| DELETE | `/projects/:projectId/members/me` | `projectId` positivo | — | `204`, saída própria lógica |
| POST | `/projects/:projectId/ownership/transfer` | `projectId` positivo | `membershipId` positivo | `200`, `{message,membership}` |
| GET/POST | `/projects/:projectId/invitations` | `projectId` positivo | POST: `email`, `role` | `200` lista / `201` criação |
| DELETE | `/projects/:projectId/invitations/:invitationId` | IDs positivos | — | `204` |
| POST | `/projects/invitations/accept` | — | token opaco | `200`, `{message,membership}` |
| PATCH | `/projects/:projectId/github/sync-settings` | `projectId` positivo | boolean `githubAutoSyncEnabled` | `200`, `{message,project}` |

Status de projeto: `ATIVO`, `INATIVO`, `ARQUIVADO`. URLs GitHub precisam usar HTTP(S) e host `github.com`. E-mails são validados, mas continuam opcionais. `accessCode` mantém o mecanismo atual e não representa autenticação.

## Requirements

| Método | Caminho | Params/query | Body aceito | Sucesso |
|---|---|---|---|---|
| POST | `/projects/:projectId/requirements` | `projectId` positivo | `title`; opcionais `description`, `type` | `201`, `{message,requirement}` |
| GET | `/projects/:projectId/requirements` | `projectId`; `search?` | — | `200`, `{total,requirements}` |
| GET | `/requirements/:id` | `id` positivo | — | `200`, `{requirement}` |
| PUT | `/requirements/:id` | `id` positivo | subconjunto de `title`, `description`, `type` | `200`, `{message,requirement}` |
| DELETE | `/requirements/:id` | `id` positivo | — | `200`, `{message}` |
| PATCH | `/requirements/:id/status` | `id` positivo | `status` | `200`, `{message,requirement}` |
| PATCH | `/requirements/:id/confirm-completion` | `id` positivo | nenhum | `200`, `{message,requirement}` |
| GET | `/requirements/:id/tasks` | `id` positivo | — | `200`, `{requirementId,total,tasks}` |
| PUT | `/requirements/:id/tasks` | `id` positivo | `taskIds`: array único de até 100 IDs | `200`, `{message,requirement,reassignedTasks,changes}` |
| GET | `/projects/:projectId/traceability/requirement-task-coverage` | `projectId` positivo | — | `200`, métricas atuais |

Tipos preservados: `FUNCIONAL`, `NAO_FUNCIONAL`, `REGRA_NEGOCIO`. Status preservados: `CADASTRADO`, `APROVADO`, `EM_IMPLEMENTACAO`, `VALIDADO`, `CONCLUIDO`, `PENDENTE`, `EM_ANDAMENTO`, `CANCELADO`. As transições continuam sendo regra de domínio do service.

## Tasks, vínculos e Kanban

| Método | Caminho | Entrada principal | Sucesso |
|---|---|---|---|
| POST | `/projects/:projectId/tasks` | `projectId`; `title`; opcionais `description`, `priority`, `responsibleUserId`, `deadline`, efforts, `requirementId` | `201`, `{message,task}` |
| GET | `/projects/:projectId/tasks` | `projectId`, `search?` | `200`, `{total,tasks}` |
| GET | `/tasks/:id` | `id` positivo | `200`, `{task}` |
| PUT | `/tasks/:id` | `id`; subconjunto dos campos editáveis | `200`, `{message,task}` |
| DELETE | `/tasks/:id` | `id` positivo | `200`, `{message}` |
| PATCH | `/tasks/:id/status` | `status` | `200`, `{message,task}`; delega à transição canônica e cria movimento/histórico |
| PATCH/DELETE | `/tasks/:id/requirement` | `requirementId` no PATCH | `200`, `{message,task}` |
| PATCH/DELETE | `/tasks/:id/pull-request` | `pullRequestId` no PATCH; `null` continua aceito | `200`, `{message,task}` |
| GET | `/tasks/:id/commits` | `id` | `200`, `{total,commits}` |
| POST | `/tasks/:id/commits` | `commitId` | `201`, `{message,commits}` |
| DELETE | `/tasks/:id/commits/:commitId` | ambos positivos | `200`, `{message,commits}` |
| GET | `/tasks/:id/issues` | `id` | `200`, `{total,issues}` |
| POST | `/tasks/:id/issues` | `issueId` | `201`, `{message,issues}` |
| DELETE | `/tasks/:id/issues/:issueId` | ambos positivos | `200`, `{message,issues}` |
| GET | `/projects/:projectId/kanban` | `projectId` | `200`, quadro atual |
| PATCH | `/tasks/:id/move` | somente `toStatus`; o ator é obtido da sessão | `200`, `{message,task,movement}`; `409` em concorrência otimista |
| GET | `/projects/:projectId/kanban/movements` | datas, `taskId?`, `actorUserId?`, `movedBy?`, `page?`, `limit?` | `200`, `{projectId,total,movements,pagination}` |
| GET | `/projects/:projectId/tasks/history` | `taskId?`, `actorUserId?`, `field?`, datas, `page?`, `limit?` | `200`, `{projectId,total,items,pagination}` |
| GET | `/projects/:projectId/kanban/metrics` | mesmos filtros atuais | `200`, métricas atuais |
| GET | `/projects/:projectId/tasks/metrics` | `startDate?`, `endDate?` | `200`, métricas atuais |
| GET | `/projects/:projectId/traceability/{pull-request,commit,issue}-coverage` | `projectId` | `200`, cobertura atual |

Priority: `BAIXA`, `MEDIA`, `ALTA`, `CRITICA`. Status: `A_FAZER`, `EM_ANDAMENTO`, `CONCLUIDO`. Efforts são inteiros não negativos. `responsibleUserId` deve identificar usuário com membership ativa no projeto; respostas expõem apenas `{id,name}` em `responsibleUser`. `Task.responsible`, `TaskMovement.movedBy` e `projectMemberId` permanecem somente para dados históricos/compatibilidade de leitura. O histórico funcional usa `STATUS`, `DEADLINE`, `RESPONSIBLE` e `PRIORITY`; mudanças sem efeito não geram entrada.

## GitHub e Artifacts

| Método | Caminho | Entrada | Sucesso |
|---|---|---|---|
| GET | `/github/auth/check` | — | `200`, estado sanitizado da credencial técnica configurada |
| GET | `/github/repositories` | — | `200`, `{repositories}` |
| POST | `/projects/:projectId/github/sync` | `projectId` positivo | `200`, `{message,summary,project}` |
| GET | `/projects/:projectId/commits` | `projectId`, `search?` | `200`, `{commits}` |
| GET | `/projects/:projectId/pull-requests` | `projectId`, `search?` | `200`, `{pullRequests}` |
| GET | `/projects/:projectId/issues` | `projectId`, `search?` | `200`, `{issues}` |
| GET | `/projects/:projectId/artifacts` | `projectId`; `type?`, `startDate?`, `endDate?` | `200`, projeto, filtros, resumo e artefatos |

Tipos de artifacts: `commit`, `pull_request`, `issue`. A paginação E9 ocorre somente na leitura externa do GitHub; os contratos públicos de listagem permanecem inalterados.

Coberturas preservam os campos históricos e acrescentam `coverage: {numerator,denominator,percentage,hasData}`. Quando não há denominador, `percentage` é `null` e `hasData` é `false`; o escalar histórico permanece `0` por compatibilidade.

## Traceability canônica

| Método | Caminho | Entrada | Sucesso |
|---|---|---|---|
| GET | `/projects/:projectId/traceability/requirements-matrix` | IDs; `page?`, `limit?` | `200`, `{projectId,summary,requirements,pagination}` |
| GET | `/projects/:projectId/traceability/requirements/:requirementId` | IDs; `page?`, `limit?` paginam tarefas | `200`, DTO de grafo, perspectiva `REQUIREMENT` |
| GET | `/projects/:projectId/traceability/tasks/:taskId` | IDs; `page?`, `limit?` paginam artefatos | `200`, DTO de grafo, perspectiva `TASK` |
| GET | `/projects/:projectId/traceability/artifacts/:artifactType/:artifactId` | `commit`, `pull-request` ou `issue`; paginação de tarefas | `200`, DTO de grafo da perspectiva tipada |
| POST | `/projects/:projectId/traceability/commit-suggestions/scan` | body vazio | `200`, `{scannedCommits,detectedReferences,createdSuggestions,skippedSuggestions}` |
| GET | `/projects/:projectId/traceability/commit-suggestions` | `status?` = PENDING/CONFIRMED/REJECTED; `taskId?` positivo e pertencente ao projeto; `page?`, `limit?` | `200`, DTO minimizado, permissões e paginação |
| POST | `/projects/:projectId/traceability/commit-suggestions/:suggestionId/confirm` | IDs; body vazio | `200`, `{message,suggestion,changed}`; cria `TaskCommit` atomicamente |
| POST | `/projects/:projectId/traceability/commit-suggestions/:suggestionId/reject` | IDs; body vazio | `200`, `{message,suggestion,changed}`; não cria vínculo |

O summary da matriz é calculado sobre todo o projeto, não apenas sobre a página. A matriz seleciona somente dados resumidos e contagens. O grafo nunca expõe `Commit.authorEmail`. Recursos de outro projeto recebem `404`; consultas exigem VIEWER+ e a atualização atômica Requirement–Task exige MEMBER+.

O parser RF41 usa somente `/\[TASK-(\d+)\]/gi`: aceita caixa variada, múltiplos IDs e deduplica repetições na mesma mensagem. Não aceita `TASK-42`, `#42`, `ID 42`, `[ISSUE-42]` ou IDs não numéricos. Detecção e scan não criam vínculo; sugestões rejeitadas ou confirmadas nunca são reabertas.

Sem `taskId`, a consulta preserva a visão paginada do projeto. Com `taskId`, retorna somente sugestões da Task validada no mesmo projeto; ID inválido recebe `400` e Task inexistente ou de outro projeto recebe `404`. O DTO continua sem `Commit.authorEmail`.

## Conta, privacidade e auditoria (E7)

| Método | Caminho | Entrada | Sucesso |
|---|---|---|---|
| GET | `/account/personal-data` | sessão | `200`, `{data}` minimizado |
| PATCH | `/account/profile` | `name` | `200`, `{message,user}`; compatibilidade, sem troca direta de e-mail |
| GET | `/account/sessions` | sessão | `200`, sessões sem hashes |
| DELETE | `/account/sessions/:sessionId` | ID próprio | `204` |
| DELETE | `/account/sessions` | sessão | `204`, revoga todas |
| POST | `/account/personal-data/export` | CSRF | `202`, metadata da exportação |
| GET | `/account/personal-data/export/:exportId` | ID próprio | `200`, status; `404` cruzado |
| GET | `/account/personal-data/export/:exportId/download` | ID próprio não expirado | `200`, ZIP/JSON; `410 EXPORT_EXPIRED` |
| POST | `/account/deactivate` | `password` | `200`; `409 LAST_PROJECT_OWNER` |
| GET/POST/DELETE | `/account/deletion-request` | POST/DELETE: `password` | compatibilidade com o ciclo L2 |
| GET | `/account/audit-events` | `page`, `limit`, `action`, `result`, datas | `200`, página própria |
| GET | `/projects/:projectId/audit-events` | mesmos filtros | `200` OWNER; `403` demais papéis |

Exportação não contém hashes, cookies, segredos nem dados pessoais de outros membros. Todos os caminhos possuem prefixo `/api`.

## Limites e erros

- Strings persistidas em campos Prisma `String` sem `@db.Text`: até 191 caracteres.
- URLs persistidas: até 191 caracteres.
- Busca: até 255 caracteres.
- Código de acesso recebido: até 32 caracteres.
- IDs: inteiros positivos.
- Datas: datas civis reais, sem correção automática.
- Campos desconhecidos em bodies/query validados: `400 VALIDATION_ERROR`.
- Erros de recurso e conflito permanecem `404` e `409` com mensagens atuais.
- Erros inesperados permanecem seguros e carregam `INTERNAL_ERROR` e request ID.
