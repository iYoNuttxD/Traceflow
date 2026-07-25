# E6 — Identidade, sessão e autorização por projeto

## Identificação e estado

- Branch: `daniel-dev`
- Commit inicial: `47fd71349a96c34dd1d715cfcc07ae77d71a018b`
- Data: 24/07/2026
- Estado inicial: árvore limpa e sincronizada (`origin/daniel-dev`, +0/-0), sem alterações preexistentes
- Resultado: **PARCIAL**. O núcleo de identidade, sessão, CSRF, RBAC, BOLA, convite seguro, migration expand-only e frontend autenticado está executável. Faltam entrega real de e-mail, administração completa de papéis/membros, limpeza agendada de tokens/sessões e matriz exaustiva de todos os papéis por domínio.

## Decisões e estrutura

Os ADRs 002, 003 e 004 registram sessão opaca server-side, RBAC deny-by-default e manutenção transitória do PAT GitHub como credencial do sistema. Foram criados `modules/auth`, `modules/authorization`, middlewares de autenticação/CSRF/autorização, `features/auth` e telas públicas.

Senhas usam `argon2@0.44.0`/Argon2id. Sessão, reset e convite recebem 256 bits via `randomBytes`; somente SHA-256 é persistido. Cookie: `HttpOnly`, `SameSite=Lax`, `Secure` em produção, path `/`, TTL configurável. CSRF bruto vive só em memória no frontend e é rotacionável. Não existe token de autenticação em storage ou URL.

## Schema, migration e backfill

A migration expand-only `20260724120000_add_identity_session_authorization` adiciona `User`, `Session`, `PasswordResetToken`, `ProjectMembership`, `ProjectInvitation`, `ProjectRole`, `Task.responsibleUserId` e `TaskMovement.movedByUserId`. Os campos/models legados permanecem.

`scripts/backfill-e6-memberships.js` é dry-run por padrão e só altera com `--apply`. Migra e-mails normalizados sem ambiguidade; ausência de e-mail ou nomes conflitantes são contabilizados e preservados para decisão manual. Não imprime PII. Rollback: voltar a aplicação mantendo a expansão; não há drop/contract nesta etapa.

Durante a validação, o primeiro `prisma migrate deploy` recebeu `TEST_DATABASE_URL`, porém o datasource ainda leu `DATABASE_URL` do `.env` e aplicou a migration também no banco local `traceflow`. A migration é aditiva e foi aplicada com sucesso; nada foi revertido/removido. Depois, o harness apontou explicitamente para `traceflow_test`.

## Contratos e autorização

Públicas: health/live/ready, register, login, forgot e reset. Todo domínio é privado. Novas rotas: `/api/auth/{register,login,logout,me,csrf,forgot-password,reset-password,change-password}` e CRUD/aceite de `/api/projects/.../invitations`.

Erros novos: `401 AUTHENTICATION_REQUIRED`, `401 INVALID_CREDENTIALS`, `403 ACCOUNT_DISABLED`, `403 CSRF_INVALID`, `403 FORBIDDEN`, `400 INVITATION_INVALID`. Ausência de membership retorna `404`. Placeholders retornam `401` sem sessão e `501` autenticados.

OWNER nasce com o projeto em transação; listagem é filtrada. VIEWER lê, MEMBER escreve domínio, MANAGER sincroniza e OWNER administra. Recursos filhos resolvem o projeto antes do acesso. Kanban persiste ator da sessão em `movedByUserId`; responsável por tarefa precisa de membership ativa. Join legado exige sessão/CSRF, cria membership canônica e fica deprecado.

## Reset, convite, GitHub e frontend

Forgot usa resposta uniforme. Reset expira, é uso único, incrementa versão e revoga sessões. Em teste o token é capturado na resposta; produção não o devolve/loga, mas ainda precisa de provedor de e-mail.

Convites possuem e-mail, papel, expiração, revogação, consumo único e hash. O segredo é devolvido uma vez ao OWNER; aceite exige sessão do mesmo e-mail. O PAT GitHub global não representa identidade, conforme ADR-004.

Axios usa `withCredentials`, injeta CSRF em mutations e trata 401. `AuthProvider` restaura `/me`/CSRF sem storage; `ProtectedRoute` protege páginas. Há login, cadastro, recuperação, reset, aceite de convite e logout, sem face lift.

## Testes, dependência e cobertura

Foram adicionados 8 testes API E6 e 3 frontend; os 36 testes HTTP históricos agora usam sessão/membership. Cobertura inclui cookie, me, login genérico, conta inativa, CSRF, logout, OWNER atômico, filtro, BOLA, VIEWER, convite/reuso, reset/reuso e 401/501.

Baseline: backend 76,33/61,40/76,98/77,43 e frontend 11,17/13,97/9,93/11,49 (statements/branches/functions/lines). Final: backend **76,38/61,68/76,41/77,45**; frontend **10,90/13,89/9,32/11,53**. A pequena queda frontend vem do denominador das cinco telas/provider novos ainda parcialmente cobertos; nenhum arquivo foi excluído. Dependência adicionada: `argon2@0.44.0`; audit backend: zero vulnerabilidades. Frontend mantém 2 advisories altos do React Router RSC, recurso não usado pela SPA, sem fix não-breaking. CORS aceita credenciais e `X-CSRF-Token` só na allowlist.

Validação final: Prisma validate/generate e architecture check aprovados; scanner aprovou 155 arquivos; migration sem pendências em `traceflow_test`; dry-run examinou banco vazio sem escrever; 118/118 testes backend, 67 unitários, 51 integração/API, 18/18 frontend e build Vite aprovados. Smoke: health/readiness 200, rota privada 401 e login inválido 401. O primeiro lote final falhou por cache Prisma restrito/audit sem rede e depois por ter igualado temporariamente `DATABASE_URL` e `TEST_DATABASE_URL`; as reexecuções com permissões e isolamento corretos passaram.

## Limitações e bloqueios

Adaptador real de e-mail; API/UI completa de papel/desativação/saída e proteção do último OWNER; limpeza agendada; validação do backfill no dataset real; matriz de papéis por todos os endpoints; store distribuído em produção. E7 não foi iniciada.
