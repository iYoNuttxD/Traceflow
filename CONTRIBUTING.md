# Contribuindo com o TRACEFLOW

## Requisitos locais

- Node.js 22 e npm com suporte ao lockfile versionado;
- MySQL 8.4 compatível, em banco exclusivo de teste;
- Git e acesso às dependências do registry npm.

Use `npm ci` separadamente em `backend` e `frontend`. Não remova nem regenere lockfiles sem uma alteração consciente de dependência. Nunca use o banco de desenvolvimento para testes destrutivos.

## Backend

Defina `TEST_DATABASE_URL` para um schema cujo nome identifique claramente teste e mantenha `DATABASE_URL` apontando para outro schema. Em seguida:

```bash
cd backend
npm ci
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

Não use `prisma migrate reset` no banco de desenvolvimento. Migrations devem ser aditivas/versionadas e devem aplicar do zero no banco isolado.

## Frontend

```bash
cd frontend
npm ci
npm run lint
npm run format:check
npm run test:coverage
npm run build
```

`npm run format` aplica a configuração versionada; revise o diff antes de manter mudanças mecânicas.

## Equivalência com a CI

| Check | Equivalente local |
|---|---|
| `Quality` | lint e `format:check` dos dois projetos, mais testes estruturais do workflow |
| `Backend Tests` | Prisma, migrations, arquitetura, segredos, unitários, integração e cobertura com MySQL real |
| `Frontend Tests` | lint, formatação, cobertura e build de produção |
| `Supply Chain` | política de `npm audit` e scanner de segredos |
| `Dependency Review` | análise do delta de dependências disponível somente no pull request |

Para validar a política executável de dependências:

```bash
node --test scripts/check-npm-audit.test.mjs scripts/validate-ci.test.mjs
node scripts/check-npm-audit.mjs backend docs/security/npm-audit-exceptions.json
node scripts/check-npm-audit.mjs frontend docs/security/npm-audit-exceptions.json
```

Não execute `npm audit fix` automaticamente. Vulnerabilidades altas ou críticas bloqueiam, exceto advisory registrado com pacote, cadeia, justificativa, responsável e revisão ainda válida em `docs/security/npm-audit-exceptions.json`.

## Segurança e pull requests

- nunca versione `.env`, tokens, senhas, chaves privadas ou segredos `VITE_*`;
- não inclua segredos em logs, fixtures, artefatos de cobertura ou descrições de PR;
- abra PR pequeno, descreva riscos e evidências e aguarde os checks obrigatórios;
- resolva conversas de revisão e atualize a branch antes do merge;
- quando um commit tratar uma Task conhecida, use o identificador canônico `[TASK-<ID>]` para permitir a sugestão revisável do RF41.
