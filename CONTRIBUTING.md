# Contribuindo com o TRACEFLOW

## Requisitos locais

- versão principal do Node.js declarada em `.github/workflows/ci.yml` e npm com suporte ao lockfile
  versionado;
- mesma imagem/versão e configuração MySQL declaradas no workflow, em banco exclusivo de teste;
- Git e acesso às dependências do registry npm.

Use `npm ci` separadamente em `backend` e `frontend`. Não remova nem regenere lockfiles sem uma alteração consciente de dependência. Nunca use o banco de desenvolvimento para testes destrutivos.

## Fontes canônicas e decisões técnicas

Para requisitos, RFs e casos de uso, consulte o documento oficial do TCC indicado em
`TRACEFLOW_CONTEXTO_ARQUITETURA.md`. Para o estado executável, confronte código, migrations e testes
com a arquitetura e os ADRs vigentes, os contratos de API, a matriz de autorização, a matriz de
rastreabilidade, as convenções de módulos e as políticas aplicáveis em `docs/`.

Roadmaps, deliveries, refactoring e relatórios históricos fornecem contexto, mas não substituem uma
fonte vigente. Quando houver divergência, registre a lacuna e encaminhe a decisão ao documento
canônico correspondente em vez de escolher silenciosamente uma versão.

Contribuidores podem decidir escolhas técnicas locais, reversíveis e inequívocas dentro dos padrões
existentes. Mudanças de regra de negócio, permissão, cardinalidade, lifecycle, retenção, escopo,
autorização ou arquitetura relevante exigem decisão explícita e atualização da fonte canônica antes
da implementação. A evolução esperada é:

```text
decisão/requisito → arquitetura/ADR/contrato → código/testes → documentação afetada
```

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

## Commits e rastreabilidade

Use Conventional Commits preservando o type no início:

```text
type(scope): description
type(scope): [TASK-<ID>] description
```

Exemplos:

```text
feat(projects): add GitHub repository selection
fix(github): [TASK-142] prevent duplicate sync execution
docs(architecture): document frontend style ownership
```

Types recomendados: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`, `perf` e `style`. Use
`style` com parcimônia e nunca para uma alteração que o Prettier resolve sozinho.

Scopes representam domínios, como `auth`, `github`, `projects`, `tasks`, `requirements`,
`traceability`, `members`, `privacy`, `database`, `frontend`, `ci` e `docs`; não use pessoa ou nome
genérico de arquivo.

Quando existir uma Task real relacionada à mudança, `[TASK-ID]` pode ser incluído para exercitar e
facilitar a rastreabilidade da plataforma. O identificador é opcional: sua ausência não bloqueia
commit ou PR, não concede autorização e não cria vínculo definitivo por si só. Não invente TASK-ID.
Um commit deve manter uma intenção principal; relações secundárias podem ir no body como
`Refs: TASK-...` quando forem úteis.

## Segurança e pull requests

- nunca versione `.env`, tokens, senhas, chaves privadas ou segredos `VITE_*`;
- não inclua segredos em logs, fixtures, artefatos de cobertura ou descrições de PR;
- abra PR pequeno, descreva riscos e evidências e aguarde os checks obrigatórios;
- resolva conversas de revisão e atualize a branch antes do merge;
- avalie o impacto documental: atualize a fonte canônica na mesma mudança ou declare
  `Documentação: N/A`, sem edição cosmética;
- descreva comportamento/contrato, arquitetura, banco, segurança, autorização, integração, operação
  e RF afetados, além de validações executadas e limitações reais.
