# Catálogo atual de contratos HTTP do TRACEFLOW

## L5.1 — ingresso por código e convites pessoais

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

## L2 — conta, segurança, privacidade e integrações

Todos os contratos abaixo exigem sessão e CSRF nas mutations, exceto as duas confirmações públicas. `requireAccountState` limita `DEACTIVATED` à conta/reativação e `DELETION_PENDING` ao status, cancelamento, exportação e reautenticação GitHub necessária para cancelar uma exclusão em conta GitHub-only; `ANONYMIZED` não autentica.

| Método          | Caminho                                                         | Regra principal                                   |
| --------------- | --------------------------------------------------------------- | ------------------------------------------------- |
| GET             | `/settings/account`                                             | conta própria e estado                            |
| PATCH           | `/settings/account/profile`                                     | altera somente nome; conta ativa                  |
| PATCH           | `/settings/account/username`                                    | política L1 e cooldown de 30 dias                 |
| POST/DELETE     | `/settings/account/email-change`                                | senha ou reautenticação GitHub; token hashado      |
| GET             | `/settings/account/email-change/status`                         | solicitação própria pendente                      |
| GET             | `/settings/account/email-change/confirm`                        | público; token único; revoga todas as sessões     |
| POST            | `/settings/security/password`                                   | preserva sessão atual e revoga demais             |
| GET/DELETE      | `/settings/security/sessions[/:sessionId]`                      | UUID público e sessão própria                     |
| POST            | `/settings/security/sessions/revoke-others`                     | preserva sessão atual                             |
| POST            | `/settings/account/deactivate`                                  | autenticação recente, confirmação e último OWNER  |
| POST            | `/account/reactivation/start`                                  | sessão restrita desativada                        |
| GET             | `/account/reactivation/confirm`                                | público; token único                              |
| GET/POST/DELETE | `/settings/privacy/deletion`                                    | 30 dias e autenticação recente para pedir/cancelar |
| POST            | `/settings/privacy/export`                                      | ZIP/JSON; `ACTIVE` ou `DELETION_PENDING`          |
| GET             | `/settings/integrations/github`                                 | vínculos da conta com Installations/repos/projetos |
| DELETE          | `/settings/integrations/github/authorizations/:authorizationId` | autenticação recente; desconecta o vínculo da conta  |
| POST            | `/auth/github/reauth/start`                                     | GitHub-only; state, sessão e retorno interno       |

A autenticação recente de uma conta com senha é a confirmação da senha local. Para conta GitHub-only (`passwordHash=null`), o backend exige identidade vinculada e OAuth GitHub recente na mesma sessão; o token de usuário permanece somente em memória. O callback aceita `ACTIVE` e `DELETION_PENDING` apenas nesse purpose, valida state/sessão/GitHub ID e atualiza os timestamps da sessão e da identidade.

A exportação retorna `application/zip` com manifesto 2.0 e não persiste o arquivo. Conteúdo de projetos, requisitos, tarefas atribuídas e integrações entra somente para memberships atualmente ativas. Membership histórica/inativa não autoriza exportar conteúdo atual. Dados próprios incluem perfil, identidade GitHub, sessões sanitizadas, solicitações, histórico de e-mail sem token, metadata de exportações e auditoria permitida. IDs de sessão internos, senhas, cookies, tokens, hashes e secrets não integram DTOs. Instalações GitHub suspensas/removidas não acionam listagem externa.

Ao vencer a carência, o processor faz claim e revalida ownership dentro da transação. Sem impedimento, anonimiza. Se o titular ainda for o único OWNER de projeto não excluído, encerra a solicitação como `REJECTED`, registra `SOLE_PROJECT_OWNER`, retorna a conta para `ACTIVE`, revoga sessões e preserva projeto/membership; uma nova solicitação será necessária após a regularização.

## L1 — identidade, verificação e GitHub App

`POST /auth/register` recebe `{name,username,email,password}` e cria conta/sessão mesmo quando a entrega SMTP falha; `emailVerification.status` informa `accepted`, `temporary_failure` ou `permanent_failure`. `POST /auth/login` recebe `{identifier,password,rememberMe}` e aceita username/e-mail sem enumerar contas. `PATCH /auth/username` substitui o identificador técnico de usuário migrado. `POST /auth/email-verification/resend` exige sessão+CSRF; `POST /auth/email-verification/verify` é público e consome token único.

Callbacks OAuth GitHub bem-sucedidos preservam os parâmetros específicos do fluxo, como `githubIdentity=success` e `githubReauth=success`. Falhas usam o contrato comum `github=error&reason=<codigo-seguro>`; Login e Settings traduzem reasons conhecidos e aplicam mensagem genérica a valores desconhecidos, sem exibir o valor bruto.

GitHub App: `POST /github/app/installations/start`, `GET /github-app/callback`, `GET /github/app/installations`, `GET /github/app/installations/:installationId/repositories`, `PUT /projects/:projectId/github/integration` e `POST /webhooks/github-app`. Start/list/connect exigem sessão; start/connect e sync exigem e-mail verificado. O callback é público e valida state de uso único, conta `ACTIVE`, sessão original, intenção e projeto. Ele não exige `GitHubIdentity`.

Com **Request user authorization (OAuth) during installation** habilitado na App, o callback troca o `code` por user access token efêmero e pagina `GET /user/installations` somente para provar que `installation_id` está acessível ao ator que concluiu a instalação. Depois confirma a Installation com JWT da App e faz uma única consulta mínima (`per_page=1`) com Installation Access Token para validar acesso técnico; zero repositórios é uma resposta válida. A descoberta completa e sua paginação continuam nos endpoints próprios. O token de usuário não é comparado com `GitHubIdentity`, usado no sync, persistido, registrado ou retornado. O callback da App e `/auth/github/callback` usam states, cookies e responsabilidades separados.

`GET /github/app/installations/:installationId/repositories` e `GET /github/app/repositories` retornam `{repositories}`. A lista corresponde ao escopo vivo concedido à Installation e cada DTO minimizado inclui `availability`, `alreadyConnected`, `connectedToCurrentProject` e `selectable`, nunca token/secret. Repositório ocupado por outro projeto é listado, mas não selecionável. `POST /projects/from-github` aceita `{githubInstallationId,githubRepositoryId,name?,description?,responsibleTeam?}`; criação e conexão revalidam Installation `ACTIVE` e acesso atual ao repositório. Metadados enviados pelo navegador não são autoridade. Com `projectId`, somente a repo já vinculada pode ser reconectada; tentar outra recebe `409 GITHUB_REPOSITORY_SWAP_FORBIDDEN`. Uma instalação pode servir N projetos, mas `projectId` e `githubRepositoryId` são exclusivos em `ProjectGitHubIntegration`.

Installation lifecycle: `PENDING` aguarda autorização concluída, `ACTIVE` permite seleção/sync/webhook, `SUSPENDED` e `REMOVED` bloqueiam operações novas sem apagar projetos ou artifacts. Callback não reativa estados bloqueados. Delivery webhook assinado é processado uma vez; duplicata `PROCESSING/PROCESSED` retorna sucesso idempotente e `FAILED`/stale pode ser reivindicado novamente. Falhas guardam somente etapa, código seguro e timestamps.

Falhas GitHub `403` com quota remanescente representam autorização; `403` com quota zero ou `Retry-After`, e `429`, representam rate limit. Retry é limitado por `GITHUB_RETRY_MAX`, respeita `Retry-After`/`X-RateLimit-Reset`, aplica fallback exponencial e obedece `GITHUB_RETRY_MAX_DELAY_MS` e timeout.

Os contratos sistêmicos `GET /github/auth/check` e `GET /github/repositories` foram removidos. Não há fallback para PAT ou configuração `GITHUB_TOKEN`.

## Evidência e rastreabilidade

Os caminhos abaixo são relativos ao prefixo `/api`, exceto os endpoints de health. Autenticação e autorização por papel estão consolidadas em `docs/security/AUTHORIZATION_MATRIX.md`; a relação entre requisito funcional, fluxo, endpoint, service, persistência, frontend e testes está em `docs/traceability/RF_TECHNICAL_MATRIX.md`. A auditoria E15 reconciliou este catálogo com os arquivos `*.routes.js`: o único contrato ativo deliberadamente não implementado é `DELETE /api/projects/:id`, que permanece `501`.

## Atualização E10 — requisitos e rastreabilidade canônica

`Task.requirementId`, `Task.pullRequestId`, `TaskCommit` e `TaskIssue` são as únicas fontes dos vínculos. A matriz passou a ser paginada sem carregar conteúdo integral de artefatos e mantém um summary global independente da página. As perspectivas de requisito, tarefa e artefato usam o mesmo DTO `{projectId,perspective,summary,nodes,edges,pagination}`; IDs de node são namespaced e as arestas usam `REQUIREMENT_TASK`, `TASK_COMMIT`, `TASK_PULL_REQUEST` ou `TASK_ISSUE`.

Os cinco placeholders baseados em `TraceLink`/`GithubArtifact` foram removidos e seguem o `404` global. O único `501` restante é `DELETE /projects/:id`. O fechamento definitivo do RF41 adotou exclusivamente `[TASK-<ID>]`, persiste sugestões revisáveis e só cria `TaskCommit` após confirmação humana.

## Atualização E9 — Projetos e sincronização GitHub

O cadastro integrado usa a operação especializada `POST /projects/from-github` e revalida o repositório externo. A sincronização assíncrona cria ou reutiliza uma execução persistida com `POST /projects/:projectId/github/sync`, responde `202 {message,run}` e expõe progresso/resultado em `GET /projects/:projectId/github/sync/status`. A execução pagina commits, pull requests e issues, deduplica/upserta por identificadores externos dentro do projeto e só marca `SUCCEEDED` após todas as coleções. Falha parcial preserva lotes já confirmados, o último sucesso e os vínculos técnicos.

O alias legado redundante `GET /projects/:projectId/github/artifacts` foi removido após confirmação de ausência de consumidores; ele agora segue o `404 ROUTE_NOT_FOUND`. A rota canônica RF06 permanece `GET /projects/:projectId/artifacts`.

## Atualização E8 — persistência canônica sem ruptura HTTP

A cardinalidade funcional confirmada é Task 0..1 PullRequest e PullRequest 0..N Tasks. `Task.pullRequestId` é a única fonte canônica; o join experimental N:N, o dual-write e o fallback foram removidos. Os endpoints continuam singulares e preservam paths, status, mensagens e payloads. Na E8, nenhum dos sete placeholders 501 então existentes foi implementado.

## Atualização E6 — identidade e privacidade dos endpoints

Health permanece público. Também são públicos `POST /api/auth/register`, `login`, `forgot-password` e `reset-password`. As demais rotas `/api` exigem cookie de sessão; mutations exigem `X-CSRF-Token`. `GET /api/auth/me` restaura a identidade, `GET /api/auth/csrf` devolve o token estável derivado da sessão, `POST /api/auth/logout` revoga a sessão e `POST /api/auth/change-password` revoga todas as sessões.

Convites canônicos: `GET|POST /api/projects/:projectId/invitations`, `DELETE /api/projects/:projectId/invitations/:invitationId`, respostas por token e a perspectiva pessoal L5.1. O join por `accessCode` é autenticado e cria `ProjectMembership` usando exclusivamente identidade da sessão e papel persistido. Papéis: OWNER, MANAGER, MEMBER e VIEWER. Ausência de membership pode retornar 404; papel insuficiente, 403. Placeholders retornam 401 sem sessão e preservam 501 autenticados.

Na conclusão da E6, `GET /api/projects/:projectId/members` passou a representar a fonte canônica `ProjectMembership` e retorna `{projectId,currentMembership,members}`. OWNER recebe e-mail completo; demais papéis recebem valor mascarado. Administração canônica: `PATCH|DELETE /api/projects/:projectId/members/:membershipId`, `POST .../reactivate`, `DELETE .../members/me` e `POST /api/projects/:projectId/ownership/transfer`. Desativação/saída é lógica; o último OWNER recebe `409 LAST_PROJECT_OWNER`.

Convite duplicado ativo é bloqueado com `INVITATION_ALREADY_PENDING`, inclusive sob concorrência, e o convite original permanece válido. Em produção, criação retorna `{invitation,emailDelivery}` e o token segue exclusivamente pelo adapter de e-mail; o campo `token` existe apenas em testes controlados. A resposta informa se a entrega foi aceita ou falhou de forma sanitizada. Forgot-password continua uniforme e nunca retorna token fora de testes.

Erros seguem `{message,code,requestId}`. O fluxo de convite distingue `INVITATION_INVALID`, `INVITATION_EXPIRED`, `INVITATION_REVOKED`, `INVITATION_ALREADY_USED`, `INVITATION_DECLINED`, `INVITATION_ALREADY_PENDING` e `PROJECT_MEMBER_ALREADY_EXISTS`; incompatibilidade entre destinatário e sessão continua genérica. Respostas de recuperação são uniformes. O cookie nunca é exposto a JavaScript e CORS usa credenciais somente para a allowlist.

## Escopo e convenções

As seções abaixo preservam os contratos funcionais documentados na conclusão da E4, agora sujeitos à autenticação/autorização descrita na atualização E6. Este catálogo não é uma especificação OpenAPI definitiva.

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

Na E5, respostas de sucesso permaneceram iguais. A API exige JSON para bodies, aplica limite padrão de 100kb, CORS por allowlist e rate limiting. Novos erros de infraestrutura usam o formato seguro `{message,code,requestId}`: origem proibida `403 CORS_ORIGIN_DENIED`, JSON malformado `400 MALFORMED_JSON`, payload excessivo `413 PAYLOAD_TOO_LARGE`, content type incompatível `415 UNSUPPORTED_MEDIA_TYPE` e limite excedido `429 RATE_LIMITED`. Respostas `/api` incluem `Cache-Control: no-store`. O 429 inclui os headers `RateLimit` e `Retry-After` e o corpo `{message,code,requestId,retryAfterSeconds,scope}`; `scope` identifica apenas a categoria pública da quota, sem expor sua chave, usuário ou IP.

## Infraestrutura

| Método   | Caminho           | Entrada | Sucesso                             | Erros principais               |
| -------- | ----------------- | ------- | ----------------------------------- | ------------------------------ |
| GET      | `/health`         | Nenhuma | `200`, `{status,message}` histórico | `500` inesperado               |
| GET      | `/health/live`    | Nenhuma | `200`, `{status:"ok"}`              | `500` inesperado               |
| GET      | `/health/ready`   | Nenhuma | `200`, `{status:"ready"}`           | `503` dependência indisponível |
| qualquer | rota desconhecida | —       | —                                   | `404`, `ROUTE_NOT_FOUND`       |

## Projects e memberships

| Método   | Caminho                                                 | Params/query         | Body aceito                                                                                                                | Sucesso                                                                               |
| -------- | ------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| POST     | `/projects`                                             | —                    | `name`, `responsibleTeam`; opcionais `description`, `status`                                                               | `201`, `{message,project}`                                                            |
| POST     | `/projects/from-github`                                 | —                    | `githubInstallationId`, `githubRepositoryId`; opcionais `name`, `description`, `responsibleTeam`                           | `201`, `{message,project}`                                                            |
| GET      | `/projects`                                             | —                    | —                                                                                                                          | `200`, `{projects}`                                                                   |
| GET      | `/projects/:id`                                         | `id` positivo        | —                                                                                                                          | `200`, `{project}`                                                                    |
| PUT      | `/projects/:id`                                         | `id` positivo        | subconjunto de `name`, `description`, `responsibleTeam` e `status`                                                         | `200`, `{message,project}`                                                            |
| DELETE   | `/projects/:id`                                         | baseline placeholder | —                                                                                                                          | `501` inalterado                                                                      |
| GET      | `/projects/join/details`                                | query `accessCode`   | —                                                                                                                          | `200`, `{details:{project,role}}`                                                     |
| POST     | `/projects/join`                                        | —                    | somente `accessCode`                                                                                                       | `201`, `{message,project,membership}`                                                 |
| GET      | `/projects/:projectId/access-code`                      | `projectId` positivo | —                                                                                                                          | OWNER: `{accessCode:{accessCode,role,inviteLink}}`                                    |
| PATCH    | `/projects/:projectId/access-code`                      | `projectId` positivo | `role`: MEMBER ou VIEWER                                                                                                   | `200`, configuração atualizada                                                        |
| POST     | `/projects/:projectId/access-code/regenerate`           | `projectId` positivo | body vazio                                                                                                                 | `200`, novo código; anterior inválido                                                 |
| GET      | `/projects/:projectId/members`                          | `projectId` positivo | —                                                                                                                          | `200`, `{projectId,currentMembership,members}`                                        |
| PATCH    | `/projects/:projectId/members/:membershipId`            | IDs positivos        | `role`: OWNER/MANAGER/MEMBER/VIEWER                                                                                        | `200`, `{message,membership}`                                                         |
| DELETE   | `/projects/:projectId/members/:membershipId`            | IDs positivos        | —                                                                                                                          | `204`, desativação lógica                                                             |
| POST     | `/projects/:projectId/members/:membershipId/reactivate` | IDs positivos        | body vazio                                                                                                                 | `200`, `{message,membership}`                                                         |
| DELETE   | `/projects/:projectId/members/me`                       | `projectId` positivo | —                                                                                                                          | `204`, saída própria lógica                                                           |
| POST     | `/projects/:projectId/ownership/transfer`               | `projectId` positivo | `membershipId` positivo                                                                                                    | `200`, `{message,membership}`                                                         |
| GET/POST | `/projects/:projectId/invitations`                      | `projectId` positivo | POST: `email`, `role`                                                                                                      | `200` lista / `201` criação                                                           |
| DELETE   | `/projects/:projectId/invitations/:invitationId`        | IDs positivos        | —                                                                                                                          | `204`                                                                                 |
| POST     | `/projects/invitations/details`                         | —                    | token opaco                                                                                                                | `200`, `{invitation:{project,role,expiresAt,status}}` para o destinatário autenticado |
| POST     | `/projects/invitations/accept`                          | —                    | token opaco                                                                                                                | `200`, `{message,membership}`                                                         |
| POST     | `/projects/invitations/decline`                         | —                    | token opaco                                                                                                                | `200`, `{message}`; nenhuma membership é criada                                       |
| GET      | `/projects/invitations/mine`                            | —                    | —                                                                                                                          | `200`, convites pendentes do e-mail da sessão                                         |
| POST     | `/projects/invitations/:invitationId/accept`            | ID positivo          | body vazio                                                                                                                 | `200`, `{message,membership}`                                                         |
| POST     | `/projects/invitations/:invitationId/decline`           | ID positivo          | body vazio                                                                                                                 | `200`, `{message}`                                                                    |
| PATCH    | `/projects/:projectId/github/sync-settings`             | `projectId` positivo | boolean `githubAutoSyncEnabled`                                                                                            | `200`, `{message,project}`                                                            |

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

Priority: `BAIXA`, `MEDIA`, `ALTA`, `CRITICA`. Status: `A_FAZER`, `EM_ANDAMENTO`, `CONCLUIDO`. Efforts são inteiros não negativos. `responsibleUserId` deve identificar usuário com membership ativa no projeto; respostas expõem apenas `{id,name}` em `responsibleUser`. `Task.responsible` e `TaskMovement.movedBy` permanecem somente como snapshots históricos de leitura; `projectMemberId` foi removido. O histórico funcional usa `STATUS`, `DEADLINE`, `RESPONSIBLE` e `PRIORITY`; mudanças sem efeito não geram entrada.

## GitHub e Artifacts

| Método | Caminho                                                  | Entrada                                        | Sucesso                                                               |
| ------ | -------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------- |
| POST   | `/github/app/installations/start`                        | `intendedAction`; `projectId?`                 | `200`, `{url,expiresInMs}` para autorização da GitHub App             |
| GET    | `/github/app/installations`                              | sessão                                         | `200`, `{installations}` autorizadas ao usuário                       |
| GET    | `/github/app/repositories`                               | `projectId?`                                   | `200`, `{repositories}` da Installation                               |
| GET    | `/github/app/installations/:installationId/repositories` | instalação autorizada; `projectId?`            | `200`, `{repositories}` da Installation                               |
| PUT    | `/projects/:projectId/github/integration`                | instalação e repositório comprovados           | `200`; troca de repositório recebe `409`                            |
| POST   | `/projects/:projectId/github/sync`                       | `projectId` positivo; body vazio               | `202`, `{message,run}`; execução persistida iniciada ou já ativa      |
| GET    | `/projects/:projectId/github/sync/status`                | `projectId` positivo                           | `200`, `{run}` com status, progresso, summary e erro sanitizado       |
| GET    | `/projects/:projectId/commits`                           | `projectId`, `search?`                         | `200`, `{commits}`                                                    |
| GET    | `/projects/:projectId/pull-requests`                     | `projectId`, `search?`                         | `200`, `{pullRequests}`                                               |
| GET    | `/projects/:projectId/issues`                            | `projectId`, `search?`                         | `200`, `{issues}`                                                     |
| GET    | `/projects/:projectId/artifacts`                         | `projectId`; `type?`, `startDate?`, `endDate?` | `200`, projeto, filtros, resumo e artefatos                           |

Tipos de artifacts: `commit`, `pull_request`, `issue`. A paginação E9 ocorre somente na leitura externa do GitHub; os contratos públicos de listagem permanecem inalterados.

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

## Conta, privacidade e auditoria após LR.4

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
