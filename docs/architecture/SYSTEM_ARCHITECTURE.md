# Arquitetura vigente do TRACEFLOW

## Escopo

Este documento descreve a implementação consolidada após a E15. `TRACEFLOW_CONTEXTO_ARQUITETURA.md` continua sendo fonte de requisitos e diretrizes históricas; em caso de divergência sobre o estado executável, prevalecem código, migrations, testes, este documento e os ADRs aceitos.

## Visão geral

```text
Navegador
  ↓ HTTPS/reverse proxy
React/Vite SPA
  ↓ cookie HttpOnly + CSRF + JSON
Express API
  ↓
Route → Controller → Service → Repository → Prisma → MySQL
                         └→ GitHub client/Octokit → api.github.com
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

`scripts/check-architecture.js` verifica essas fronteiras e impede a reintrodução de `TaskPullRequest`, `GithubArtifact` e `TraceLink` no runtime.

## Identidade, sessão e autorização

- `User` é identidade; senha usa Argon2id.
- `Session` guarda hash do token opaco e do CSRF; o browser recebe cookie HttpOnly.
- `ProjectMembership` define OWNER, MANAGER, MEMBER e VIEWER.
- A API resolve recursos filhos para o projeto antes de autorizar.
- Ausência de membership usa `404`; papel insuficiente usa `403`.
- Ator de movimento e auditoria vem de `req.auth.user`.
- Responsável por Task é `responsibleUserId` com membership ativa.

Snapshots textuais anteriores à identidade são somente compatibilidade/histórico e nunca prova de identidade.

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

`github-credential.provider.js` é o único leitor da credencial. O client fixa `api.github.com`, aplica timeout/retry e converte para DTO mínimo. Sync pagina coleções, persiste por identificador externo e impede concorrência por projeto na instância. Não há fetch genérico de URL fornecida pelo cliente.

## Segurança e privacidade

A API usa validação Zod, limite de body, Helmet, CORS allowlist, rate limiting, erros seguros, request ID, logging estruturado e redaction. Direitos técnicos do titular incluem consulta, correção, sessões, exportação, desativação e solicitação de exclusão. Auditoria e histórico têm finalidades e retenções diferentes.

ASVS é referência, não certificação. LGPD depende de decisões jurídicas e operacionais externas sobre base legal, controlador, backups, logs e fornecedores.

## Banco e migrations

Prisma é acessado somente por repositories e scripts de manutenção autorizados. As 25 migrations são imutáveis e aplicam do zero. Mudança destrutiva exige inventário, reconciliação, backup, guard e roll-forward. Scripts E8/E11 permanecem para auditoria/recovery e não são runtime.

## CI e operação

GitHub Actions executa Quality, Backend Tests, Frontend Tests, Supply Chain e Dependency Review. Backend usa MySQL descartável e migrations do zero. Coverage, architecture check, secret scan, audit policy e build são gates.

TLS termina no proxy. Rate limit/trava GitHub são locais ao processo. Logs, backup, restore, secret manager, monitoramento e proteção de branch precisam ser configurados no ambiente conforme os runbooks.

