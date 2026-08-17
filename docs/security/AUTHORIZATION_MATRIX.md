# Matriz de autorização da API TRACEFLOW

Baseline E6, consolidado na E15 em 26/07/2026. A matriz descreve a política efetiva; não substitui os testes. `L` = leitura, `E` = escrita de domínio, `A` = administração. Sem membership ativa, recursos de projeto retornam `404` para reduzir enumeração; papel insuficiente retorna `403`. Mutations autenticadas exigem CSRF.

| Endpoints | Anônimo | VIEWER | MEMBER | MANAGER | OWNER | Regra adicional |
|---|---:|---:|---:|---:|---:|---|
| `GET /health`, `/health/live`, `/health/ready` | L | L | L | L | L | públicos |
| `POST /api/auth/register`, `login`, `forgot-password`, `reset-password` | E | E | E | E | E | públicos, limiter sensível |
| `GET /api/auth/me`, `csrf`; `POST logout`, `change-password` | 401 | E | E | E | E | própria sessão |
| `POST /api/projects` e `/projects/from-github` | 401 | E | E | E | E | criador vira OWNER |
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
| `POST/DELETE /api/projects/:projectId/invitations...` | 401 | 403 | 403 | 403 | A | criação/revogação; token bruto não sai em produção |
| `POST /api/projects/invitations/accept` | 401 | E | E | E | E | e-mail da sessão deve coincidir |
| Requirements: todos os `GET` | 401 | L | L | L | L | mesmo projeto |
| Requirements: `POST`, `PUT`, `PATCH`, `DELETE` | 401 | 403 | E | E | E | invariantes no service |
| `PUT /api/requirements/:id/tasks` | 401 | 403 | E | E | E | conjunto atômico; todas as tarefas no mesmo projeto |
| Tasks/vínculos/Kanban/métricas: todos os `GET` | 401 | L | L | L | L | mesmo projeto/recurso |
| Tasks/vínculos/Kanban: `POST`, `PUT`, `PATCH`, `DELETE` | 401 | 403 | E | E | E | pertencimento e ator canônico |
| `GET /api/projects/:projectId/tasks/history` | 401 | L | L | L | L | paginado; ator e recursos do mesmo projeto |
| Sprints: `GET /projects/:projectId/sprints`, `/sprints/:id`, `/sprints/:id/tasks` | 401 | L | L | L | L | RF10; `resolveProjectId` resolve `/sprints/:id` |
| Sprints: `POST`, `PUT`, `PATCH /sprints/:id/status`, `PUT /sprints/:id/tasks` | 401 | 403 | E | E | E | RF10; invariantes, sobreposição e estados terminais no service, sob lock (ADR-010) |
| Sprints: `DELETE /sprints/:id` | 401 | 405 | 405 | 405 | 405 | ADR-010 D06/D13: sprint não é excluída; a recusa vem antes de qualquer leitura, então não depende do papel |
| Milestones: `GET /projects/:projectId/milestones`, `/milestones/:id` | 401 | L | L | L | L | RF10; `resolveProjectId` resolve `/milestones/:id` |
| Milestones: `POST`, `PUT`, `PATCH /milestones/:id/status`, `DELETE` | 401 | 403 | E | E | E | RF10 |
| `GET /api/projects/:projectId/schedule` | 401 | L | L | L | L | RF10; agregado somente-leitura, DTO minimizado |
| `GET /api/sprints/:id/progress` | 401 | L | L | L | L | RF35; somente-leitura; só `taskId` no payload, sem recorte por responsável |
| `PATCH/DELETE /api/tasks/:id/sprint` | 401 | 403 | E | E | E | RF10; tarefa e sprint no mesmo projeto; idempotente; recurso de projeto não visto responde 404 indistinguível |
| `GET /api/github/auth/check`, `/github/repositories` | 401 | L | L | L | L | credencial GitHub é sistêmica |
| `POST /api/projects/:projectId/github/sync` | 401 | 403 | 403 | E | E | MANAGER+ e trava por projeto |
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
- No ADR-010 (S1-04), o 404 de recurso endereçado por ID passou a ser **indistinguível** entre "não existe" e "existe em projeto que o ator não acessa", para `/projects/:id`, `/requirements/:id`, `/tasks/:id`, `/sprints/:id` e `/milestones/:id`. Middleware e service constroem a resposta pela mesma fábrica; antes divergiam em código, mensagem e presença de `code`, e o par permitia enumerar IDs fora do alcance do ator.
- A interface esconde ações de mutação de VIEWER no cronograma. Isso é UX: o backend continua sendo a autoridade e recusa com 403 independentemente do que a tela ofereça.
