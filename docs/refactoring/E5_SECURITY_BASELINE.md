# E5 — Baseline de segurança ASVS

## Identificação e resultado

- **Branch:** `daniel-dev`
- **Commit inicial:** `ade0ff2d7324eed12e271bac218a0faddd0d3ba0`
- **Data:** 24/07/2026
- **Estado inicial:** árvore limpa e sincronizada com `origin/daniel-dev` (`+0/-0`)
- **Alterações locais preexistentes:** nenhuma
- **Resultado:** **CONCLUÍDA**. Controles transversais, testes e documentação foram implementados sem schema/migration, autenticação, autorização ou mudança de respostas de sucesso.

O arquivo ASVS 5.0 citado no escopo não estava presente no checkout. A matriz utilizou o CSV 5.0.0 da [release oficial OWASP/ASVS](https://github.com/OWASP/ASVS/releases/tag/latest); essa ausência local foi registrada, sem impedir a análise e sem declarar conformidade.

## Estrutura criada

```text
backend/src/shared/security/
├── body.js
├── cors.js
├── headers.js
├── rate-limit.js
├── ssrf.js
└── index.js

backend/scripts/check-secrets.js
backend/test/unit/security.test.js
backend/test/unit/github-client-security.test.js

docs/security/
├── THREAT_MODEL.md
├── SECRETS_POLICY.md
├── DEPENDENCY_RISK_REGISTER.md
└── ASVS_BASELINE.md
```

## Threat model e decisões

`THREAT_MODEL.md` inventaria ativos, atores, entradas, fluxos e boundaries entre navegador, proxy, Express, MySQL, GitHub e CI/CD. A análise STRIDE registra BOLA/IDOR, convite previsível, abuso, SSRF, DoS, vazamento, supply chain e configuração incorreta. Ausência de identidade/autorização e convite reutilizável permanecem riscos críticos explícitos para E6.

## Configuração de segurança

`env.js` continua nativo, imutável e fail-fast. Foram adicionadas:

| Variável | Default dev/test | Regra |
|---|---:|---|
| `BODY_LIMIT` | `100kb` | entre 1kb e 10mb |
| `CORS_ALLOWED_ORIGINS` | frontend/localhost ou `frontend.test` | produção exige allowlist; `*` proibido |
| `CORS_ALLOWED_METHODS` | métodos usados pela API | enum explícito |
| `CORS_ALLOWED_HEADERS` | `Content-Type,X-Request-Id` | nomes válidos e mínimos |
| `RATE_LIMIT_WINDOW_MS` | `900000` | inteiro seguro |
| `RATE_LIMIT_MAX` | `200` | limite geral `/api` |
| `SENSITIVE_RATE_LIMIT_MAX` | `20` | base dos limites sensíveis |
| `GITHUB_REQUEST_TIMEOUT_MS` | `15000` | 1s a 120s |
| `GITHUB_RETRY_MAX` | `2` | 0 a 5 |
| `TRUST_PROXY` | `false` | nunca aceita `true`; número/faixa explícitos |

Os exemplos foram atualizados sem valores reais.

## HTTP hardening

- `express.json({ limit: BODY_LIMIT, strict: true })` retorna `413 PAYLOAD_TOO_LARGE` e `400 MALFORMED_JSON` seguros.
- Bodies em POST/PUT/PATCH com conteúdo e tipo diferente de JSON retornam `415 UNSUPPORTED_MEDIA_TYPE`.
- Helmet 8.3.0 remove fingerprint e ativa CSP, `nosniff`, `no-referrer`, proteção de frame e outros defaults seguros.
- HSTS de um ano com subdomínios existe somente em produção; TLS continua responsabilidade do reverse proxy.
- A API usa `Cache-Control: no-store`; o host separado da SPA precisa de headers próprios.
- CORS valida origem, método e headers de preflight; requests sem `Origin` continuam permitidas para clientes não navegador.
- `trust proxy` é explícito para que IP usado no limiter não confie em cadeia arbitrária.

Novos erros técnicos preservam `message` e adicionam `code`/`requestId`: `RATE_LIMITED`, `CORS_ORIGIN_DENIED`, `PAYLOAD_TOO_LARGE`, `MALFORMED_JSON` e `UNSUPPORTED_MEDIA_TYPE`. Respostas de sucesso e erros de domínio existentes não mudaram.

## Rate limiting, join e sincronização

- geral: 200 requests/15 min por IP normalizado;
- sensível: 20/15 min para auth/listagem GitHub e importação;
- join: máximo 10/15 min por IP;
- sync: máximo 5/15 min por combinação IP/projeto;
- resposta: `429`, mensagem estável, `RATE_LIMITED`, request ID, `Retry-After` e header `RateLimit`;
- tentativas de join/sync geram evento sanitizado com hash curto do identificador de rede, sem body/accessCode;
- uma `Set` impede duas sincronizações simultâneas do mesmo projeto na mesma instância.

O MemoryStore é aceitável apenas em desenvolvimento/instância única: reinício limpa contadores e múltiplas réplicas não compartilham estado. Redis/store distribuído e chaves por usuário/projeto autenticado ficam para infraestrutura/E6. O join ainda revela o erro histórico de projeto inexistente; uniformizar isso junto do novo convite é pendência crítica E6.

## GitHub: timeout, retry e rate limit

Octokit usa base fixa `https://api.github.com` e timeout central de 15s. Leituras transitórias (`429`, `502`, `503`, `504`, timeout/conexão) têm no máximo 2 retries com exponencial, jitter e espera limitada a 2s; `Retry-After`/reset são respeitados dentro desse teto. Não há retry para `401`, `403`, `404` ou `422`. `403` com quota zero e `429` são normalizados para `GITHUB_RATE_LIMITED`; timeout/falha externa tornam-se `ExternalServiceError`. Token, headers e resposta Octokit não são serializados/logados.

Paginação, scheduler, checkpoint, circuit breaker e transação global não foram alterados.

## SSRF e segredos

URLs GitHub aceitam somente HTTPS, porta padrão e hosts exatos `github.com`/`api.github.com`; credenciais na URL, localhost, loopback, redes privadas, link-local, metadata, FTP e hosts arbitrários são rejeitados. Não existe fetch genérico nem suporte GitHub Enterprise nesta baseline.

`SECRETS_POLICY.md` define inventário, acesso, rotação, revogação e incidente. `security:secrets` verifica padrões comuns em arquivos relevantes e tem fixture controlada. `.env` permanece ignorado, `VITE_*` não recebeu segredo e nenhum valor real foi documentado.

## Dependências e supply chain

Dependências adicionadas ao backend:

- `helmet@8.3.0`;
- `express-rate-limit@8.6.0`.

Atualizações pontuais:

- backend: `body-parser` 1.20.5 → 1.20.6 e `brace-expansion` 5.0.6 → 5.0.8;
- frontend: Axios → 1.18.0, React Router DOM → 7.18.0, `form-data` → 4.0.6 e PostCSS → 8.5.23.

Backend terminou com zero vulnerabilidades no audit. Frontend caiu de 5 para 2 entradas altas, ambas do mesmo advisory de React Router RSC; o TRACEFLOW não usa RSC/actions/loaders/SSR. A correção indicada é incompatível e não foi aplicada automaticamente. O risco e a revisão futura estão em `DEPENDENCY_RISK_REGISTER.md`.

## Testes e resultados

Foram adicionados 24 testes backend (incluindo um caso adicional de env e concorrência GitHub): body, JSON, headers, HSTS, CORS, preflight, limiters, isolamento por chave, SSRF, scanner, timeout/retry/rate limit e configuração Octokit. Nenhuma chamada real ao GitHub ocorreu.

| Validação | Resultado |
|---|---|
| `npm ci` backend | aprovado, 242 pacotes |
| `prisma validate` / `generate` | aprovados, schema inalterado |
| `architecture:check` | aprovado, zero violações |
| `security:secrets` | aprovado, 132 arquivos |
| `npm test` backend | 14 arquivos, 110 testes |
| `test:unit` | 12 arquivos, 67 testes |
| `test:integration` | 2 arquivos, 43 testes em `traceflow_test` |
| `test:coverage` backend | aprovado |
| `npm test` frontend | 6 arquivos, 15 testes |
| `test:coverage` frontend | aprovado |
| `npm run build` frontend | aprovado; aviso conhecido de chunk 548,78 kB |
| smoke real | health/live/ready 200; CORS 403; body 413; geral/join/sync 429; placeholder 501 |

Total: **125 testes** (110 backend + 15 frontend).

## Cobertura antes e depois

| Área | Momento | Statements | Branches | Functions | Lines |
|---|---|---:|---:|---:|---:|
| Backend | Antes | 74,42% | 57,55% | 74,88% | 75,48% |
| Backend | Depois | 76,33% | 61,40% | 76,98% | 77,43% |
| Frontend | Antes | 11,17% | 13,97% | 9,93% | 11,49% |
| Frontend | Depois | 11,17% | 13,97% | 9,93% | 11,49% |

`shared/security` alcançou 93,44% de statements, 76,78% de branches, 96,00% de functions e 96,22% de lines. A tentativa inicial de reexecutar o baseline falhou por ausência de `TEST_DATABASE_URL` e restrição de bind do sandbox; a referência “antes” é o resultado final confirmado da E4. A validação final derivou `traceflow_test` em memória, sem exibir credenciais ou usar o banco de desenvolvimento.

## ASVS, limitações e bloqueios para E6

`ASVS_BASELINE.md` mapeia controles aplicáveis e evidências, sem afirmar L2. Permanecem:

1. autenticação, sessão e autorização/BOLA ausentes;
2. convite previsível, reutilizável, sem hash/expiração/revogação e com resposta enumerável;
3. limiter em memória e trava de sync somente por instância;
4. proxy/TLS/headers do host SPA ainda dependentes do deploy;
5. secret manager, SBOM, scanner/dependency review no CI e monitoramento distribuído ausentes;
6. audit frontend residual de React Router RSC e cobertura visual pequena;
7. paginação/coleções e sync parcial preservados conforme escopo.

Não há bloqueio técnico da E5 para planejar a E6, mas os itens 1 e 2 são riscos críticos e devem abrir a próxima etapa. A E6 não foi iniciada.

## Confirmações de escopo

A branch permaneceu `daniel-dev`. Nenhuma migration foi criada. O schema Prisma não foi alterado. Nenhum endpoint `501` foi implementado ou removido. Nenhuma resposta de sucesso ou regra de negócio foi alterada. Nenhuma autenticação ou autorização foi implementada. Nenhum controle da E6/E7 foi antecipado. Nenhum segredo é retornado ou registrado. Nenhum mock foi incluído no runtime. Nenhum commit, push ou pull request foi realizado.
