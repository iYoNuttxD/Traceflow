# L1 — identidade, e-mail e GitHub App

## Baseline e escopo

- branch: `daniel-dev`;
- commit inicial: `d6d7137e33d3b435c70a014904142d6e1763db54`;
- estado inicial: branch um commit à frente de `origin/daniel-dev`; dois PDFs não rastreados preexistentes e preservados;
- entrega posterior à E0–E15, sem nova branch, commit, push ou pull request.

Foram analisados integralmente o prompt L1, README, roadmap, contexto arquitetural, documentos vigentes de arquitetura/API/ASVS/autorização/segredos/threat model/privacidade/rastreabilidade/backlog, schema Prisma, migrations de identidade/projetos/GitHub, módulos de autenticação/e-mail/GitHub/projetos, rotas, páginas públicas, CSS e testes relacionados.

## Decisões

### Identidade

`User.name` continua sendo o nome completo. `User.username` é obrigatório, único sob a collation case-insensitive do MySQL e armazenado em minúsculas. A função testável `identity-policy.js` centraliza normalização, formato e nomes reservados. Usuários anteriores à L1 recebem `user-<id>` e `mustSetUsername=true`; a interface exige que escolham um username válido. Nenhuma identidade histórica é inferida.

Cadastro coleta apenas nome completo, username, e-mail e senha; confirmação existe somente na SPA. CPF, telefone, token GitHub e dados sem finalidade atual não foram adicionados.

### Senha e sessão

A senha aceita espaços, Unicode e colagem, tem 12–128 caracteres e não sofre trim ou transformação. O backend bloqueia lista local versionada de senhas comuns e semelhança trivial com username/e-mail. Argon2id permanece com os parâmetros vigentes. O medidor da SPA é informativo; o backend é a autoridade.

`Session` mantém token opaco hashado e passou a persistir `rememberMe`. `SESSION_TTL_MS` define a sessão comum e `PERSISTENT_SESSION_TTL_MS` a persistente; cookie continua HttpOnly, Secure em produção e SameSite configurável. Logout, reset e troca de senha revogam sessões sem distinção estrutural do token.

### Verificação e entrega de e-mail

`EmailVerificationToken` armazena somente SHA-256, expiração e uso. Novo token invalida os anteriores. O cadastro não é revertido por falha SMTP: a resposta distingue conta criada de entrega não aceita. O adapter classifica `accepted`, `temporary_failure` e `permanent_failure`, sem fila fictícia, token/payload/segredo em log. Recuperação preserva resposta uniforme; convite devolve ao OWNER o resultado sanitizado da entrega.

Ações sensíveis usam `requireVerifiedEmail`: criação de projeto, criação via GitHub, instalação/conexão/sync GitHub e envio de convite. Login, logout, sessão, recuperação, verificação e reenvio continuam disponíveis.

### GitHub App

Não existe fallback para credencial sistêmica, PAT por usuário ou PAT por projeto. `GitHubAppCredentialProvider` gera JWT da App e troca `code`/gera installation access token somente em memória. `GitHubInstallationClientFactory` cria Octokit por installation ID; tokens temporários não chegam ao Prisma, DTO, log ou auditoria.

O início salva apenas hash de `state`, vinculado a usuário, sessão, intenção e projeto. O callback exige a mesma sessão, validade e uso único; troca `code` por user token, lista instalações do usuário, comprova `installation_id`, persiste somente metadados e descarta o token. Isso não autentica no TRACEFLOW.

Webhooks usam raw body limitado a 1 MiB, HMAC SHA-256, comparação constant-time e `X-GitHub-Delivery` único. `installation` suspensa/removida e `installation_repositories.removed` mudam integrações para reconexão sem apagar projetos ou artefatos. Não há sync automático por evento.

## Migration

`20260801120000_l1_identity_email_github_app`:

1. adiciona username nullable;
2. backfill técnico `user-<id>` e `mustSetUsername=true`;
3. aplica NOT NULL e unique;
4. adiciona `Session.rememberMe` e tokens de verificação;
5. cria installation, autorização, integração, state e delivery de webhook;
6. converte projetos GitHub antigos em `ProjectGitHubIntegration.RECONNECT_REQUIRED`, preservando todos os metadados e artefatos.

Migration anterior não foi editada.

## Contratos HTTP

- `POST /api/auth/register` — `{name,username,email,password}`;
- `POST /api/auth/login` — `{identifier,password,rememberMe}`;
- `PATCH /api/auth/username`;
- `POST /api/auth/email-verification/resend`;
- `POST /api/auth/email-verification/verify`;
- `POST /api/github/app/installations/start`;
- `GET /api/github-app/callback` (público; autenticado pelo `state` de uso único);
- `GET /api/github/app/installations`;
- `GET /api/github/app/installations/:installationId/repositories`;
- `PUT /api/projects/:projectId/github/integration`;
- `POST /api/webhooks/github-app` (público, assinatura e raw body obrigatórios);
- `POST /api/projects/from-github` agora recebe installation e repository IDs, não metadados confiados ao navegador.

## Frontend e CSS

Pages públicas são adaptadores para `features/auth/pages`. Foram adicionados `GuestOnlyRoute`, `AuthShell`, `PasswordField`, medidor, confirmação, visibilidade, remember-me, botão GitHub futuro desabilitado, verificação de e-mail, banners de verificação/username e instalação/reconexão GitHub App. As classes `.auth-*`, `.password-*`, `.github-login-placeholder` e `.email-verification-banner` reutilizam a paleta e os focos vigentes, sem CSS inline ou biblioteca visual nova.

## Configuração

Produção exige configuração SMTP e o conjunto completo `GITHUB_APP_*`. Configuração parcial falha no startup. Segredos ficam somente no backend; `VITE_*` continua sem segredo. Consulte `.env.example` e `docs/runbooks/GITHUB_INTEGRATION.md`.

## Evidências e limitações

### Correção de cardinalidade — vários repositórios e projetos

A revisão posterior confirmou que a migration L1 não criou `UNIQUE(installationId)` e o service não exigia exatamente um repositório. A lacuna real era a ausência de unicidade global de `ProjectGitHubIntegration.githubRepositoryId` e de disponibilidade explícita na listagem. A migration incremental `20260801160000_fix_github_repository_cardinality` substitui o índice composto redundante por `UNIQUE(githubRepositoryId)`, preservando `UNIQUE(projectId)` e mantendo `installationId` não único.

Uma instalação agora é explicitamente reutilizável por vários projetos/repositórios. A listagem retorna todos os repositórios, branch padrão e flags de disponibilidade; somente repositórios ocupados por outro projeto ficam desabilitados. Adições via webhook não alteram integrações; remoções marcam somente os IDs removidos como `RECONNECT_REQUIRED`, preservando demais projetos e artifacts.

Cobertura adicionada: políticas de username/senha, login por dois identificadores, TTL persistente, bloqueio/verificação/reuso, state por sessão, instalação forjada, factory por instalação, HMAC/webhook duplicado/repositório removido, formulários, força/visibilidade/remember-me, GitHub futuro e GuestOnlyRoute.

Validação final local em 01/08/2026:

- `npm ci` aprovado em backend e frontend;
- as 26 migrations foram reaplicadas do zero no banco explicitamente validado `localhost:3306/traceflow_test`; `db:test:status` confirmou schema atualizado;
- backend: lint, format, Prisma validate/generate, arquitetura, secret scan, 124 testes unitários, 94 testes de integração/API e 218 testes na cobertura aprovados;
- cobertura backend: 85,96% statements, 72,55% branches, 87,34% functions e 88,15% lines, sem reduzir thresholds;
- frontend: lint, format, 89 testes e build aprovados; cobertura informativa de 53,04% statements, 50,47% branches, 45,79% functions e 54,58% lines;
- política de CI e de audit passou; backend e frontend ficaram com zero vulnerabilidades high/critical e zero exceções;
- `git diff --check` passou e os dois PDFs não rastreados existentes no baseline foram preservados.

Durante a validação, execuções intermediárias falharam por helpers antigos de verificação de e-mail, rate limit local de 20 aplicado à suíte e cobertura backend inicialmente abaixo do gate. As fixtures foram alinhadas ao contrato L1, os limites foram isolados somente no ambiente Vitest e testes reais de controller/repository/SMTP foram adicionados. Na recriação do banco, o primeiro `db:test:status` recebeu temporariamente `DATABASE_URL=TEST_DATABASE_URL` e foi corretamente bloqueado pela proteção; repetido no ambiente normal, passou. Esses erros não permanecem no resultado final.

Esta entrega não implementa Login com GitHub, MFA, secret manager, fila de e-mail, sync automático por webhook, store/lock distribuído ou E2E real de navegador. A configuração e permissões de uma GitHub App real e de SMTP dependem do ambiente; testes automatizados não fazem rede externa. Não se alega conformidade total com OWASP ASVS ou LGPD.
