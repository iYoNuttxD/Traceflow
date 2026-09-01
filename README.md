# TRACEFLOW

TRACEFLOW é uma aplicação web para relacionar requisitos, tarefas e evidências técnicas importadas do GitHub. A cadeia canônica é:

```text
Requirement → Task → Commit | PullRequest | Issue
```

O produto atual inclui projetos e memberships, autenticação por sessão, integração GitHub, requisitos, tarefas, Kanban, histórico, rastreabilidade, sugestões revisáveis `[TASK-<ID>]`, auditoria e operações de privacidade. O [catálogo da API](docs/api/API_CONTRACTS.md) e a [matriz RF–código–teste](docs/traceability/RF_TECHNICAL_MATRIX.md) distinguem o que está implementado do trabalho futuro.

## Arquitetura

```text
React/Vite → API REST/Express → Route → Controller → Service → Repository → Prisma → MySQL
                                           └→ GitHub App client por instalação/Octokit → GitHub API
```

- O frontend usa pages finas, features por domínio, componentes compartilhados e um único client Axios.
- O backend valida e autoriza no limite HTTP; regras ficam em services e Prisma somente em repositories autorizados.
- Sessões são opacas e server-side; mutações autenticadas exigem CSRF.
- `ProjectMembership` é a fonte de autorização. Ausência de membership retorna `404`; papel insuficiente retorna `403`.
- `Commit`, `PullRequest`, `Issue`, `TaskCommit`, `TaskIssue` e `Task.pullRequestId` são canônicos.
- `ProjectGitHubIntegration` concentra identidade, configuração e estado do repositório; branches de commit usam `GitBranch` + `CommitBranch`.

Consulte a [arquitetura vigente](docs/architecture/SYSTEM_ARCHITECTURE.md), as [convenções backend](docs/architecture/MODULE_CONVENTIONS.md) e a [estrutura frontend](docs/architecture/FRONTEND_STRUCTURE.md).

## Tecnologias

| Área | Stack |
|---|---|
| Frontend | React 19, Vite 8, React Router 8, Axios, `@xyflow/react` |
| Backend | Node.js, Express 4, Zod, Prisma 6, Octokit |
| Dados | MySQL 8.4 compatível, migrations Prisma versionadas |
| Segurança | Argon2id, sessão opaca, CSRF, Helmet, CORS allowlist, rate limiting |
| Engenharia | Vitest, Testing Library, ESLint, Prettier, GitHub Actions |

## Pré-requisitos

- Node.js `22.22.0` ou superior dentro da linha 22;
- npm compatível com os lockfiles;
- MySQL 8.4 compatível;
- GitHub App configurada com o menor conjunto de permissões de leitura necessário, quando a integração for usada.

## Instalação

Use instalações determinísticas separadas:

```bash
cd backend
npm ci
cp .env.example .env

cd ../frontend
npm ci
```

Não use `npm run install:all` para reproduzir a CI: esse script histórico usa `npm install`.

## Configuração

O backend valida a configuração no startup. O arquivo [backend/.env.example](backend/.env.example) lista todas as variáveis. As essenciais em desenvolvimento são:

```env
NODE_ENV=development
DATABASE_URL="mysql://usuario:senha@localhost:3306/traceflow"
GITHUB_APP_ID="123456"
GITHUB_APP_CLIENT_ID="Iv1.valor_artificial"
GITHUB_APP_PRIVATE_KEY_BASE64="base64_da_chave_privada"
GITHUB_APP_CALLBACK_URL="http://localhost:3001/api/github-app/callback"
GITHUB_LOGIN_CALLBACK_URL="http://localhost:3001/api/auth/github/callback"
FRONTEND_URL="http://localhost:5173"
```

Para testes de banco, defina `TEST_DATABASE_URL` com nome que contenha `test` e que seja diferente de `DATABASE_URL`. Valores `VITE_*` são públicos; o frontend aceita apenas `VITE_API_URL` e `VITE_API_TIMEOUT_MS`, sem segredos.

## Banco e migrations

```bash
cd backend
npx prisma validate
npx prisma generate
npx prisma migrate deploy
npx prisma migrate status
```

Na CI e em testes locais isolados:

```bash
npm run db:test:migrate
npm run db:test:status
```

Não use `prisma migrate reset` em banco com dados. Antes de mudança destrutiva, siga o [runbook de banco](docs/runbooks/DATABASE_MIGRATIONS.md) e o [runbook de backup/restore](docs/runbooks/BACKUP_RESTORE.md).

## Execução local

Em terminais separados:

```bash
cd backend
npm run dev
```

```bash
cd frontend
npm run dev
```

- API: `http://localhost:3001`
- SPA: `http://localhost:5173`
- Probes: `/health`, `/health/live` e `/health/ready`

## Gates de qualidade

Backend:

```bash
cd backend
npm run lint
npm run format:check
npx prisma validate
npx prisma generate
npm run db:test:migrate
npm run db:test:status
npm run architecture:check
npm run security:secrets
npm run test:unit
npm run test:integration
npm run test:coverage
```

Frontend:

```bash
cd frontend
npm run lint
npm run format:check
npm run test:coverage
npm run build
```

Supply chain, a partir da raiz:

```bash
node --test scripts/check-npm-audit.test.mjs scripts/validate-ci.test.mjs
node scripts/check-npm-audit.mjs backend docs/security/npm-audit-exceptions.json
node scripts/check-npm-audit.mjs frontend docs/security/npm-audit-exceptions.json
```

Os checks obrigatórios são `Quality`, `Backend Tests`, `Frontend Tests`, `Supply Chain` e, em pull requests, `Dependency Review`. Consulte [CONTRIBUTING.md](CONTRIBUTING.md).

## Integração GitHub

GitHub OAuth é opcional e serve apenas para cadastro/login, vínculo de identidade e reautenticação sensível. Repositórios e artefatos usam exclusivamente GitHub App por instalação, inclusive para contas locais sem `GitHubIdentity`. O callback comprova o acesso do ator à Installation sem transformar essa prova em identidade TraceFlow; leitura e sync usam Installation Access Token gerado sob demanda e nunca persistido. A sincronização permanece manual, paginada, idempotente e preserva artefatos. Projetos anteriores à L1 ficam `RECONNECT_REQUIRED` até um OWNER reconectar. Operação, permissões e incidentes estão no [runbook GitHub](docs/runbooks/GITHUB_INTEGRATION.md).

## Segurança e privacidade

- Não versione `.env`, tokens, dumps ou dados pessoais.
- Não trate CORS ou controles da UI como autorização.
- Não exponha hashes, cookies, `authorEmail`, stacks ou payloads externos.
- O projeto usa OWASP ASVS 5.0 como referência, sem alegar conformidade total.
- Os artefatos de LGPD são técnicos e dependem de validação jurídica/operacional.

Evidências: [ASVS](docs/security/ASVS_BASELINE.md), [threat model](docs/security/THREAT_MODEL.md), [dados pessoais](docs/privacy/PERSONAL_DATA_INVENTORY.md), [retenção](docs/privacy/DATA_RETENTION_POLICY.md) e [incidentes](docs/runbooks/INCIDENT_RESPONSE.md).

## Limitações conhecidas

- `DELETE /api/projects/:id` permanece `501`; não existe política homologada de exclusão de projeto.
- `Project.accessCode` permanece como capability atual; o link de ingresso é derivado e não persistido.
- `Task.responsible` e `TaskMovement.movedBy` permanecem como snapshots históricos, sem valor de identidade ou autorização.
- O rate limiter e a trava de sincronização são por processo; produção horizontal exige store/lock distribuído.
- Secret manager, store/lock distribuído e configuração operacional real da GitHub App/SMTP não são fornecidos pelo repositório.
- TLS, headers do host da SPA, backups agendados, observabilidade e branch protection dependem do ambiente operacional.
- Não há SBOM/proveniência automatizada, E2E em navegador ou gate automatizado de licenças.

## Estrutura

```text
backend/src/modules/       domínios e camadas da API
backend/src/shared/        infraestrutura transversal
backend/prisma/            schema e 40 migrations
frontend/src/features/     domínios da SPA
frontend/src/shared/       UI, hooks e serviços compartilhados
docs/architecture/         arquitetura e ADRs
docs/api/                  contratos HTTP
docs/runbooks/             operação e incidentes
docs/security/             evidências e políticas de segurança
docs/privacy/              inventário e ciclo de vida de dados
docs/refactoring/          relatórios E0–E15
```
