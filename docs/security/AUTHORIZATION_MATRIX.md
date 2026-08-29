# Matriz de autorização da API TRACEFLOW

A matriz descreve a política efetiva vigente e não substitui os testes. `L` = leitura, `E` = escrita
de domínio, `A` = administração. Sem membership ativa, recursos de projeto retornam `404` para
reduzir enumeração; papel insuficiente retorna `403`. Mutations autenticadas exigem CSRF.

| Endpoints                                                                                                      | Anônimo | VIEWER | MEMBER | MANAGER | OWNER | Regra adicional                                                           |
| -------------------------------------------------------------------------------------------------------------- | ------: | -----: | -----: | ------: | ----: | ------------------------------------------------------------------------- |
| `GET /health`, `/health/live`, `/health/ready`                                                                 |       L |      L |      L |       L |     L | públicos                                                                  |
| `POST /api/auth/register`, `login`, `forgot-password`, `reset-password`, `email-verification/verify`           |       E |      E |      E |       E |     E | públicos, limiter sensível                                                |
| `GET /api/settings/account/email-change/confirm`, `/api/account/reactivation/confirm`                          |       E |      E |      E |       E |     E | públicos; token hashado, expirável e de uso único                         |
| `GET /api/auth/me`, `csrf`; `POST logout`, `change-password`, `email-verification/resend`; `PATCH username`    |     401 |      E |      E |       E |     E | própria sessão; mutations exigem CSRF                                     |
| `POST /api/projects` e `/projects/from-github`                                                                 |     401 |      E |      E |       E |     E | e-mail verificado; criador vira OWNER                                     |
| `GET /api/projects`                                                                                            |     401 |      L |      L |       L |     L | lista somente memberships ativas                                          |
| `GET /api/projects/:id`                                                                                        |     401 |      L |      L |       L |     L | membership no projeto                                                     |
| `PUT /api/projects/:id`                                                                                        |     401 |    403 |    403 |     403 |     A | configuração do projeto                                                   |
| `DELETE /api/projects/:id`                                                                                     |     401 |    501 |    501 |     501 |   501 | placeholder preservado                                                    |
| `GET /api/projects/join/details`; `POST /api/projects/join`                                                    |     401 |      E |      E |       E |     E | conta ACTIVE; identity da sessão; papel MEMBER/VIEWER definido no projeto |
| `GET /api/projects/:projectId/access-code`                                                                     |     401 |    403 |    403 |     403 |     A | código sensível somente no DTO OWNER                                      |
| `PATCH /api/projects/:projectId/access-code`; `POST .../regenerate`                                            |     401 |    403 |    403 |     403 |     A | e-mail verificado, CSRF e limiter sensível                                |
| `GET /api/projects/:projectId/members`                                                                         |     401 |      L |      L |       L |     L | e-mail completo somente para OWNER                                        |
| `PATCH/DELETE /api/projects/:projectId/members/:membershipId`                                                  |     401 |    403 |    403 |     403 |     A | último OWNER protegido                                                    |
| `POST .../members/:membershipId/reactivate`                                                                    |     401 |    403 |    403 |     403 |     A | membership do mesmo projeto                                               |
| `DELETE /api/projects/:projectId/members/me`                                                                   |     401 |      E |      E |       E |     E | somente a própria membership; último OWNER protegido                      |
| `POST /api/projects/:projectId/ownership/transfer`                                                             |     401 |    403 |    403 |     403 |     A | alvo ativo do mesmo projeto; solicitante permanece OWNER                  |
| `GET /api/projects/:projectId/invitations`                                                                     |     401 |    403 |    403 |     403 |     A | e-mails visíveis apenas ao OWNER                                          |
| `POST/DELETE /api/projects/:projectId/invitations...`                                                          |     401 |    403 |    403 |     403 |     A | criação exige e-mail verificado; token bruto não sai em produção          |
| `POST /api/projects/invitations/details`, `accept`, `decline`                                                  |     401 |      E |      E |       E |     E | e-mail da sessão deve coincidir; conta deve estar ACTIVE                  |
| `GET /api/projects/invitations/mine`                                                                           |     401 |      L |      L |       L |     L | somente PENDING não expirados do e-mail normalizado da sessão             |
| `POST /api/projects/invitations/:invitationId/accept` e `POST /api/projects/invitations/:invitationId/decline` |     401 |      E |      E |       E |     E | invitationId sem correspondência de destinatário retorna 404 opaco        |
| Requirements: todos os `GET`                                                                                   |     401 |      L |      L |       L |     L | mesmo projeto                                                             |
| Requirements: `POST`, `PUT`, `PATCH`, `DELETE`                                                                 |     401 |    403 |      E |       E |     E | invariantes no service                                                    |
| `PUT /api/requirements/:id/tasks`                                                                              |     401 |    403 |      E |       E |     E | conjunto atômico; todas as tarefas no mesmo projeto                       |
| Tasks/vínculos/Kanban/métricas: todos os `GET`                                                                 |     401 |      L |      L |       L |     L | mesmo projeto/recurso                                                     |
| Tasks/vínculos/Kanban: `POST`, `PUT`, `PATCH`, `DELETE`                                                        |     401 |    403 |      E |       E |     E | pertencimento e ator canônico                                             |
| `GET /api/projects/:projectId/tasks/history`                                                                   |     401 |      L |      L |       L |     L | paginado; ator e recursos do mesmo projeto                                |
| `GET /api/tasks/:id/comments`                                                                                  |     401 |      L |      L |       L |     L | leitura paginada; mesmo projeto                                           |
| `POST /api/tasks/:id/comments`                                                                                 |     401 |    403 |      E |       E |     E | autor sempre da sessão                                                    |
| `PATCH /api/tasks/:id/comments/:commentId`                                                                     |     401 |    403 | E (próprio) |     403 |   403 | somente o autor edita; MANAGER/OWNER não editam texto de terceiros        |
| `DELETE /api/tasks/:id/comments/:commentId`                                                                    |     401 |    403 | E (próprio) |       E |     E | MANAGER/OWNER moderam qualquer comentário do projeto                      |
| `POST /api/github/app/installations/start`; `GET /github/app/installations...`                                 |     401 |      E |      E |       E |     E | start exige e-mail verificado; lista usa App ACTIVE e Installation Token |
| `GET /api/github-app/callback`                                                                                 |     302 |    302 |    302 |     302 |   302 | state/sessão/conta/instalação; não exige GitHubIdentity; tokens efêmeros |
| `PUT /api/projects/:projectId/github/integration`                                                              |     401 |    403 |    403 |     403 |     A | OWNER; mesma repo reconecta, repo diferente retorna 409                   |
| `POST /api/webhooks/github-app`                                                                                |       E |      E |      E |       E |     E | público; HMAC/raw body/delivery ID, sem sessão ou CSRF                    |
| `POST /api/projects/:projectId/github/sync`                                                                    |     401 |    403 |    403 |       E |     E | MANAGER+, e-mail verificado, integração ACTIVE e trava por projeto        |
| `PATCH /api/projects/:projectId/github/sync-settings`                                                          |     401 |    403 |    403 |     403 |     A | OWNER                                                                     |
| Commits, PRs, issues e artifacts: `GET`                                                                        |     401 |      L |      L |       L |     L | mesmo projeto                                                             |
| Traceability project-scoped: matriz, requisito, tarefa e artefato                                              |     401 |      L |      L |       L |     L | membership ativa e recurso no mesmo projeto                               |
| `GET .../traceability/commit-suggestions`                                                                      |     401 |      L |      L |       L |     L | DTO minimizado; mesmo projeto                                             |
| `POST .../commit-suggestions/scan`, `:id/confirm`, `:id/reject`                                                |     401 |    403 |      E |       E |     E | CSRF, membership ativa e relações no mesmo projeto                        |
| `/api/settings/account`, `/security`, `/privacy`, `/integrations`                                              |     401 |      E |      E |       E |     E | titular; middleware de estado restringe operações e mutations exigem CSRF |
| `POST /api/auth/github/reauth/start`                                                                           |     401 |      E |      E |       E |     E | somente GitHub-only; identidade vinculada, sessão e state; também permite `DELETION_PENDING` para cancelamento |
| `GET /api/account/audit-events`                                                                                |     401 |      L |      L |       L |     L | somente eventos cujo ator é o titular                                     |
| `GET /api/projects/:projectId/audit-events`                                                                    |     401 |    403 |    403 |     403 |     A | paginado, metadata minimizada, sem enumeração entre projetos              |

## Decisões

- `ACTIVE` segue a matriz por papel. `DEACTIVATED` acessa somente estado da conta e reativação. `DELETION_PENDING` acessa somente status/cancelamento/exportação e reautenticação GitHub necessária ao cancelamento de conta GitHub-only. `ANONYMIZED` não autentica nem pode reassociar automaticamente uma identidade GitHub anterior.

- OWNER administra membros, convites e configuração; MANAGER coordena sync e também escreve domínio; MEMBER escreve tarefas/requisitos; VIEWER é leitura.
- Respostas a convites são vinculadas ao destinatário, usam token hashado/expirável e recebem limiter de operação sensível; criação combina limiter sensível e de entrega de e-mail.
- O middleware resolve o projeto por rota direta ou pelo recurso filho antes de avaliar a membership.
- `ProjectMembership` é a única fonte de participação. `ProjectMember` e `POST /api/projects/:projectId/members` foram removidos; o path antigo retorna `404`. `accessCode` é capability de ingresso e nunca aceita identity/role do cliente.
- Código de acesso nunca concede OWNER/MANAGER. Somente OWNER vê, regenera e configura MEMBER/VIEWER; mudança de configuração não altera memberships existentes.
- A trilha de auditoria e os direitos do titular não concedem administração de dados pessoais a um
  OWNER de projeto.
- O alias não canônico `/api/projects/:projectId/github/artifacts` foi removido e retorna 404; RF06
  usa `/api/projects/:projectId/artifacts`. Sync permanece restrito a MANAGER/OWNER.
- As rotas genéricas dependentes de `TraceLink` e `GithubArtifact` foram removidas. As perspectivas
  canônicas sempre incluem `projectId`, evitando autorização por ID global isolado.
- No fechamento do RF41, VIEWER apenas consulta; MEMBER+ analisa e revisa. Confirmação e rejeição são transacionais e auditadas.
- `responsibleUserId` exige membership ativa; a autoria de movimento vem exclusivamente da sessão e
  não pode ser controlada pelo body.
- `/api/settings/*` é canônico para conta/privacidade. `/api/account/reactivation/*` e
  `/api/account/audit-events` permanecem por responsabilidade própria; paths duplicados removidos
  retornam `404 ROUTE_NOT_FOUND`.
- GitHub OAuth pertence à autenticação/identidade. A GitHub App é autoridade de repositórios,
  artefatos, sync e webhooks; conta local sem `GitHubIdentity` pode conectar a App, criar projeto e
  sincronizar. O callback comprova state, sessão, ator da instalação e Installation sem transformar
  token efêmero em identidade TraceFlow.
- Snapshot pessoal `OWNER`/`ADMIN`, `REAUTH_REQUIRED` e TTL OAuth de repositório não pertencem ao
  contrato vigente. O ADR-009 preserva o histórico e o ADR-012 formaliza a decisão atual.
- Participação histórica/inativa não autoriza exportar conteúdo atual de projeto. Operações
  sensíveis usam senha local ou reautenticação GitHub recente na mesma sessão; último OWNER bloqueia
  a anonimização no vencimento e provoca retorno auditado para `ACTIVE`.
- Comentários de tarefa (`TaskComment`) usam autoria exclusiva da sessão. VIEWER só lê; MEMBER cria
  e edita/exclui apenas o próprio comentário; MANAGER e OWNER excluem qualquer comentário do projeto
  por moderação, mas não editam texto de terceiros. Exclusão é lógica (`deletedAt`/`deletedById`) e
  toda operação é auditada.
