# Catálogo atual de contratos HTTP do TRACEFLOW

## Ingresso por código e convites pessoais

Cada projeto possui um único `accessCode` ativo de 128 bits gerado com `node:crypto`; a configuração
sensível é separada dos DTOs gerais e somente OWNER usa `GET|PATCH
/projects/:projectId/access-code` e `POST /projects/:projectId/access-code/regenerate`. O perfil do
código é exclusivamente `MEMBER` ou `VIEWER`, com default `MEMBER`. Regenerar invalida o código
anterior e alterar o perfil afeta somente ingressos futuros.

`GET /projects/join/details?accessCode=...` apresenta somente nome do projeto e perfil. `POST
/projects/join` aceita estritamente `{accessCode}`; identidade vem da sessão e o backend lê o perfil
persistido. Membership ativa não é alterada e membership inativa continua dependendo de reativação
por OWNER. O fluxo cria somente `ProjectMembership`; `ProjectMember` não existe no schema atual.

UC05 usa `GET /projects/invitations/mine`. As respostas usam `POST
/projects/invitations/:invitationId/accept` ou `POST /projects/invitations/:invitationId/decline`. A listagem contém somente convites `PENDING`, não
expirados e cujo e-mail normalizado coincide com o usuário autenticado. O ID sem essa correspondência
retorna `404` opaco. Respostas por ID e por token reutilizam a mesma transação de claim/membership.
Tokens, hashes e códigos de acesso nunca integram logs ou auditoria.

## Conta, segurança, privacidade e integrações

Todos os contratos abaixo exigem sessão e CSRF nas mutations, exceto as duas confirmações públicas. `requireAccountState` limita `DEACTIVATED` à conta/reativação e `DELETION_PENDING` ao status, cancelamento, exportação e reautenticação GitHub necessária para cancelar uma exclusão em conta GitHub-only; `ANONYMIZED` não autentica.

| Método          | Caminho                                                         | Regra principal                                     |
| --------------- | --------------------------------------------------------------- | --------------------------------------------------- |
| GET             | `/settings/account`                                             | conta própria e estado                              |
| PATCH           | `/settings/account/profile`                                     | altera somente nome; conta ativa                    |
| PATCH           | `/settings/account/username`                                    | política L1 e cooldown de 30 dias                   |
| POST/DELETE     | `/settings/account/email-change`                                | senha ou reautenticação GitHub; token hashado       |
| GET             | `/settings/account/email-change/status`                         | solicitação própria pendente                        |
| GET             | `/settings/account/email-change/confirm`                        | público; token único; revoga todas as sessões       |
| POST            | `/settings/security/password`                                   | preserva sessão atual e revoga demais               |
| GET/DELETE      | `/settings/security/sessions[/:sessionId]`                      | UUID público e sessão própria                       |
| POST            | `/settings/security/sessions/revoke-others`                     | preserva sessão atual                               |
| POST            | `/settings/account/deactivate`                                  | autenticação recente, confirmação e último OWNER    |
| POST            | `/account/reactivation/start`                                   | sessão restrita desativada                          |
| GET             | `/account/reactivation/confirm`                                 | público; token único                                |
| GET/POST/DELETE | `/settings/privacy/deletion`                                    | 30 dias e autenticação recente para pedir/cancelar  |
| POST            | `/settings/privacy/export`                                      | ZIP/JSON; `ACTIVE` ou `DELETION_PENDING`            |
| GET             | `/settings/integrations/github`                                 | vínculos da conta com Installations/repos/projetos  |
| DELETE          | `/settings/integrations/github/authorizations/:authorizationId` | autenticação recente; desconecta o vínculo da conta |
| POST            | `/auth/github/reauth/start`                                     | GitHub-only; state, sessão e retorno interno        |

A autenticação recente de uma conta com senha é a confirmação da senha local. Para conta GitHub-only (`passwordHash=null`), o backend exige identidade vinculada e OAuth GitHub recente na mesma sessão; o token de usuário permanece somente em memória. O callback aceita `ACTIVE` e `DELETION_PENDING` apenas nesse purpose, valida state/sessão/GitHub ID e atualiza os timestamps da sessão e da identidade.

A exportação retorna `application/zip` com manifesto 2.0 e não persiste o arquivo. Conteúdo de projetos, requisitos, tarefas atribuídas e integrações entra somente para memberships atualmente ativas. Membership histórica/inativa não autoriza exportar conteúdo atual. Dados próprios incluem perfil, identidade GitHub, sessões sanitizadas, solicitações, histórico de e-mail sem token, metadata de exportações e auditoria permitida. IDs de sessão internos, senhas, cookies, tokens, hashes e secrets não integram DTOs. Instalações GitHub suspensas/removidas não acionam listagem externa.

Ao vencer a carência, o processor faz claim e revalida ownership dentro da transação. Sem impedimento, anonimiza. Se o titular ainda for o único OWNER de projeto não excluído, encerra a solicitação como `REJECTED`, registra `SOLE_PROJECT_OWNER`, retorna a conta para `ACTIVE`, revoga sessões e preserva projeto/membership; uma nova solicitação será necessária após a regularização.

## Identidade, verificação e GitHub App

`POST /auth/register` recebe `{name,username,email,password}` e cria conta/sessão mesmo quando a entrega SMTP falha; `emailVerification.status` informa `accepted`, `temporary_failure` ou `permanent_failure`. `POST /auth/login` recebe `{identifier,password,rememberMe}` e aceita username/e-mail sem enumerar contas. `PATCH /auth/username` substitui o identificador técnico de usuário migrado. `POST /auth/email-verification/resend` exige sessão+CSRF; `POST /auth/email-verification/verify` é público e consome token único.

Callbacks OAuth GitHub bem-sucedidos preservam os parâmetros específicos do fluxo, como `githubIdentity=success` e `githubReauth=success`. Falhas usam o contrato comum `github=error&reason=<codigo-seguro>`; Login e Settings traduzem reasons conhecidos e aplicam mensagem genérica a valores desconhecidos, sem exibir o valor bruto.

GitHub App: `POST /github/app/installations/start`, `GET /github-app/callback`, `GET /github/app/installations`, `GET /github/app/installations/:installationId/repositories`, `PUT /projects/:projectId/github/integration` e `POST /webhooks/github-app`. Start/list/connect exigem sessão; start/connect e sync exigem e-mail verificado. O callback é público e valida state de uso único, conta `ACTIVE`, sessão original, intenção e projeto. Ele não exige `GitHubIdentity`.

Com **Request user authorization (OAuth) during installation** habilitado na App, o callback troca o `code` por user access token efêmero e pagina `GET /user/installations` somente para provar que `installation_id` está acessível ao ator que concluiu a instalação. Depois confirma a Installation com JWT da App e faz uma única consulta mínima (`per_page=1`) com Installation Access Token para validar acesso técnico; zero repositórios é uma resposta válida. A descoberta completa e sua paginação continuam nos endpoints próprios. O token de usuário não é comparado com `GitHubIdentity`, usado no sync, persistido, registrado ou retornado. O callback da App e `/auth/github/callback` usam states, cookies e responsabilidades separados.

`GET /github/app/installations/:installationId/repositories` e `GET /github/app/repositories` retornam `{repositories}`. A lista corresponde ao escopo vivo concedido à Installation e cada DTO minimizado inclui `availability`, `alreadyConnected`, `connectedToCurrentProject` e `selectable`, nunca token/secret. Repositório ocupado por outro projeto é listado, mas não selecionável. `POST /projects/from-github` aceita `{githubInstallationId,githubRepositoryId,name?,description?,responsibleTeam?}`; criação e conexão revalidam Installation `ACTIVE` e acesso atual ao repositório. Metadados enviados pelo navegador não são autoridade. Com `projectId`, somente a repo já vinculada pode ser reconectada; tentar outra recebe `409 GITHUB_REPOSITORY_SWAP_FORBIDDEN`. Uma instalação pode servir N projetos, mas `projectId` e `githubRepositoryId` são exclusivos em `ProjectGitHubIntegration`.

Installation lifecycle: `PENDING` aguarda autorização concluída, `ACTIVE` permite seleção/sync/webhook, `SUSPENDED` e `REMOVED` bloqueiam operações novas sem apagar projetos ou artifacts. Callback não reativa estados bloqueados. Delivery webhook assinado é processado uma vez; duplicata `PROCESSING/PROCESSED` retorna sucesso idempotente e `FAILED`/stale pode ser reivindicado novamente. Falhas guardam somente etapa, código seguro e timestamps.

Falhas GitHub `403` com quota remanescente representam autorização; `403` com quota zero ou `Retry-After`, e `429`, representam rate limit. Retry é limitado por `GITHUB_RETRY_MAX`, respeita `Retry-After`/`X-RateLimit-Reset`, aplica fallback exponencial e obedece `GITHUB_RETRY_MAX_DELAY_MS` e timeout.

Os contratos sistêmicos `GET /github/auth/check` e `GET /github/repositories` foram removidos. Não há fallback para PAT ou configuração `GITHUB_TOKEN`.

## Evidência e rastreabilidade

Os caminhos abaixo são relativos ao prefixo `/api`, exceto os endpoints de health. Autenticação e
autorização por papel estão consolidadas em `docs/security/AUTHORIZATION_MATRIX.md`; a relação entre
requisito funcional, fluxo, endpoint, service, persistência, frontend e testes está em
`docs/traceability/RF_TECHNICAL_MATRIX.md`. Este catálogo deve permanecer reconciliado com os
arquivos `*.routes.js`: o único contrato ativo deliberadamente não implementado é
`DELETE /api/projects/:id`, que permanece `501`.

## Requisitos e rastreabilidade canônica

`Task.requirementId`, `Task.pullRequestId`, `TaskCommit` e `TaskIssue` são as únicas fontes dos vínculos. A matriz passou a ser paginada sem carregar conteúdo integral de artefatos e mantém um summary global independente da página. As perspectivas de requisito, tarefa e artefato usam o mesmo DTO `{projectId,perspective,summary,nodes,edges,pagination}`; IDs de node são namespaced e as arestas usam `REQUIREMENT_TASK`, `TASK_COMMIT`, `TASK_PULL_REQUEST` ou `TASK_ISSUE`.

Os cinco placeholders baseados em `TraceLink`/`GithubArtifact` foram removidos e seguem o `404` global. O único `501` restante é `DELETE /projects/:id`. O fechamento definitivo do RF41 adotou exclusivamente `[TASK-<ID>]`, persiste sugestões revisáveis e só cria `TaskCommit` após confirmação humana.

## Projetos e sincronização GitHub

O cadastro integrado usa a operação especializada `POST /projects/from-github` e revalida o repositório externo. A sincronização assíncrona cria ou reutiliza uma execução persistida com `POST /projects/:projectId/github/sync`, responde `202 {message,run}` e expõe progresso/resultado em `GET /projects/:projectId/github/sync/status`. A execução pagina commits, pull requests e issues, deduplica/upserta por identificadores externos dentro do projeto e só marca `SUCCEEDED` após todas as coleções. Falha parcial preserva lotes já confirmados, o último sucesso e os vínculos técnicos.

O alias legado redundante `GET /projects/:projectId/github/artifacts` foi removido após confirmação de ausência de consumidores; ele agora segue o `404 ROUTE_NOT_FOUND`. A rota canônica RF06 permanece `GET /projects/:projectId/artifacts`.

## Persistência canônica sem ruptura HTTP

A cardinalidade funcional confirmada é Task 0..1 PullRequest e PullRequest 0..N Tasks.
`Task.pullRequestId` é a única fonte canônica; o join experimental N:N, o dual-write e o fallback
foram removidos. Os endpoints continuam singulares e preservam paths, status, mensagens e payloads.

## Identidade e privacidade dos endpoints

Health permanece público. Também são públicos `POST /api/auth/register`, `login`, `forgot-password` e `reset-password`. As demais rotas `/api` exigem cookie de sessão; mutations exigem `X-CSRF-Token`. `GET /api/auth/me` restaura a identidade, `GET /api/auth/csrf` devolve o token estável derivado da sessão, `POST /api/auth/logout` revoga a sessão e `POST /api/auth/change-password` revoga todas as sessões.

Convites canônicos: `GET|POST /api/projects/:projectId/invitations`, `DELETE /api/projects/:projectId/invitations/:invitationId`, respostas por token e a perspectiva pessoal L5.1. O join por `accessCode` é autenticado e cria `ProjectMembership` usando exclusivamente identidade da sessão e papel persistido. Papéis: OWNER, MANAGER, MEMBER e VIEWER. Ausência de membership pode retornar 404; papel insuficiente, 403. Placeholders retornam 401 sem sessão e preservam 501 autenticados.

`GET /api/projects/:projectId/members` representa a fonte canônica `ProjectMembership` e retorna
`{projectId,currentMembership,members}`. OWNER recebe e-mail completo; demais papéis recebem valor
mascarado. Administração canônica: `PATCH|DELETE /api/projects/:projectId/members/:membershipId`,
`POST .../reactivate`, `DELETE .../members/me` e
`POST /api/projects/:projectId/ownership/transfer`. Desativação/saída é lógica; o último OWNER recebe
`409 LAST_PROJECT_OWNER`.

Convite duplicado ativo é bloqueado com `INVITATION_ALREADY_PENDING`, inclusive sob concorrência, e o convite original permanece válido. Em produção, criação retorna `{invitation,emailDelivery}` e o token segue exclusivamente pelo adapter de e-mail; o campo `token` existe apenas em testes controlados. A resposta informa se a entrega foi aceita ou falhou de forma sanitizada. Forgot-password continua uniforme e nunca retorna token fora de testes.

Erros seguem `{message,code,requestId}`. O fluxo de convite distingue `INVITATION_INVALID`, `INVITATION_EXPIRED`, `INVITATION_REVOKED`, `INVITATION_ALREADY_USED`, `INVITATION_DECLINED`, `INVITATION_ALREADY_PENDING` e `PROJECT_MEMBER_ALREADY_EXISTS`; incompatibilidade entre destinatário e sessão continua genérica. Respostas de recuperação são uniformes. O cookie nunca é exposto a JavaScript e CORS usa credenciais somente para a allowlist.

## Escopo e convenções

As seções abaixo descrevem os contratos funcionais vigentes, sujeitos à autenticação/autorização
documentada neste catálogo e na matriz correspondente. Este catálogo não é uma especificação
OpenAPI definitiva.

Todas as respostas incluem o header `X-Request-Id`. Erros de domínio preservam `{ "message": "..." }`. Erros de validação usam HTTP `400`:

```json
{
  "message": "O título da tarefa é obrigatório.",
  "code": "VALIDATION_ERROR",
  "details": [
    { "field": "title", "message": "O título da tarefa é obrigatório." }
  ],
  "requestId": "identificador-seguro"
}
```

`details` nunca contém o valor recebido. Bodies mutáveis são estritos e rejeitam campos desconhecidos. Params numéricos aceitam somente inteiro decimal positivo e são convertidos para `number`. Datas de filtro usam `YYYY-MM-DD`; `deadline` aceita esse formato ou datetime ISO-8601 completo. Query `search` é opcional e limitada a 255 caracteres.

A API exige JSON para bodies, aplica limite padrão de 100kb, CORS por allowlist e rate limiting.
Erros de infraestrutura usam o formato seguro `{message,code,requestId}`: origem proibida
`403 CORS_ORIGIN_DENIED`, JSON malformado `400 MALFORMED_JSON`, payload excessivo
`413 PAYLOAD_TOO_LARGE`, content type incompatível `415 UNSUPPORTED_MEDIA_TYPE` e limite excedido
`429 RATE_LIMITED`. Respostas `/api` incluem `Cache-Control: no-store`. O 429 inclui os headers
`RateLimit` e `Retry-After` e o corpo `{message,code,requestId,retryAfterSeconds,scope}`; `scope`
identifica apenas a categoria pública da quota, sem expor sua chave, usuário ou IP.

## Infraestrutura

| Método   | Caminho           | Entrada | Sucesso                             | Erros principais               |
| -------- | ----------------- | ------- | ----------------------------------- | ------------------------------ |
| GET      | `/health`         | Nenhuma | `200`, `{status,message}` histórico | `500` inesperado               |
| GET      | `/health/live`    | Nenhuma | `200`, `{status:"ok"}`              | `500` inesperado               |
| GET      | `/health/ready`   | Nenhuma | `200`, `{status:"ready"}`           | `503` dependência indisponível |
| qualquer | rota desconhecida | —       | —                                   | `404`, `ROUTE_NOT_FOUND`       |

## Projects e memberships

| Método   | Caminho                                                 | Params/query         | Body aceito                                                                                      | Sucesso                                                                               |
| -------- | ------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| POST     | `/projects`                                             | —                    | `name`, `responsibleTeam`; opcionais `description`, `status`                                     | `201`, `{message,project}`                                                            |
| POST     | `/projects/from-github`                                 | —                    | `githubInstallationId`, `githubRepositoryId`; opcionais `name`, `description`, `responsibleTeam` | `201`, `{message,project}`                                                            |
| GET      | `/projects`                                             | —                    | —                                                                                                | `200`, `{projects}`                                                                   |
| GET      | `/projects/:id`                                         | `id` positivo        | —                                                                                                | `200`, `{project}`                                                                    |
| PUT      | `/projects/:id`                                         | `id` positivo        | subconjunto de `name`, `description`, `responsibleTeam` e `status`                               | `200`, `{message,project}`                                                            |
| DELETE   | `/projects/:id`                                         | baseline placeholder | —                                                                                                | `501` inalterado                                                                      |
| GET      | `/projects/join/details`                                | query `accessCode`   | —                                                                                                | `200`, `{details:{project,role}}`                                                     |
| POST     | `/projects/join`                                        | —                    | somente `accessCode`                                                                             | `201`, `{message,project,membership}`                                                 |
| GET      | `/projects/:projectId/access-code`                      | `projectId` positivo | —                                                                                                | OWNER: `{accessCode:{accessCode,role,inviteLink}}`                                    |
| PATCH    | `/projects/:projectId/access-code`                      | `projectId` positivo | `role`: MEMBER ou VIEWER                                                                         | `200`, configuração atualizada                                                        |
| POST     | `/projects/:projectId/access-code/regenerate`           | `projectId` positivo | body vazio                                                                                       | `200`, novo código; anterior inválido                                                 |
| GET      | `/projects/:projectId/members`                          | `projectId` positivo | —                                                                                                | `200`, `{projectId,currentMembership,members}`                                        |
| PATCH    | `/projects/:projectId/members/:membershipId`            | IDs positivos        | `role`: OWNER/MANAGER/MEMBER/VIEWER                                                              | `200`, `{message,membership}`                                                         |
| DELETE   | `/projects/:projectId/members/:membershipId`            | IDs positivos        | —                                                                                                | `204`, desativação lógica                                                             |
| POST     | `/projects/:projectId/members/:membershipId/reactivate` | IDs positivos        | body vazio                                                                                       | `200`, `{message,membership}`                                                         |
| DELETE   | `/projects/:projectId/members/me`                       | `projectId` positivo | —                                                                                                | `204`, saída própria lógica                                                           |
| POST     | `/projects/:projectId/ownership/transfer`               | `projectId` positivo | `membershipId` positivo                                                                          | `200`, `{message,membership}`                                                         |
| GET/POST | `/projects/:projectId/invitations`                      | `projectId` positivo | POST: `email`, `role`                                                                            | `200` lista / `201` criação                                                           |
| DELETE   | `/projects/:projectId/invitations/:invitationId`        | IDs positivos        | —                                                                                                | `204`                                                                                 |
| POST     | `/projects/invitations/details`                         | —                    | token opaco                                                                                      | `200`, `{invitation:{project,role,expiresAt,status}}` para o destinatário autenticado |
| POST     | `/projects/invitations/accept`                          | —                    | token opaco                                                                                      | `200`, `{message,membership}`                                                         |
| POST     | `/projects/invitations/decline`                         | —                    | token opaco                                                                                      | `200`, `{message}`; nenhuma membership é criada                                       |
| GET      | `/projects/invitations/mine`                            | —                    | —                                                                                                | `200`, convites pendentes do e-mail da sessão                                         |
| POST     | `/projects/invitations/:invitationId/accept`            | ID positivo          | body vazio                                                                                       | `200`, `{message,membership}`                                                         |
| POST     | `/projects/invitations/:invitationId/decline`           | ID positivo          | body vazio                                                                                       | `200`, `{message}`                                                                    |
| PATCH    | `/projects/:projectId/github/sync-settings`             | `projectId` positivo | boolean `githubAutoSyncEnabled`                                                                  | `200`, `{message,project}`                                                            |

Status de projeto: `ATIVO`, `INATIVO`, `ARQUIVADO`. URLs GitHub precisam usar HTTP(S) e host `github.com`. E-mails são validados, mas continuam opcionais. `accessCode` é uma capability secreta de ingresso, não uma credencial de autenticação.

DTOs gerais de projeto expõem a integração, quando existente, em `githubIntegration`; não
repetem `githubOwner`, `githubRepo`, `githubUrl` nem o estado de sync no nível de `Project`.
`accessCode` e o `inviteLink` derivado aparecem apenas no contrato sensível de access code
para OWNER. `POST /projects/:projectId/members` foi removido e retorna o `404
ROUTE_NOT_FOUND` global.

## Requirements

| Método | Caminho                                                       | Params/query           | Body aceito                                   | Sucesso                                                |
| ------ | ------------------------------------------------------------- | ---------------------- | --------------------------------------------- | ------------------------------------------------------ |
| POST   | `/projects/:projectId/requirements`                           | `projectId` positivo   | `title`; opcionais `description`, `type`      | `201`, `{message,requirement}`                         |
| GET    | `/projects/:projectId/requirements`                           | `projectId`; `search?` | —                                             | `200`, `{total,requirements}`                          |
| GET    | `/requirements/:id`                                           | `id` positivo          | —                                             | `200`, `{requirement}`                                 |
| PUT    | `/requirements/:id`                                           | `id` positivo          | subconjunto de `title`, `description`, `type` | `200`, `{message,requirement}`                         |
| DELETE | `/requirements/:id`                                           | `id` positivo          | —                                             | `200`, `{message}`                                     |
| PATCH  | `/requirements/:id/status`                                    | `id` positivo          | `status`                                      | `200`, `{message,requirement}`                         |
| PATCH  | `/requirements/:id/confirm-completion`                        | `id` positivo          | nenhum                                        | `200`, `{message,requirement}`                         |
| GET    | `/requirements/:id/tasks`                                     | `id` positivo          | —                                             | `200`, `{requirementId,total,tasks}`                   |
| PUT    | `/requirements/:id/tasks`                                     | `id` positivo          | `taskIds`: array único de até 100 IDs         | `200`, `{message,requirement,reassignedTasks,changes}` |
| GET    | `/projects/:projectId/traceability/requirement-task-coverage` | `projectId` positivo   | —                                             | `200`, métricas atuais                                 |

Tipos preservados: `FUNCIONAL`, `NAO_FUNCIONAL`, `REGRA_NEGOCIO`. Status preservados: `CADASTRADO`, `APROVADO`, `EM_IMPLEMENTACAO`, `VALIDADO`, `CONCLUIDO`, `PENDENTE`, `EM_ANDAMENTO`, `CANCELADO`. As transições continuam sendo regra de domínio do service.

## Tasks, vínculos e Kanban

| Método       | Caminho                                                                  | Entrada principal                                                                                                    | Sucesso                                                                         |
| ------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| POST         | `/projects/:projectId/tasks`                                             | `projectId`; `title`; opcionais `description`, `priority`, `responsibleUserId`, `deadline`, efforts, `requirementId` | `201`, `{message,task}`                                                         |
| GET          | `/projects/:projectId/tasks`                                             | `projectId`, `search?`                                                                                               | `200`, `{total,tasks}`                                                          |
| GET          | `/tasks/:id`                                                             | `id` positivo                                                                                                        | `200`, `{task}`                                                                 |
| PUT          | `/tasks/:id`                                                             | `id`; subconjunto dos campos editáveis                                                                               | `200`, `{message,task}`                                                         |
| DELETE       | `/tasks/:id`                                                             | `id` positivo                                                                                                        | `200`, `{message}`                                                              |
| PATCH        | `/tasks/:id/status`                                                      | `status`                                                                                                             | `200`, `{message,task}`; delega à transição canônica e cria movimento/histórico |
| PATCH/DELETE | `/tasks/:id/requirement`                                                 | `requirementId` no PATCH                                                                                             | `200`, `{message,task}`                                                         |
| PATCH/DELETE | `/tasks/:id/pull-request`                                                | `pullRequestId` no PATCH; `null` continua aceito                                                                     | `200`, `{message,task}`                                                         |
| GET          | `/tasks/:id/commits`                                                     | `id`                                                                                                                 | `200`, `{total,commits}`                                                        |
| POST         | `/tasks/:id/commits`                                                     | `commitId`                                                                                                           | `201`, `{message,commits}`                                                      |
| DELETE       | `/tasks/:id/commits/:commitId`                                           | ambos positivos                                                                                                      | `200`, `{message,commits}`                                                      |
| GET          | `/tasks/:id/issues`                                                      | `id`                                                                                                                 | `200`, `{total,issues}`                                                         |
| POST         | `/tasks/:id/issues`                                                      | `issueId`                                                                                                            | `201`, `{message,issues}`                                                       |
| DELETE       | `/tasks/:id/issues/:issueId`                                             | ambos positivos                                                                                                      | `200`, `{message,issues}`                                                       |
| GET          | `/projects/:projectId/kanban`                                            | `projectId`                                                                                                          | `200`, quadro atual                                                             |
| PATCH        | `/tasks/:id/move`                                                        | somente `toStatus`; o ator é obtido da sessão                                                                        | `200`, `{message,task,movement}`; `409` em concorrência otimista                |
| GET          | `/projects/:projectId/kanban/movements`                                  | datas, `taskId?`, `actorUserId?`, `movedBy?`, `page?`, `limit?`                                                      | `200`, `{projectId,total,movements,pagination}`                                 |
| GET          | `/projects/:projectId/tasks/history`                                     | `taskId?`, `actorUserId?`, `field?`, datas, `page?`, `limit?`                                                        | `200`, `{projectId,total,items,pagination}`                                     |
| GET          | `/projects/:projectId/kanban/metrics`                                    | mesmos filtros atuais                                                                                                | `200`, métricas atuais                                                          |
| GET          | `/projects/:projectId/tasks/metrics`                                     | `startDate?`, `endDate?`                                                                                             | `200`, métricas atuais                                                          |
| GET          | `/projects/:projectId/traceability/{pull-request,commit,issue}-coverage` | `projectId`                                                                                                          | `200`, cobertura atual                                                          |
| GET (SSE)    | `/projects/:projectId/events`                                            | `projectId`; query vazia                                                                                             | stream project-scoped; atualmente somente eventos de Comments                   |
| GET          | `/tasks/:id/comments`                                                    | `id`; `before?` opaco, `limit?` entre 1 e 100                                                                        | `200`, `{taskId,comments,permissions,pagination}`                               |
| POST         | `/tasks/:id/comments`                                                    | `id`; `content`                                                                                                      | `201`, `{message,comment}`                                                      |
| PATCH        | `/tasks/:id/comments/:commentId`                                         | ambos positivos; `content`                                                                                           | `200`, `{message,comment}`                                                      |
| DELETE       | `/tasks/:id/comments/:commentId`                                         | ambos positivos                                                                                                      | `200`, `{message,comment}`                                                      |

Priority: `BAIXA`, `MEDIA`, `ALTA`, `CRITICA`. Status: `A_FAZER`, `EM_ANDAMENTO`, `CONCLUIDO`. Efforts são inteiros não negativos. `responsibleUserId` deve identificar usuário com membership ativa no projeto; respostas expõem apenas `{id,name}` em `responsibleUser`. `Task.responsible` e `TaskMovement.movedBy` permanecem somente como snapshots históricos de leitura; `projectMemberId` foi removido. O histórico funcional usa `STATUS`, `DEADLINE`, `RESPONSIBLE`, `PRIORITY` e `SPRINT` (este último desde o RF10); mudanças sem efeito não geram entrada. O enum aceito em `field` espelha `TaskHistoryField` do Prisma — todo valor novo no schema precisa entrar também em `taskHistoryQuerySchema`, sob pena de o campo ficar gravável e não filtrável.

## Atualização S1-05 — comentários das tarefas (RF29/RF31)

`TaskComment` é o modelo canônico. Autor vem exclusivamente de `req.auth.user`; nunca do body. `content` é obrigatório, sem espaços nas pontas e limitado a 2000 caracteres; conteúdo vazio recebe `400`. A listagem usa cursor opaco e ordenação estável `createdAt DESC, id DESC`, com 30 comentários por padrão e máximo 100. `before` solicita o lote imediatamente anterior e cursor inválido recebe `400`; `page` não pertence mais ao contrato. A query lê `limit + 1` e não executa COUNT por página.

```json
{
  "taskId": 7,
  "comments": [],
  "permissions": { "canComment": true, "canModerate": false },
  "pagination": { "limit": 30, "hasMore": true, "nextCursor": "opaque" }
}
```

`nextCursor` é `null` quando `hasMore=false`. Tombstones participam da mesma ordenação e todos os comentários permanecem alcançáveis por chamadas sucessivas. Cada comentário traz `canEdit`/`canDelete` resolvidos pelo backend para a sessão atual.
O índice incremental `TaskComment(taskId, createdAt, id)` sustenta a busca por cursor sem alterar dados ou migrations anteriores.

Política de edição/exclusão: VIEWER só lê. MEMBER cria e edita/exclui somente o próprio comentário. MANAGER e OWNER excluem qualquer comentário do projeto (moderação), mas não editam texto de terceiros — editar continua exclusivo do autor, mesmo para OWNER. Exclusão é lógica (`deletedAt`/`deletedById`) e o comentário não é reaproveitável: edição ou nova exclusão em comentário já excluído recebe `404`. Toda criação, edição e exclusão gera `AuditEvent` (`TASK_COMMENT_CREATED`, `TASK_COMMENT_UPDATED`, `TASK_COMMENT_DELETED`).

Comentário excluído permanece na listagem como marcador, preservando a linha do tempo exigida pelo RF31: o DTO mantém `id`, `createdAt` e `author`, devolve `content: null` e `editedAt: null`, expõe `deletedAt` e `deletionActorType`, e fixa `canEdit`/`canDelete` em `false`. `deletionActorType` é `AUTHOR` somente quando `deletedById` corresponde ao autor, `MODERATION` quando a exclusão confirmada pelo backend foi feita por outro ator autorizado, e `UNKNOWN` quando o registro histórico não identifica o ator. O conteúdo excluído não retorna para nenhum papel, inclusive quem moderou; permanece apenas no banco para auditoria. Novas exclusões, inclusive pelo próprio autor, registram o usuário autenticado em `deletedById`. O DELETE devolve o tombstone já classificado para reconciliação local imediata.

### Stream de eventos de projeto

`GET /projects/:projectId/events` exige sessão HttpOnly válida, conta ativa e membership ativa no projeto. Anônimo recebe `401`; não membro recebe `404`; VIEWER pode abrir o stream, mas isso não concede direito de mutation. A query deve ser vazia: credenciais em URL não são aceitas. CORS preserva a allowlist atual com credentials.

O response usa `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no` e sugere `retry: 3000` ao `EventSource`. Cada mensagem chega no canal SSE padrão (`message`) e contém um envelope JSON:

```json
{
  "type": "task.comment.created",
  "projectId": 2,
  "taskId": 7,
  "occurredAt": "2026-09-02T12:00:00.000Z",
  "data": { "comment": {} }
}
```

Os únicos tipos atuais são `task.comment.created`, `task.comment.updated` e `task.comment.deleted`; todos transportam o DTO seguro completo para merge local sem GET. O delete transporta o tombstone com `AUTHOR`, `MODERATION` ou `UNKNOWN`. Eventos são publicados somente depois da transaction da mutation concluir. Falha da mutation não publica; falha do publisher depois do commit não altera o sucesso REST e é recuperada por reconciliação posterior.

O servidor envia heartbeat em comentário SSE a cada 25 segundos, sem consulta ao banco, e encerra o stream após no máximo 15 minutos para nova autorização. Backpressure, erro de transporte, logout, revogação de sessão, saída/desativação de membership ou mudança de papel encerram a conexão. O publisher atual é in-memory e single-node; multi-node exigirá adapter de broker. Não há replay/event log persistente. O Kanban não publica nem consome SSE neste contrato.

## GitHub e Artifacts

| Método | Caminho                                                  | Entrada                                        | Sucesso                                                          |
| ------ | -------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| POST   | `/github/app/installations/start`                        | `intendedAction`; `projectId?`                 | `200`, `{url,expiresInMs}` para autorização da GitHub App        |
| GET    | `/github/app/installations`                              | sessão                                         | `200`, `{installations}` autorizadas ao usuário                  |
| GET    | `/github/app/repositories`                               | `projectId?`                                   | `200`, `{repositories}` da Installation                          |
| GET    | `/github/app/installations/:installationId/repositories` | instalação autorizada; `projectId?`            | `200`, `{repositories}` da Installation                          |
| PUT    | `/projects/:projectId/github/integration`                | instalação e repositório comprovados           | `200`; troca de repositório recebe `409`                         |
| POST   | `/projects/:projectId/github/sync`                       | `projectId` positivo; body vazio               | `202`, `{message,run}`; execução persistida iniciada ou já ativa |
| GET    | `/projects/:projectId/github/sync/status`                | `projectId` positivo                           | `200`, `{run}` com status, progresso, summary e erro sanitizado  |
| GET    | `/projects/:projectId/commits`                           | `projectId`, `search?`                         | `200`, `{commits}`                                               |
| GET    | `/projects/:projectId/pull-requests`                     | `projectId`, `search?`                         | `200`, `{pullRequests}`                                          |
| GET    | `/projects/:projectId/issues`                            | `projectId`, `search?`                         | `200`, `{issues}`                                                |
| GET    | `/projects/:projectId/artifacts`                         | `projectId`; `type?`, `startDate?`, `endDate?` | `200`, projeto, filtros, resumo e artefatos                      |

Tipos de artifacts: `commit`, `pull_request`, `issue`. A paginação ocorre somente na leitura externa
do GitHub; os contratos públicos de listagem permanecem inalterados.

Nomes de branch preservam exatamente a caixa recebida do Git. `Feature/Login`, `feature/login`
e `FEATURE/LOGIN` são identidades distintas na persistência, nos filtros e nos vínculos de
rastreabilidade; o backend não normaliza esses nomes.

Coberturas preservam os campos históricos e acrescentam `coverage: {numerator,denominator,percentage,hasData}`. Quando não há denominador, `percentage` é `null` e `hasData` é `false`; o escalar histórico permanece `0` por compatibilidade.

## Traceability canônica

| Método | Caminho                                                                      | Entrada                                                                                                | Sucesso                                                                            |
| ------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| GET    | `/projects/:projectId/traceability/requirements-matrix`                      | IDs; `page?`, `limit?`                                                                                 | `200`, `{projectId,summary,requirements,pagination}`                               |
| GET    | `/projects/:projectId/traceability/requirements/:requirementId`              | IDs; `page?`, `limit?` paginam tarefas                                                                 | `200`, DTO de grafo, perspectiva `REQUIREMENT`                                     |
| GET    | `/projects/:projectId/traceability/tasks/:taskId`                            | IDs; `page?`, `limit?` paginam artefatos                                                               | `200`, DTO de grafo, perspectiva `TASK`                                            |
| GET    | `/projects/:projectId/traceability/artifacts/:artifactType/:artifactId`      | `commit`, `pull-request` ou `issue`; paginação de tarefas                                              | `200`, DTO de grafo da perspectiva tipada                                          |
| POST   | `/projects/:projectId/traceability/commit-suggestions/scan`                  | body vazio                                                                                             | `200`, `{scannedCommits,detectedReferences,createdSuggestions,skippedSuggestions}` |
| GET    | `/projects/:projectId/traceability/commit-suggestions`                       | `status?` = PENDING/CONFIRMED/REJECTED; `taskId?` positivo e pertencente ao projeto; `page?`, `limit?` | `200`, DTO minimizado, permissões e paginação                                      |
| POST   | `/projects/:projectId/traceability/commit-suggestions/:suggestionId/confirm` | IDs; body vazio                                                                                        | `200`, `{message,suggestion,changed}`; cria `TaskCommit` atomicamente              |
| POST   | `/projects/:projectId/traceability/commit-suggestions/:suggestionId/reject`  | IDs; body vazio                                                                                        | `200`, `{message,suggestion,changed}`; não cria vínculo                            |

O summary da matriz é calculado sobre todo o projeto, não apenas sobre a página. A matriz seleciona somente dados resumidos e contagens. O grafo nunca expõe `Commit.authorEmail`. Recursos de outro projeto recebem `404`; consultas exigem VIEWER+ e a atualização atômica Requirement–Task exige MEMBER+.

O parser RF41 usa somente `/\[TASK-(\d+)\]/gi`: aceita caixa variada, múltiplos IDs e deduplica repetições na mesma mensagem. Não aceita `TASK-42`, `#42`, `ID 42`, `[ISSUE-42]` ou IDs não numéricos. Detecção e scan não criam vínculo; sugestões rejeitadas ou confirmadas nunca são reabertas.

Sem `taskId`, a consulta preserva a visão paginada do projeto. Com `taskId`, retorna somente sugestões da Task validada no mesmo projeto; ID inválido recebe `400` e Task inexistente ou de outro projeto recebe `404`. O DTO continua sem `Commit.authorEmail`.

## Conta, privacidade e auditoria

Conta, sessões, exportação, desativação e ciclo de exclusão usam exclusivamente os contratos
`/settings/*` descritos no início deste catálogo. As rotas específicas
`POST /account/reactivation/start` e `GET /account/reactivation/confirm` permanecem atuais.
Auditoria usa `GET /account/audit-events` para a perspectiva do titular e `GET
/projects/:projectId/audit-events` para OWNER.

Os antigos paths `/account/personal-data`, `/account/profile`, `/account/sessions`,
`/account/personal-data/export`, `/account/deactivate` e `/account/deletion-request`,
incluindo seus subpaths, foram removidos e retornam `404 ROUTE_NOT_FOUND`. Exportação
canônica não contém hashes, cookies, segredos nem dados pessoais de outros membros e só inclui
conteúdo de projeto com membership atualmente ativa. A anonimização elimina credenciais e PII
dispensável, pseudonimiza referências históricas conhecidas e cria somente um fingerprint HMAC do
GitHub ID para impedir reassociação automática futura. Todos os caminhos possuem prefixo `/api`.

## S1-04 (RF10 e RF35) — Sprints, marcos, cronograma e evolução

RF10 (cronograma) e RF35 (evolução por sprint).

O modelo segue o [ADR-010](../architecture/ADR-010-SPRINT-DOMAIN-CORRECTIONS.md) e o
[ADR-011](../architecture/ADR-011-MILESTONE-SPRINT-INVERSION.md), que supersede D02, D11 e parte
de D12. Quatro convenções valem para tudo abaixo:

- **Janela semiaberta.** O intervalo de uma sprint é `[startDate, endDate)`. A sprint seguinte
  pode começar exatamente no instante em que a anterior termina, e nunca antes.
- **Instantes, não dias.** `startDate`, `endDate` e `dueDate` guardam data **e hora**, em UTC.
  `YYYY-MM-DD` continua aceito na escrita e significa o início daquele dia em UTC. A leitura
  sempre devolve ISO-8601 UTC.
- **Sprint encerrada é registro.** `CONCLUIDA` e `CANCELADA` congelam composição e resultado.
- **O marco agrupa sprints.** O vínculo é declarado pela sprint (`Sprint.milestoneId`); o marco
  tem prazo próprio, independente da janela de qualquer sprint.

### Sprints

| Método | Caminho | Entrada | Sucesso | Regras |
|---|---|---|---|---|
| POST | `/projects/:projectId/sprints` | `name`, `objective?`, `startDate`, `endDate`, `milestoneId?` (aceita null) | `201` `{message, sprint}` | `startDate < endDate`; nome único entre Sprints não excluídas no projeto; sem sobreposição com outra sprint do projeto; marco do mesmo projeto |
| GET | `/projects/:projectId/sprints` | `status?`, `search?` | `200` `{total, sprints}` | ordenado por `startDate` asc |
| GET | `/sprints/:id` | — | `200` `{sprint}` | membership no projeto da sprint |
| PUT | `/sprints/:id` | subconjunto de `name`, `objective`, `startDate`, `endDate`, `milestoneId` | `200` `{message, sprint}` | bloqueado em estado terminal; revalida sobreposição; `milestoneId: null` desvincula |
| PATCH | `/sprints/:id/status` | `status` | `200` `{message, sprint, carryOver, returnedToBacklog, milestoneCompleted}` | somente transições válidas; uma sprint `EM_ANDAMENTO` por projeto; entrar em estado terminal congela a composição; concluir transfere pendências à próxima sprint planejada válida ou ao backlog e pode concluir o marco; cancelar devolve pendências ao backlog |
| DELETE | `/sprints/:id` | — | `200` `{message, sprint, returnedToBacklog}` | exclusão lógica em qualquer estado; histórico preservado; ponteiros atuais voltam ao backlog, sem carry-over |
| GET | `/sprints/:id/impact` | — | `200` `{sprintId, status, currentTasks, completion}` | prévia de conclusão/exclusão, calculada no domínio |
| GET | `/sprints/:id/tasks` | — | `200` `{sprintId, total, tasks, isFrozen, snapshotAt, historicalSummary, historicalLimitations}` | projeção canônica: aberta live; terminal exclusivamente histórica |
| PUT | `/sprints/:id/tasks` | `taskIds: number[]` | `200` `{message, sprintId, total, tasks}` | substituição atômica; máx. 100; sem duplicados; bloqueado em estado terminal |

`milestoneId` é opcional na criação e na edição, inclusive como `null`. A regra foi alterada
por decisão explícita PLANNING-QA-FIX-03; o banco já aceitava nulo (ADR-011 D02 revisado).
Marco inexistente ou excluído não pode ser associado e responde `404 MILESTONE_NOT_FOUND`;
marco de outro projeto responde `400 SPRINT_MILESTONE_PROJECT_MISMATCH` **apenas** para quem
enxerga os dois projetos, e `404` idêntico ao de ID inexistente para quem não enxerga.

**Efeitos do encerramento.** `PATCH /sprints/:id/status` devolve, além da sprint:

| Campo | Significado |
|---|---|
| `carryOver` | `{destinationSprintId, destinationSprintName, movedTasks}` quando existe destino planejado válido na conclusão; `null` sem destino ou em outras transições |
| `returnedToBacklog` | quantas tarefas não concluídas tiveram `Task.sprintId` zerado; zero quando há carry-over (ADR-011 D07) |
| `milestoneCompleted` | `{id, title, status}` quando esta foi a última sprint pendente do marco, ou `null` |

Na conclusão, o destino é a Sprint `PLANEJADA` do mesmo projeto com menor `startDate`
maior ou igual ao `endDate` da origem, com intervalo válido e sem sobreposição com a origem;
empate é decidido pelo menor `id`. A fronteira contígua é válida. Somente Tasks com
`Task.sprintId` igual à origem e status diferente de `CONCLUIDO` são transferidas. Tasks
concluídas permanecem na origem; participações já removidas não são ressuscitadas.

Sem destino válido, pendências retornam ao backlog; nenhuma Sprint é criada automaticamente.
Cancelamento mantém o retorno ao backlog. A participação da origem **não** é removida:
ela já foi congelada com pontos/status/conclusão/corte e continua respondendo pelo RF35.
A associação atual muda para o destino, cujo membership é criado/reativado pelo plano canônico
e será capturado no próximo start. Cada transferência gera uma única entrada `SPRINT`,
origem → destino, com o ator da mutation. Snapshot, status, transferência, histórico e eventual
conclusão do Marco pertencem à mesma transação. Falha obrigatória reverte tudo, inclusive
`409 SPRINT_TASK_LIMIT_REACHED` se o destino ultrapassaria 100 Tasks. Fechamento repetido
continua recusado por `409 SPRINT_INVALID_TRANSITION`, sem duplicação.

Iniciar uma sprint com outra já `EM_ANDAMENTO` no projeto responde `409 SPRINT_ALREADY_ACTIVE`,
com o nome da sprint que bloqueia.

**Exclusão segura (PLANNING-QA-FIX-03).** DELETE exige a capability de gestão vigente
(MEMBER+), sessão, CSRF e acesso ao projeto dono. Persiste `deletedAt`/`deletedById` sem alterar
status. Tasks atualmente apontando para a Sprint, inclusive concluídas, vão ao backlog, cada
uma com uma entrada SPRINT origem → null e ator. Não conclui, cancela ou executa carry-over.
Participações abertas são marcadas como removidas; snapshots e participações terminais não
são alterados. Tudo ocorre na mesma transação, com locks Project → Sprint → Tasks.

A Sprint excluída sai de listagens, seletores, Schedule, sobreposição, slot ativo e destinos de
carry-over. GET/update/status/scope recebem `404 SPRINT_NOT_FOUND`. DELETE repetido recebe
`409 SPRINT_ALREADY_DELETED`, sem novos efeitos. O nome é liberado para criação/renomeação de outra Sprint no mesmo projeto, preservando
o nome original e o ID histórico (BR-SPRINT-021, adendo FIX-04). A unicidade considera somente
`deletedAt = null`; outra Sprint atual com o mesmo nome recebe `409 SPRINT_NAME_IN_USE`.
Exclusão lógica não renomeia registros. Reabertura continua ausente.

**Prévia de impacto.** `completion` contém `{pendingTasks, completedTasks, destination,
returnedToBacklog}`; `destination` é `{id,name}` ou null. `currentTasks` conta todos os ponteiros
atuais para a exclusão. A prévia usa o mesmo seletor de destino da conclusão. É informativa:
a mutation revalida sob lock; não garante que o planejamento não mude entre GET e confirmação.
Erro na prévia não autoriza a interface a inventar o destino. Autorização permanece backend.

### Marcos

| Método | Caminho | Entrada | Sucesso | Regras |
|---|---|---|---|---|
| POST | `/projects/:projectId/milestones` | `title`, `description?`, `dueDate` | `201` `{message, milestone}` | prazo livre; sem vínculo com sprint no corpo |
| GET | `/projects/:projectId/milestones` | `status?` | `200` `{total, milestones}` | |
| GET | `/milestones/:id` | — | `200` `{milestone}` | |
| PUT | `/milestones/:id` | subconjunto de `title`, `description`, `dueDate` | `200` `{message, milestone}` | editável enquanto o projeto existir |
| PATCH | `/milestones/:id/status` | `status` (`PENDENTE` ↔ `CONCLUIDO`) | `200` `{message, milestone}` | conclusão manual convive com a automática |
| DELETE | `/milestones/:id` | — | `200` `{message}` | exclusão lógica em qualquer estado; preserva Sprints e histórico, inclusive vínculos terminais |

**O corpo não aceita `sprintId`.** O objeto é estrito, então um cliente anterior à inversão
recebe `400` em vez de ter o vínculo descartado em silêncio.

**Marco não congela com a sprint** (ADR-011 D04). Com um marco atravessando várias sprints,
encerrar uma delas trancaria a edição de um marco que as outras ainda vão entregar. O que
continua congelado é a composição e o resultado da sprint encerrada.

**Conclusão automática** (ADR-011 D05): ao concluir uma sprint, o marco dela é concluído na
mesma transação quando existe ao menos uma sprint não cancelada apontando para ele e **todas** as
não canceladas estão `CONCLUIDA`. `CANCELADA` não bloqueia nem conclui sozinha. Não há coluna
distinguindo automático de manual: o fato é derivável do estado.

**Exclusão lógica do Marco.** Persiste `deletedAt`/`deletedById` sob lock do projeto e Marco.
Não apaga nem desvincula Sprints/Tasks. O Marco sai das consultas e seletores atuais; GET/update
respondem `404 MILESTONE_NOT_FOUND`; novo DELETE recebe `409 MILESTONE_ALREADY_DELETED`.
O DTO da Sprint mantém `milestoneId` e acrescenta `milestone: {id,title,deletedAt}` para exibir
“Marco X · Excluído”. Sprints abertas podem conservar o vínculo ao editar outros campos ou
explicitamente desvincular/trocar; terminais continuam protegidas. Um Marco excluído não recebe
conclusão automática. Sprints excluídas não participam dos cálculos atuais do Marco.

### Associação tarefa ↔ sprint

| Método | Caminho | Entrada | Sucesso | Regras |
|---|---|---|---|---|
| PATCH | `/tasks/:id/sprint` | `sprintId` | `200` `{message, task}` | mesmo `projectId`; sprint não terminal; idempotente; respeita o limite de 100 |
| DELETE | `/tasks/:id/sprint` | — | `200` `{message, task}` | idempotente; **bloqueado em sprint terminal** |

Os três caminhos de escrita — `PUT /sprints/:id/tasks`, `PATCH` e `DELETE` do lado da tarefa —
passam pelo **mesmo plano de escopo**, para que não divirjam no histórico. Toda inclusão,
remoção ou troca gera `TaskHistoryEntry` com `field: SPRINT` e o `AuditEvent` correspondente, na
mesma transação da escrita. A ação auditada continua distinguindo a operação pedida:
`SPRINT_TASKS_REPLACED`, `TASK_SPRINT_LINKED` ou `TASK_SPRINT_UNLINKED`.

**Convenção do histórico na troca de sprint.** Mover uma tarefa da sprint A para a B gera **uma
única** entrada `fromValue: "A"` → `toValue: "B"`, nunca uma saída seguida de uma entrada.

**Visibilidade decide o código de erro.** `TASK_SPRINT_PROJECT_MISMATCH` (400) só é devolvido
quando o ator **enxerga os dois projetos**. Quando o recurso do outro lado pertence a um projeto
que o ator não acessa, a resposta é `404` byte a byte idêntica à de um ID inexistente. Sem isso
o par 400/404 seria oráculo de enumeração.

**Concorrência.** Leitura, validação, cálculo do delta e escrita rodam na mesma transação, com a
linha travada. Duas substituições simultâneas produzem o payload de uma delas — nunca a união
das duas.

### Participação da tarefa na sprint

`GET /sprints/:id/tasks` é a autoridade de Tasks do recorte de Sprint, incluindo Kanban e
modal de tarefas. Uma única projeção de domínio escolhe os dados conforme o lifecycle:

- Aberta: participações ativas com campos Task atuais (`id,title,status,priority,deadline,
  estimatedEffort,responsibleUserId,sprintId`) e `isFrozen=false`.
- Terminal: todas as participações ativas no encerramento, independentemente de `Task.sprintId`
  ou existência posterior da Task. `status=exitStatus`, `estimatedEffort=pointsAtClose` e os demais
  campos vêm do snapshot versionado. `sprintId` identifica o recorte histórico neste DTO.
  `id` é o ID capturado; `participationId` identifica o registro; `currentTaskId` é ID ou null
  para a ação explícita “Abrir tarefa atual”. Essa disponibilidade operacional não é métrica histórica.
- Contexto preservado: `addedAt`, `addedAfterStart`, `carriedFromSprintId`, `exitStatus`.
- Envelope terminal: `isFrozen=true`, `snapshotAt`, `historicalSummary` e limitações. Cada card
  inclui `snapshotAt`, `snapshotAvailable`, `snapshotVersion` e `traceabilityCounts`.
- Snapshot completo v2 (novos encerramentos): `description`, `responsibleDisplayName`,
  `actualEffort`, `createdAt`, `requirement`, `pullRequest`, `commits` e `issues`, além dos campos
  anteriores `id,title,priority,responsibleUserId,deadline,status,estimatedEffort`.
  Requirement: `{id,title,status}` ou null. PR: `{id,number,title,state,githubUrl}` ou null.
  Commit: `{id,hash,message,authorName,date,githubUrl}`. Issue:
  `{id,number,title,state,labels,githubUrl}`. Arrays vazios indicam ausência de vínculos.
  Datas históricas são ISO UTC. O nome de exibição não inclui e-mail ou dados de perfil.
  URLs capturadas permitem ações externas; nenhum artefato atual é consultado para renderizar.
- V1 permanece parcial: `snapshotVersion=1`, sem os novos campos, e limitação
  `LEGACY_CLOSING_TASK_DETAILS_PARTIAL`. JSON ausente usa `snapshotVersion=null`.
  Comments não integram nenhuma versão. Snapshot v2 é capturado atomicamente antes do carry-over;
  falha de captura desfaz o encerramento. Não há backfill legado nem mudança de schema/DDL.

Snapshot detalhado legado ausente recebe `LEGACY_CLOSING_TASK_SNAPSHOT_UNAVAILABLE`;
campos desconhecidos são null e o título de apresentação declara a indisponibilidade. Status e
pontos conhecidos continuam utilizáveis. Status desconhecido não é posicionado arbitrariamente
em uma coluna. Nunca se busca Task atual para completar esses campos.

Kanban terminal é somente leitura, sem DnD ou edição; detalhes são “Detalhes no encerramento”.
Abertura de Task atual é ação separada e pode retornar 404 se excluída depois da consulta.
O histórico individual, quando a Task ainda existe, continua descrevendo sua linha do tempo completa.
Sprints congeladas são consultadas individualmente na UI; abertas mantêm seleção múltipla.

`GET /projects/:projectId/kanban` continua contendo somente Tasks atuais, sem duplicar histórico.
`sprints[].tasks` no Schedule continua operacional para eventos com deadline próprio e contexto
atual de `Task.sprintId`; métricas terminais usam `historicalSummary`. Não é fonte do card congelado.

### Máquina de estados da sprint

```text
PLANEJADA    -> EM_ANDAMENTO | CANCELADA
EM_ANDAMENTO -> CONCLUIDA    | CANCELADA
CONCLUIDA    -> (terminal)
CANCELADA    -> (terminal)
```

Ao entrar em `EM_ANDAMENTO` grava-se `startedAt`; ao entrar em `CONCLUIDA`, `completedAt`.
Entrar em estado terminal congela, na mesma transação, o status de cada participação ativa.

**`startedAt` é linha de base, não trava.** O escopo continua alterável depois do início; o que
muda é que as inclusões passam a ser sinalizadas. Quem congela é o estado terminal.

### Evolução por sprint (RF35)

`GET /sprints/:id/progress` → `200`. Leitura; exige `VIEWER` no projeto da sprint.

```json
{
  "sprintId": 4, "projectId": 2, "status": "CONCLUIDA",
  "frozen": true, "historicalLimitations": [],
  "cutoff": "2026-08-14T18:00:00.000Z",
  "baseline": { "kind": "STARTED_AT", "at": "2026-08-01T12:00:00.000Z" },
  "planned": { "numerator": 5, "denominator": 8, "percentage": 62.5, "hasData": true },
  "current": { "numerator": 6, "denominator": 9, "percentage": 66.67, "hasData": true },
  "scopeChange": {
    "added":   [{ "taskId": 12, "at": "...", "fromSprintId": 3 }],
    "removed": [{ "taskId": 7, "at": "...", "toSprintId": null,
                  "reason": "REMOVIDA", "exitStatus": "A_FAZER" }]
  },
  "carryOver": [{ "taskId": 9, "toSprintId": 5, "exitStatus": "EM_ANDAMENTO", "at": "..." }],
  "burndown": {
    "hasData": true, "totalPoints": 8, "frozen": true, "cutoffDate": "2026-08-12",
    "days": [
      { "date": "2026-08-10", "ideal": 8,   "remaining": 8 },
      { "date": "2026-08-11", "ideal": 5.3, "remaining": 5 },
      { "date": "2026-08-12", "ideal": 2.7, "remaining": null }
    ]
  }
}
```

**Bloco `burndown`.** Série diária sobre a janela `[startDate, endDate)`, em dias de calendário
UTC. `ideal` é a reta do planejamento — do total no primeiro dia a zero no último — e não reage
ao que aconteceu. `remaining` são os pontos que ainda faltavam ao **fim** daquele dia, e é
`null` nos dias posteriores ao corte: zero diria "nada restante" onde o certo é "esse dia ainda
não chegou".

Enquanto aberta, o denominador soma `estimatedEffort` das participações não removidas. Depois
do encerramento usa exclusivamente `SprintTask.pointsAtClose`; tarefa sem estimativa não pesa. Sem pontos ou com janela de menos de dois dias, `hasData` é `false` e `days` vem vazio.
A série tem teto de **180 dias**: uma janela maior é truncada em silêncio no 180º ponto — teto de
segurança para payload e tela, não uma regra de domínio (limite documentado pela bateria RF10/RF35
de 25/08/2026, que congelou o comportamento em teste; ASVS 2.1.3).

Enquanto aberta, o instante em que cada tarefa deixou de pesar vem da primeira `TaskHistoryEntry` de
`field: STATUS` para `CONCLUIDO`, **interseccionada com o intervalo da participação** — uma
conclusão ocorrida enquanto a tarefa estava em outra sprint não queima escopo desta. Tarefa que
entra já concluída queima na entrada, e não no início da sprint. No encerramento, esse instante
é persistido em `completedAtClose`, junto com pontos/status; a série terminal independe de
editar ou excluir a Task e seu histórico. Os pontos do planejamento ficam separados em
`pointsAtPlanning`, capturados apenas para membership presente no start.

Vem embutido no `progress`, e não em endpoint próprio: o painel do Kanban exibe os dois juntos.

**Ficha da métrica** (seção 10.5 do documento de arquitetura):

| Item | Definição |
|---|---|
| Objetivo | acompanhar o avanço da sprint e tornar visível a mudança de escopo após o planejamento |
| Fórmula | `buildMetric(concluídas, total)` — a **mesma** de `traceability.calculator.js`. Concluída é `status === 'CONCLUIDO'`; percentual com duas casas |
| Dados de origem | `SprintTask` (participação, `plannedAtStart`, snapshots de pontos/status/conclusão), `Sprint.planningSnapshotAt` e `closedAt`; estado da Task somente enquanto operacional |
| Status que vale | `exitStatus ?? status atual` enquanto aberta; terminal utiliza somente o status persistido e sinaliza ausência legada |
| Linha de base | `Sprint.startedAt`. Sem ele (`PLANEJADA`), a base é `OPEN`: o planejamento não fechou, `planned == current` e `scopeChange` é vazio |
| Escopo planejado | `plannedAtStart: true`, capturado das participações ativas na transação de start; inclui remoções posteriores, exclui remoções anteriores e reentradas não planejadas |
| Mudança de escopo | saldo líquido. Quem entrou depois do início e já saiu não aparece em nenhuma das duas listas |
| `carryOver` | participações cuja tarefa continuou em outra sprint, com o status observado **aqui** |
| Instante de corte | `cutoff`. Em sprint aberta é o momento da consulta; em sprint encerrada é o encerramento, porque o resultado não depende de quando se perguntou |
| Interpretação | mede progresso do trabalho, **não** de pessoas. Não há recorte por responsável |
| Limitações | corte no passado não é suportado (`at` → `400`); `historicalLimitations` identifica snapshots legados ausentes; não se reconstrói esforço/status terminal a partir da Task atual |
| Atualização | calculado sob demanda; sem cache |

`percentage` é `null` — nunca `0` — quando `denominator` é zero: "nada concluído" e "não há o
que medir" são estados diferentes, e `hasData` distingue os dois.

**Imutabilidade.** Concluir a tarefa depois do encerramento, movê-la para a sprint seguinte ou
excluí-la **não altera** nenhum número de uma sprint encerrada.

**Snapshots e legado.** `Sprint.planningSnapshotAt` e `Sprint.closedAt` são campos aditivos
nos DTOs de Sprint. O corte terminal usa `closedAt`, inclusive em cancelamento sem Tasks.
`historicalLimitations` é uma lista aditiva no progress: vazia quando os snapshots são completos;
pode conter `LEGACY_PLANNING_SNAPSHOT_UNAVAILABLE`, `LEGACY_CLOSING_POINTS_UNAVAILABLE` e
`LEGACY_CLOSING_STATUS_UNAVAILABLE` e `LEGACY_CLOSING_CUTOFF_UNAVAILABLE`. Sem pontos históricos, burndown retorna `hasData=false` e
série vazia, sem estimativa retroativa. A estratégia nullable, a aproximação limitada do baseline
legado e os índices estão no [modelo histórico de Planning](../data/PLANNING_HISTORY.md).

Consulta não gera `AuditEvent`: leitura de indicador não é exportação (seção 13.9).

### Projeção histórica para apresentação

`GET /sprints/:id`, `GET /projects/:projectId/sprints`, `sprints[]` do cronograma e
`GET /sprints/:id/progress` incluem `historicalSummary` de forma aditiva. É `null` para
Sprints abertas. Para `CONCLUIDA`/`CANCELADA`, vem exclusivamente de `SprintTask` e dos
cortes persistidos, incluindo participações cuja Task foi excluída:

```json
{
  "totalTasks": 3, "completedTasks": 1,
  "totalPoints": 21, "completedPoints": 3, "percentage": 14,
  "plannedTasks": 2, "plannedPoints": 8,
  "cutoff": "2026-09-04T23:54:13.631Z",
  "historicalLimitations": []
}
```

`percentage` preserva a fórmula visual de progresso por pontos: arredondamento inteiro de
`completedPoints / totalPoints * 100`; sem pontos é `null`. Os blocos `planned`/`current`
do RF35 continuam contando Tasks e arredondando a duas casas; são métricas distintas.
`plannedPoints` usa `pointsAtPlanning`; `totalPoints`/`completedPoints` usam `pointsAtClose`
e `exitStatus`. A listagem lê participações em lote, sem uma consulta `/progress` por Sprint.

Campo histórico desconhecido é `null`, acompanhado pelos códigos de `historicalLimitations`
já documentados. Nenhum campo usa Task atual como fallback. A UI mostra `—` e a limitação;
um agregado de pontos contendo uma Sprint sem pontos históricos também fica indisponível.
Sprint aberta continua operacional. Nenhum schema, migration ou backfill é introduzido pela FIX-02.

### Cronograma

`GET /projects/:projectId/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD` → `200` com `projectId`,
`range`, `generatedAt` (ISO-8601 UTC), `sprints[]`, `milestones[]` e `unassignedTasks[]`.

**Semântica do filtro:** sem `from`/`to` retorna tudo do projeto. A janela continua sendo **dia
de calendário, interpretado em UTC**: `from` é o início do dia pedido e `to` é convertido para o
início do dia seguinte, exclusivo, de modo que "até 14/08" inclua o dia 14 inteiro. `from <= to`
é obrigatório, e `range` devolve o que foi pedido (`to` inclusivo).

Incluem-se sprints cuja janela intersecta o período; marcos com `dueDate` dentro dele; e, em
`unassignedTasks`, tarefas sem sprint com `deadline` na janela — tarefas sem sprint e sem
`deadline` só aparecem quando não há filtro.

**Campos derivados:** `durationInDays`, `deadlineOutsideWindow`, `overdue`, `taskCount`,
`generatedAt`.

`sprints[]` expõe `milestoneId`; `milestones[]` **não** expõe mais `sprintId`. O agrupamento é
lido do lado da sprint (ADR-011 D01). O DTO de tarefa do agregado passou a incluir
`estimatedEffort` e o `sprintId` atual da Task. Painéis usam valores live para Sprints abertas
e `historicalSummary` para terminais, sem baixar a lista completa de tarefas. A identificação
da Sprint atual usa `task.sprintId` e o índice de Sprints por ID, nunca o agrupamento histórico;
`null` significa backlog. Dedupe continua sendo por Task ID, e deadline permanece próprio.

`durationInDays` conta os dias abrangidos pela janela semiaberta, arredondando para cima: de
01/08 00:00 a 14/08 00:00 são **13 dias**, porque o dia 14 pertence à sprint seguinte.

**Limitação de fuso aceita.** A janela é interpretada em UTC. Para UTC−3, "até 14/08" recorta em
`15/08T00:00Z`, ou seja `14/08 21:00` em Brasília.

O DTO de tarefa é minimizado: nunca e-mail nem descrição.

### Códigos de erro

| Código | Status | Quando |
|---|---|---|
| `SPRINT_NOT_FOUND` | 404 | sprint inexistente **ou** de projeto que o ator não enxerga |
| `MILESTONE_NOT_FOUND` | 404 | idem, para marco |
| `SPRINT_NAME_IN_USE` | 409 | nome repetido em Sprint atual do projeto |
| `SPRINT_OVERLAP` | 409 | janela cruza outra sprint do projeto |
| `SPRINT_ALREADY_ACTIVE` | 409 | já existe outra sprint `EM_ANDAMENTO` no projeto |
| `SPRINT_INVALID_TRANSITION` | 409 | transição de status não permitida |
| `SPRINT_LOCKED` | 409 | edição de sprint encerrada |
| `SPRINT_SCOPE_LOCKED` | 409 | alteração de escopo de sprint encerrada, em qualquer direção |
| `SPRINT_TASK_LIMIT_REACHED` | 409 | conjunto resultante acima de 100 tarefas |
| `SPRINT_ALREADY_DELETED` | 409 | exclusão lógica repetida de Sprint |
| `SPRINT_DATE_RANGE_INVALID` | 400 | `startDate >= endDate`, ou `from > to` no filtro |
| `MILESTONE_ALREADY_DELETED` | 409 | exclusão lógica repetida de Marco |
| `SPRINT_MILESTONE_PROJECT_MISMATCH` | 400 | marco de outro projeto, visível ao ator |
| `TASK_SPRINT_PROJECT_MISMATCH` | 400 | tarefa de outro projeto, visível ao ator |

**Aposentados nesta revisão (ADR-011):** `MILESTONE_SPRINT_REQUIRED`,
`MILESTONE_SPRINT_PROJECT_MISMATCH`, `MILESTONE_DUE_DATE_OUTSIDE_SPRINT`,
`MILESTONE_SPRINT_CHANGED` e `SPRINT_WINDOW_MILESTONE_CONFLICT` — todos falavam da "sprint do
marco", que deixou de existir.

**Aposentados pela FIX-03:** `SPRINT_DELETE_NOT_SUPPORTED`, `SPRINT_MILESTONE_REQUIRED` e
`MILESTONE_HAS_SPRINTS`, por decisão explícita de lifecycle.

**Aposentados na revisão anterior:** `SPRINT_HAS_TASKS` (exclusão física não existe) e
`SPRINT_ASSOCIATION_BLOCKED` (substituído por `SPRINT_SCOPE_LOCKED`, que cobre as duas direções).

### 404 de recurso endereçado por ID

Para `/projects/:id`, `/requirements/:id`, `/tasks/:id`, `/sprints/:id` e `/milestones/:id`, a
resposta de **"não existe"** e a de **"existe, mas em projeto que você não acessa"** são
idênticas em status, código e mensagem — só `requestId` difere. Antes elas divergiam, e o par
permitia iterar o ID para descobrir o que existe fora do alcance do ator.

A exposição de `code` segue o contrato de cada recurso: sprint e marco expõem; projeto,
requisito e tarefa devolvem apenas `{ message }`. O que a garantia exige é que os dois caminhos
do **mesmo recurso** respondam igual.

### Mudança de contrato em tarefas

`Task.sprintId` aparece no payload de todos os endpoints de tarefa. É o ponteiro da participação
ativa; o histórico completo vive em `SprintTask` e é exposto por `/sprints/:id/tasks` e
`/sprints/:id/progress`.


## Limites e erros

- Strings persistidas em campos Prisma `String` sem `@db.Text`: até 191 caracteres.
- URLs persistidas: até 191 caracteres.
- Busca: até 255 caracteres.
- Código de acesso recebido: até 80 caracteres; formato atual `TRC-` mais 32 hexadecimais.
- IDs: inteiros positivos.
- Datas: datas civis reais, sem correção automática.
- Campos desconhecidos em bodies/query validados: `400 VALIDATION_ERROR`.
- Erros de recurso e conflito permanecem `404` e `409` com mensagens atuais.
- Erros inesperados permanecem seguros e carregam `INTERNAL_ERROR` e request ID.
