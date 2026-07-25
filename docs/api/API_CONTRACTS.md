# Catálogo atual de contratos HTTP do TRACEFLOW

## Atualização E9 — Projetos e sincronização GitHub

O cadastro integrado usa a operação especializada `POST /projects/from-github` e revalida o repositório externo. A sincronização pagina commits, pull requests e issues, deduplica/upserta por identificadores externos dentro do projeto e só marca sucesso após todas as coleções. Falha parcial preserva lotes já confirmados, o último sucesso e os vínculos técnicos; a resposta de sucesso permanece `{message,summary,project}`.

O alias legado redundante `GET /projects/:projectId/github/artifacts` foi removido após confirmação de ausência de consumidores; ele agora segue o `404 ROUTE_NOT_FOUND`. A rota canônica RF06 permanece `GET /projects/:projectId/artifacts`. Assim, seis placeholders continuam retornando `501` quando a requisição está autenticada.

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
| GET | `/projects/:projectId/traceability/requirement-task-coverage` | `projectId` positivo | — | `200`, métricas atuais |

Tipos preservados: `FUNCIONAL`, `NAO_FUNCIONAL`, `REGRA_NEGOCIO`. Status preservados: `CADASTRADO`, `APROVADO`, `EM_IMPLEMENTACAO`, `VALIDADO`, `CONCLUIDO`, `PENDENTE`, `EM_ANDAMENTO`, `CANCELADO`. As transições continuam sendo regra de domínio do service.

## Tasks, vínculos e Kanban

| Método | Caminho | Entrada principal | Sucesso |
|---|---|---|---|
| POST | `/projects/:projectId/tasks` | `projectId`; `title`; opcionais `description`, `priority`, `responsible`, `deadline`, efforts, `requirementId` | `201`, `{message,task}` |
| GET | `/projects/:projectId/tasks` | `projectId`, `search?` | `200`, `{total,tasks}` |
| GET | `/tasks/:id` | `id` positivo | `200`, `{task}` |
| PUT | `/tasks/:id` | `id`; subconjunto dos campos editáveis | `200`, `{message,task}` |
| DELETE | `/tasks/:id` | `id` positivo | `200`, `{message}` |
| PATCH | `/tasks/:id/status` | `status` | `200`, `{message,task}` |
| PATCH/DELETE | `/tasks/:id/requirement` | `requirementId` no PATCH | `200`, `{message,task}` |
| PATCH/DELETE | `/tasks/:id/pull-request` | `pullRequestId` no PATCH; `null` continua aceito | `200`, `{message,task}` |
| GET | `/tasks/:id/commits` | `id` | `200`, `{total,commits}` |
| POST | `/tasks/:id/commits` | `commitId` | `201`, `{message,commits}` |
| DELETE | `/tasks/:id/commits/:commitId` | ambos positivos | `200`, `{message,commits}` |
| GET | `/tasks/:id/issues` | `id` | `200`, `{total,issues}` |
| POST | `/tasks/:id/issues` | `issueId` | `201`, `{message,issues}` |
| DELETE | `/tasks/:id/issues/:issueId` | ambos positivos | `200`, `{message,issues}` |
| GET | `/projects/:projectId/kanban` | `projectId` | `200`, quadro atual |
| PATCH | `/tasks/:id/move` | `toStatus` e `projectMemberId` ou ator textual `movedBy`; `sprintId?` aceito conforme contrato atual | `200`, `{message,task,movement}` |
| GET | `/projects/:projectId/kanban/movements` | datas, `taskId?`, `movedBy?` | `200`, `{projectId,total,movements}` |
| GET | `/projects/:projectId/kanban/metrics` | mesmos filtros atuais | `200`, métricas atuais |
| GET | `/projects/:projectId/tasks/metrics` | `startDate?`, `endDate?` | `200`, métricas atuais |
| GET | `/projects/:projectId/traceability/{pull-request,commit,issue}-coverage` | `projectId` | `200`, cobertura atual |

Priority: `BAIXA`, `MEDIA`, `ALTA`, `CRITICA`. Status: `A_FAZER`, `EM_ANDAMENTO`, `CONCLUIDO`. Efforts são inteiros não negativos. Pertencimento, duplicidade, PR singular, autoria do movimento e transações permanecem nos services.

## GitHub e Artifacts

| Método | Caminho | Entrada | Sucesso |
|---|---|---|---|
| GET | `/github/auth/check` | — | `200`, autenticação simulável/real conforme ambiente |
| GET | `/github/repositories` | — | `200`, `{repositories}` |
| POST | `/projects/:projectId/github/sync` | `projectId` positivo | `200`, `{message,summary,project}` |
| GET | `/projects/:projectId/commits` | `projectId`, `search?` | `200`, `{commits}` |
| GET | `/projects/:projectId/pull-requests` | `projectId`, `search?` | `200`, `{pullRequests}` |
| GET | `/projects/:projectId/issues` | `projectId`, `search?` | `200`, `{issues}` |
| GET | `/projects/:projectId/artifacts` | `projectId`; `type?`, `startDate?`, `endDate?` | `200`, projeto, filtros, resumo e artefatos |

Tipos de artifacts: `commit`, `pull_request`, `issue`. A paginação E9 ocorre somente na leitura externa do GitHub; os contratos públicos de listagem permanecem inalterados.

## Traceability e placeholders

| Método | Caminho | Entrada | Sucesso |
|---|---|---|---|
| GET | `/projects/:projectId/traceability/requirements-matrix` | `projectId` positivo | `200`, matriz e summary atuais |
| GET | `/projects/:projectId/traceability/requirements/:requirementId` | ambos positivos | `200`, detalhe/grafo atual |
| POST | `/projects/:projectId/trace-links` | não validada para preservar baseline | `501` |
| GET | `/requirements/:requirementId/traceability` | não validada para preservar baseline | `501` |
| GET | `/tasks/:taskId/traceability` | não validada para preservar baseline | `501` |
| GET | `/github-artifacts/:artifactId/traceability` | não validada para preservar baseline | `501` |
| DELETE | `/trace-links/:id` | não validada para preservar baseline | `501` |

Os placeholders alcançam o handler `501` mesmo com texto no parâmetro. Isso é uma exceção deliberada à validação de IDs e mantém a caracterização da E1.

## Conta, privacidade e auditoria (E7)

| Método | Caminho | Entrada | Sucesso |
|---|---|---|---|
| GET | `/account/personal-data` | sessão | `200`, `{data}` minimizado |
| PATCH | `/account/profile` | `name`, `email`, `currentPassword` | `200`, `{message,user}` |
| GET | `/account/sessions` | sessão | `200`, sessões sem hashes |
| DELETE | `/account/sessions/:sessionId` | ID próprio | `204` |
| DELETE | `/account/sessions` | sessão | `204`, revoga todas |
| POST | `/account/personal-data/export` | CSRF | `202`, metadata da exportação |
| GET | `/account/personal-data/export/:exportId` | ID próprio | `200`, status; `404` cruzado |
| GET | `/account/personal-data/export/:exportId/download` | ID próprio não expirado | `200`, JSON; `410 EXPORT_EXPIRED` |
| POST | `/account/deactivate` | `password` | `200`; `409 LAST_PROJECT_OWNER` |
| GET/POST/DELETE | `/account/deletion-request` | POST: `password` | status `200`/`202`/`200` |
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
