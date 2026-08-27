---
applyTo: "backend/src/middlewares/**/*.js,backend/src/modules/auth/**/*.js,backend/src/modules/authorization/**/*.js,backend/src/modules/github/**/*.js,backend/src/modules/settings/**/*.js,backend/src/modules/privacy/**/*.js,backend/src/shared/security/**/*.js,backend/src/shared/logger/**/*.js,docs/security/**/*.md,docs/privacy/**/*.md,docs/runbooks/INCIDENT_RESPONSE.md,docs/runbooks/GITHUB_INTEGRATION.md"
---

# Segurança e privacidade

- Aplique deny-by-default e fail-closed. Frontend, CORS e conhecimento de IDs não autorizam.
- Sessão opaca/cookie HttpOnly e CSRF são controles distintos; preserve expiração, revogação,
  purpose, consumo único e resposta uniforme contra enumeração.
- Toda autorização por projeto usa membership ativa e recurso resolvido no mesmo projeto.
- `OWNER` é papel contextual, não administrador global nem operador de dados pessoais de terceiros.
- Nunca exponha/registre senha, token, cookie, state, secret, chave, hash, stack, SQL, payload externo
  bruto ou PII desnecessária. Redija evidência como `[REDACTED_SECRET]`.
- OAuth GitHub pertence à identidade; GitHub App pertence a Installation, repositórios, artifacts,
  sync e webhooks. Nenhum fluxo é pré-condição do outro.
- Tokens GitHub são efêmeros. Não reintroduza autorização de repositório por `GitHubIdentity`, PAT ou
  fallback, nem confie em IDs/metadados do navegador sem prova no backend.
- Revise BOLA/IDOR, mass assignment, CSRF, replay, SSRF, XSS, rate limit, headers e falhas externas.
- Auditoria e histórico têm finalidades/retenções distintas; anonimização preserva integridade sem
  reidentificação por texto.
- ASVS é referência, não certificação. Decisão jurídica/operacional externa continua explicitamente
  pendente quando não houver evidência.
