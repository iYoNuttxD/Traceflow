# Arquitetura vigente do TRACEFLOW

## Escopo

Este documento descreve a implementação consolidada após a LR.3. `TRACEFLOW_CONTEXTO_ARQUITETURA.md` continua sendo fonte de requisitos e diretrizes históricas; em caso de divergência sobre o estado executável, prevalecem código, migrations, testes, este documento e os ADRs aceitos.

## Visão geral

```text
Navegador
  ↓ HTTPS/reverse proxy
React/Vite SPA
  ↓ cookie HttpOnly + CSRF + JSON
Express API
  ↓
Route → Controller → Service → Repository → Prisma → MySQL
                         └→ GitHub App factory por instalação/Octokit → api.github.com
                         └→ email provider → SMTP/capture controlado
```

O backend é a autoridade para identidade, autorização, validação, domínio e persistência. O frontend coordena interação e estado de interface, sem reproduzir fórmulas de domínio.

## Frontend

A direção permitida é `app/routes → pages → features → shared + http-client`.

- `AppRoutes` aplica lazy loading, `ProtectedRoute` e fallback acessível.
- Pages adaptam parâmetros e compõem features.
- APIs de feature usam exclusivamente `api/http-client.js`.
- Hooks e screens controlam requests canceláveis, mutações e rollback visual.
- Shared não importa pages/features; features não importam internals umas das outras.
- `TraceabilityFlow` renderiza o DTO de nodes/edges sem recalcular cobertura.

## Backend

| Camada | Responsabilidade | Não pode |
|---|---|---|
| Route | método, caminho, auth/CSRF/RBAC e schema HTTP | regra, Prisma, client externo |
| Controller | adaptar HTTP e contexto autenticado | repository, Prisma, regra |
| Service | caso de uso, invariantes, transação e auditoria | `req`/`res`, DOM |
| Repository | consulta/mutação orientada ao domínio | autorização ou mensagem HTTP |
| External client | timeout, retry, paginação e DTO externo | persistência ou regra TRACEFLOW |

`scripts/check-architecture.js` verifica essas fronteiras e impede a reintrodução, no runtime/schema atual, de `TaskPullRequest`, `GithubArtifact`, `TraceLink`, `ProjectMember`, `Commit.branch`, aliases GitHub de `Project` e rotas de conta removidas.

## Identidade, sessão e autorização

- `User` é identidade; senha usa Argon2id.
- `Session` guarda hash do token opaco e do CSRF; o browser recebe cookie HttpOnly.
- `ProjectMembership` define OWNER, MANAGER, MEMBER e VIEWER.
- A API resolve recursos filhos para o projeto antes de autorizar.
- Ausência de membership usa `404`; papel insuficiente usa `403`.
- Ator de movimento e auditoria vem de `req.auth.user`.
- Responsável por Task é `responsibleUserId` com membership ativa.

`Task.responsible` e `TaskMovement.movedBy` são snapshots históricos anteriores à identidade e nunca prova de identidade. `TaskMovement` não mantém referência a `ProjectMember`.

## Modelo canônico e rastreabilidade

```text
Requirement 0..N ← Task.requirementId
Task 0..1 → PullRequest via Task.pullRequestId
Task N..N Commit via TaskCommit
Task N..N Issue via TaskIssue
TaskCommitSuggestion → revisão humana → TaskCommit
```

`TaskMovement` registra movimentações; `TaskHistoryEntry` registra STATUS, DEADLINE, RESPONSIBLE e PRIORITY; `AuditEvent` é a trilha transversal. O grafo canônico possui perspectivas de requisito, tarefa e artefato tipado.

## GitHub

`github-credential.provider.js` lê somente segredos da GitHub App, assina JWT e cria tokens temporários. `github.client.js` é uma factory por instalação; não existe singleton nem fallback para credencial sistêmica. O state do callback é hashado e ligado à sessão. O user access token permanece somente em memória durante o callback: confirma a `GitHubIdentity`, pagina `GET /user/installations/{installation_id}/repositories` e materializa uma evidência curta apenas para `OWNER` ou `ADMIN`. Token pessoal não é persistido, registrado nem retornado.

A seleção cruza duas autoridades independentes: `GitHubRepositoryAuthorization` prova a permissão do usuário e a consulta ao vivo com installation token prova o acesso técnico da App. Somente a interseção é listada ou conectada. A Installation nunca amplia a autoridade do usuário. Evidências vencidas exigem novo fluxo de autorização.

Uma `GitHubInstallation` pode alimentar várias `ProjectGitHubIntegration`. Cada integração aponta para um projeto e um repositório únicos; `installationId` é apenas FK/index, nunca unique. Reconectar o mesmo repositório revalida a conexão; trocar para outro repositório retorna `409 GITHUB_REPOSITORY_SWAP_FORBIDDEN`, preservando artifacts e histórico. O lifecycle da instalação é `PENDING`, `ACTIVE`, `SUSPENDED` ou `REMOVED`; somente `ACTIVE` seleciona e sincroniza. Callback não reativa `SUSPENDED`/`REMOVED`.

Sync pagina coleções, persiste por identificador externo e usa `GitHubSyncRun.activeProjectId` para exclusão mútua no banco, com stale detection. Webhook público usa raw body, HMAC e delivery ID, sem sessão/CSRF. Delivery possui claim `PROCESSING`, estado terminal e retry de `FAILED` ou processamento stale; duplicatas concorrentes não reexecutam o evento. Não há fetch genérico de URL fornecida pelo cliente.

Projetos anteriores à L1 mantêm artifacts e metadados em uma integração `RECONNECT_REQUIRED`. `ProjectGitHubIntegration` é a única fonte operacional da conexão e concentra identidade do repositório, configuração e estado de sincronização; `Project` não mantém aliases concorrentes.

## Segurança e privacidade

A API usa validação Zod, limite de body, Helmet, CORS allowlist, rate limiting, erros seguros, request ID, logging estruturado e redaction. Direitos técnicos do titular usam `/api/settings/*`; `/api/account/reactivation/*` permanece como fluxo específico. Direitos incluem consulta, correção, sessões, exportação, desativação e solicitação de exclusão. Auditoria e histórico têm finalidades e retenções diferentes.

ASVS é referência, não certificação. LGPD depende de decisões jurídicas e operacionais externas sobre base legal, controlador, backups, logs e fornecedores.

## Banco e migrations

Prisma é acessado somente por repositories e scripts de manutenção autorizados. As 36 migrations são imutáveis e aplicam do zero. Mudança destrutiva exige inventário, reconciliação, backup, guard e roll-forward. Scripts E8 permanecem recovery-only; fontes E6/E11 dependentes do schema anterior à LR.2 exigem aquele checkout/schema e não são runtime.

## CI e operação

GitHub Actions executa Quality, Backend Tests, Frontend Tests, Supply Chain e Dependency Review. Backend usa MySQL descartável e migrations do zero. Coverage, architecture check, secret scan, audit policy e build são gates.

TLS termina no proxy. Rate limit/trava GitHub são locais ao processo. Logs, backup, restore, secret manager, monitoramento e proteção de branch precisam ser configurados no ambiente conforme os runbooks.
