# TRACEFLOW Backend

API REST em Node.js/Express responsável por identidade, autorização, projetos, GitHub, requisitos, tarefas, Kanban, rastreabilidade, auditoria e privacidade.

## Arquitetura

```text
Route → Controller → Service → Repository → Prisma → MySQL
                         └→ external client
```

Routes aplicam autenticação, CSRF, autorização e validação; controllers adaptam HTTP; services coordenam regras e transações; repositories encapsulam Prisma. O verificador `architecture:check` bloqueia dependências proibidas e reintrodução dos models removidos na E8.

## Instalação e configuração

```bash
cd backend
npm ci
cp .env.example .env
npx prisma validate
npx prisma generate
npx prisma migrate deploy
npm run dev
```

Use Node `22.22.0+` e MySQL 8.4 compatível. `.env.example` contém placeholders e defaults documentados; produção exige `GITHUB_TOKEN`, CORS explícito e SMTP. Nunca use `TEST_DATABASE_URL` igual a `DATABASE_URL`.

## Módulos

- `auth`, `authorization`: sessão opaca, CSRF e RBAC;
- `projects`: projeto, memberships, convites e compatibilidades legadas;
- `github`, `commits`, `pullRequests`, `issues`, `artifacts`: integração e leitura tipada;
- `requirements`, `tasks`, `traceability`: domínio e cadeia canônica;
- `audit`, `privacy`: trilha transversal e direitos técnicos do titular;
- `shared`: configuração, erros, logging/redaction, validação, segurança, e-mail e shutdown.

O contrato efetivo está em [API_CONTRACTS.md](../docs/api/API_CONTRACTS.md). Não use rotas, controller ou Prisma como atalho entre camadas.

## Banco e migrations

```bash
npx prisma validate
npx prisma generate
npx prisma migrate deploy
npx prisma migrate status
```

Para banco isolado cujo nome contenha `test`:

```bash
npm run db:test:migrate
npm run db:test:status
```

Há 25 migrations versionadas. Não edite migration aplicada e não use reset em desenvolvimento. Scripts E6/E8/E11 e privacidade são manutenção protegida, dry-run por padrão quando aplicável; consulte os relatórios da etapa e os runbooks antes de `--apply`.

## Qualidade

```bash
npm run lint
npm run format:check
npm run architecture:check
npm run security:secrets
npm run test:unit
npm run test:integration
npm run test:coverage
```

Integração/API usa MySQL real indicado por `TEST_DATABASE_URL`. A cobertura mínima global é 85% statements, 70% branches, 85% functions e 87% lines.

## Operação

- `npm start`: execução de produção do processo Express;
- `/health`: compatibilidade;
- `/health/live`: processo vivo;
- `/health/ready`: configuração e banco disponíveis;
- SIGINT/SIGTERM: shutdown controlado e desconexão Prisma.

Runbooks: [GitHub](../docs/runbooks/GITHUB_INTEGRATION.md), [migrations](../docs/runbooks/DATABASE_MIGRATIONS.md), [backup](../docs/runbooks/BACKUP_RESTORE.md) e [incidentes](../docs/runbooks/INCIDENT_RESPONSE.md).

## Legado preservado

`ProjectMember`, `accessCode/inviteLink`, aliases GitHub, `Task.responsible`, `TaskMovement.movedBy` e `projectMemberId` permanecem somente onde contratos ou dados históricos exigem. Identidade e autorização usam `User`, `ProjectMembership`, `responsibleUserId` e `movedByUserId`. Não associe snapshots por nome.
