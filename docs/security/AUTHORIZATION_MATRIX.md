# Matriz de autorização da API TRACEFLOW

Baseline E6, consolidado na E15 em 26/07/2026. A matriz descreve a política efetiva; não substitui os testes. `L` = leitura, `E` = escrita de domínio, `A` = administração. Sem membership ativa, recursos de projeto retornam `404` para reduzir enumeração; papel insuficiente retorna `403`. Mutations autenticadas exigem CSRF.

| Endpoints | Anônimo | VIEWER | MEMBER | MANAGER | OWNER | Regra adicional |
|---|---:|---:|---:|---:|---:|---|
| `GET /health`, `/health/live`, `/health/ready` | L | L | L | L | L | públicos |
| `POST /api/auth/register`, `login`, `forgot-password`, `reset-password`, `email-verification/verify` | E | E | E | E | E | públicos, limiter sensível |
| `GET /api/auth/me`, `csrf`; `POST logout`, `change-password`, `email-verification/resend`; `PATCH username` | 401 | E | E | E | E | própria sessão; mutations exigem CSRF |
| `POST /api/projects` e `/projects/from-github` | 401 | E | E | E | E | e-mail verificado; criador vira OWNER |
| `GET /api/projects` | 401 | L | L | L | L | lista somente memberships ativas |
| `GET /api/projects/:id` | 401 | L | L | L | L | membership no projeto |
| `PUT /api/projects/:id` | 401 | 403 | 403 | 403 | A | configuração do projeto |
| `DELETE /api/projects/:id` | 401 | 501 | 501 | 501 | 501 | placeholder preservado |
| `POST /api/projects/join` | 401 | E | E | E | E | legado autenticado/deprecado |
| `GET /api/projects/:projectId/members` | 401 | L | L | L | L | e-mail completo somente para OWNER |
| `POST /api/projects/:projectId/members` | 401 | 403 | 403 | 403 | A | legado; não é autoelevação |
| `PATCH/DELETE /api/projects/:projectId/members/:membershipId` | 401 | 403 | 403 | 403 | A | último OWNER protegido |
| `POST .../members/:membershipId/reactivate` | 401 | 403 | 403 | 403 | A | membership do mesmo projeto |
| `DELETE /api/projects/:projectId/members/me` | 401 | E | E | E | E | somente a própria membership; último OWNER protegido |
| `POST /api/projects/:projectId/ownership/transfer` | 401 | 403 | 403 | 403 | A | alvo ativo do mesmo projeto; solicitante permanece OWNER |
| `GET /api/projects/:projectId/invitations` | 401 | 403 | 403 | 403 | A | e-mails visíveis apenas ao OWNER |
| `POST/DELETE /api/projects/:projectId/invitations...` | 401 | 403 | 403 | 403 | A | criação exige e-mail verificado; token bruto não sai em produção |
| `POST /api/projects/invitations/accept` | 401 | E | E | E | E | e-mail da sessão deve coincidir |
| Requirements: todos os `GET` | 401 | L | L | L | L | mesmo projeto |
| Requirements: `POST`, `PUT`, `PATCH`, `DELETE` | 401 | 403 | E | E | E | invariantes no service |
| `PUT /api/requirements/:id/tasks` | 401 | 403 | E | E | E | conjunto atômico; todas as tarefas no mesmo projeto |
| Tasks/vínculos/Kanban/métricas: todos os `GET` | 401 | L | L | L | L | mesmo projeto/recurso |
| Tasks/vínculos/Kanban: `POST`, `PUT`, `PATCH`, `DELETE` | 401 | 403 | E | E | E | pertencimento e ator canônico |
| `GET /api/projects/:projectId/tasks/history` | 401 | L | L | L | L | paginado; ator e recursos do mesmo projeto |
| `POST /api/github/app/installations/start`; `GET /github/app/installations...` | 401 | E | E | E | E | start exige e-mail verificado; somente instalações comprovadas |
| `GET /api/github-app/callback` | 302 | 302 | 302 | 302 | 302 | público; state vinculado à sessão inicial, sem depender do cookie |
| `PUT /api/projects/:projectId/github/integration` | 401 | 403 | 403 | 403 | A | e-mail verificado; OWNER e instalação comprovada |
| `POST /api/webhooks/github-app` | E | E | E | E | E | público; HMAC/raw body/delivery ID, sem sessão ou CSRF |
| `POST /api/projects/:projectId/github/sync` | 401 | 403 | 403 | E | E | MANAGER+, e-mail verificado, integração ACTIVE e trava por projeto |
| `PATCH /api/projects/:projectId/github/sync-settings` | 401 | 403 | 403 | 403 | A | OWNER |
| Commits, PRs, issues e artifacts: `GET` | 401 | L | L | L | L | mesmo projeto |
| Traceability project-scoped: matriz, requisito, tarefa e artefato | 401 | L | L | L | L | membership ativa e recurso no mesmo projeto |
| `GET .../traceability/commit-suggestions` | 401 | L | L | L | L | DTO minimizado; mesmo projeto |
| `POST .../commit-suggestions/scan`, `:id/confirm`, `:id/reject` | 401 | 403 | E | E | E | CSRF, membership ativa e relações no mesmo projeto |
| `/api/account/personal-data`, perfil, sessões, exportação, desativação e exclusão | 401 | E | E | E | E | somente o próprio titular; mutations exigem CSRF/senha quando indicado |
| `GET /api/account/audit-events` | 401 | L | L | L | L | somente eventos cujo ator é o titular |
| `GET /api/projects/:projectId/audit-events` | 401 | 403 | 403 | 403 | A | paginado, metadata minimizada, sem enumeração entre projetos |

## Decisões

- OWNER administra membros, convites e configuração; MANAGER coordena sync e também escreve domínio; MEMBER escreve tarefas/requisitos; VIEWER é leitura.
- O middleware resolve o projeto por rota direta ou pelo recurso filho antes de avaliar a membership.
- `ProjectMember` e `accessCode` permanecem apenas para compatibilidade; o contrato canônico usa `ProjectMembership`.
- A E7 adiciona trilha de auditoria e direitos do titular; não concede administração de dados pessoais a um OWNER de projeto.
- Na E9, o alias não canônico `/api/projects/:projectId/github/artifacts` foi removido e retorna 404; RF06 usa `/api/projects/:projectId/artifacts`. Sync permanece restrito a MANAGER/OWNER.
- Na E10, as rotas genéricas dependentes de `TraceLink` e `GithubArtifact` foram removidas. As perspectivas canônicas sempre incluem `projectId`, evitando autorização por ID global isolado.
- No fechamento do RF41, VIEWER apenas consulta; MEMBER+ analisa e revisa. Confirmação e rejeição são transacionais e auditadas.
- Na E11, `responsibleUserId` exige membership ativa; a autoria de movimento vem exclusivamente da sessão e não pode ser controlada pelo body.
