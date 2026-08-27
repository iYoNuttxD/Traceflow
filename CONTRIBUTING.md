# Contribuindo com o TRACEFLOW

## Requisitos locais

- versão principal do Node.js declarada em `.github/workflows/ci.yml` e npm com suporte ao lockfile
  versionado;
- mesma imagem/versão e configuração MySQL declaradas no workflow, em banco exclusivo de teste;
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

Prettier é a autoridade de formatação automática e ESLint cobre qualidade/erros estáticos. Não
reformate por preferência pessoal. Código novo deve ser compatível com o formatter e com
`architecture:check` quando a fronteira backend for afetada.

## Equivalência com a CI

| Check | Equivalente local |
|---|---|
| `Quality` | lint e `format:check` dos dois projetos, mais testes estruturais do workflow |
| `Backend Tests` | Prisma, migrations, arquitetura, segredos, unitários, integração e cobertura com MySQL real |
| `Frontend Tests` | lint, formatação, cobertura e build de produção |
| `Supply Chain` | política de `npm audit` e scanner de segredos |
| `Dependency Review` | análise do delta de dependências disponível somente no pull request |

Não declare uma execução local como `CI-equivalent` quando versão/configuração de Node ou MySQL e a
ordem dos gates relevantes não tiverem sido reproduzidas. O workflow de pull request também pode
avaliar um merge ref sintético entre base e head; diferencie esse resultado da branch local ao
diagnosticar falhas.

Para validar a política executável de dependências:

```bash
node --test scripts/check-npm-audit.test.mjs scripts/validate-ci.test.mjs
node scripts/check-npm-audit.mjs backend docs/security/npm-audit-exceptions.json
node scripts/check-npm-audit.mjs frontend docs/security/npm-audit-exceptions.json
```

Não execute `npm audit fix` automaticamente. Vulnerabilidades altas ou críticas bloqueiam, exceto advisory registrado com pacote, cadeia, justificativa, responsável e revisão ainda válida em `docs/security/npm-audit-exceptions.json`.

## Commits e TASK-ID

Use Conventional Commits preservando o type no início:

```text
type(scope): [TASK-ID] description
```

Exemplos:

```text
feat(projects): [TASK-128] add GitHub repository selection
fix(github): [TASK-142] prevent duplicate sync execution
docs(architecture): [TASK-160] document frontend style ownership
```

Types recomendados: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`, `perf` e `style`. Use
`style` com parcimônia e nunca para uma alteração que o Prettier resolve sozinho.

Scopes representam domínios, como `auth`, `github`, `projects`, `tasks`, `requirements`,
`traceability`, `members`, `privacy`, `database`, `frontend`, `ci` e `docs`; não use pessoa ou nome
genérico de arquivo.

Para commits normais de desenvolvimento, `[TASK-ID]` é obrigatório. Merge/revert automáticos e bots
como Dependabot são exceções quando tecnicamente aplicáveis. Um commit possui uma intenção/TASK
principal; relações secundárias vão no body como `Refs: TASK-...`, salvo necessidade comprovada.

O identificador facilita sugestão de rastreabilidade e revisão humana, mas não concede autorização
nem cria vínculo definitivo por si só. Não invente TASK-ID. Quando não houver mecanismo ou Task real
acessível, documente a exceção na PR e regularize os commits subsequentes.

## Segurança e pull requests

- nunca versione `.env`, tokens, senhas, chaves privadas ou segredos `VITE_*`;
- não inclua segredos em logs, fixtures, artefatos de cobertura ou descrições de PR;
- abra PR pequeno, descreva riscos e evidências e aguarde os checks obrigatórios;
- resolva conversas de revisão e atualize a branch antes do merge;
- avalie o impacto documental: atualize a fonte canônica na mesma mudança ou declare
  `Documentação: N/A`, sem edição cosmética;
- descreva comportamento/contrato, arquitetura, banco, segurança, autorização, integração, operação
  e RF afetados, além de validações executadas e limitações reais.
