# Convenções de módulos do TRACEFLOW

## Objetivo

Esta convenção torna verificável a direção `Route → Controller → Service → Repository → Database` sem introduzir uma arquitetura paralela. A organização é incremental: arquivos só são divididos quando existe responsabilidade coesa, proteção de testes e uma única fonte de verdade.

## Responsabilidades e direção

```text
route → controller → service → repository → Prisma/MySQL
                         ↓
                  external client
```

### Route

- Declara método, caminho e middlewares e encaminha ao controller.
- Pode importar schemas HTTP do próprio módulo e o middleware compartilhado de validação.
- Não acessa Prisma, database, repository ou client externo.
- Valida formato, tipo, presença, tamanho e coerção declarada; não valida invariantes, monta query ou executa persistência.

### Controller

- Extrai `params`, `query` e `body`, chama service e preserva a resposta HTTP atual.
- Não acessa Prisma, repository ou Octokit.
- Não contém regra de negócio nem constrói query de banco.
- Encaminha falhas ao middleware global por `asyncHandler`, preservando a mensagem pública histórica como fallback compatível.

### Service

- Executa casos de uso, invariantes e coordenação entre repositories e clients.
- Não conhece `req`, `res`, DOM ou objetos Axios.
- Pode coordenar transações pela abstração existente, sem construir resposta HTTP.

### Repository

- Encapsula consultas e persistência Prisma orientadas às necessidades do domínio.
- Não conhece HTTP, controllers, routes ou componentes frontend.
- Não devolve status HTTP nem mensagens destinadas à interface.
- Não existe repository genérico: cada operação deve representar uma necessidade real.

### External client

- Encapsula uma integração, como Octokit, em operações pequenas e previsíveis.
- Não persiste com Prisma e não decide regra de negócio do TRACEFLOW.
- Não fornece fallback falso ou mock no runtime de produção.

## Organização e nomes

```text
src/modules/<domain>/
├── <domain>.routes.js
├── <domain>.controller.js
├── <domain>.service.js
├── <domain>.repository.js
├── <domain>.schema.js       # validação/normalização específica, quando necessária
├── <domain>.validation.js   # contrato HTTP com Zod, quando há entrada
├── <domain>.mapper.js       # conversão relevante, quando necessária
├── <domain>.calculator.js   # cálculo puro e testável, quando necessário
├── services/                # casos de uso coesos, quando o service crescer
└── index.js                 # API pública explícita do módulo
```

Arquivos e subpastas opcionais não devem ser criados vazios. Nomes usam singular para a unidade principal (`project.service.js`) e o caso de uso no prefixo quando dividido (`project-members.service.js`).

## API pública e `index.js`

- `index.js` exporta somente superfícies destinadas a consumidores externos ao módulo, normalmente routes e service.
- Reexports curinga são evitados para não expor internals acidentalmente.
- Arquivos internos do próprio módulo usam imports diretos e não importam o próprio `index.js`.
- Repositories não são publicados pelo índice apenas por conveniência.

Exemplo real:

```js
export { projectService } from './project.service.js';
export { default as projectRoutes } from './project.routes.js';
```

## Compatibilidade incremental

Uma movimentação mantém o caminho antigo somente quando há consumidores ainda não migrados. O arquivo antigo deve conter exclusivamente um reexport, um `TODO(E2.9)` e nenhuma implementação duplicada.

Exemplo no frontend:

```js
// TODO(E2.9): remover após migração dos consumidores.
export * from '../features/projects/components/ProjectForm.jsx';
```

No backend, `project.service.js` funciona temporariamente como fachada e delega aos casos de uso em `services/`. A regra existe em um único arquivo.

## Dependências proibidas

- route → repository, Prisma/database ou client;
- controller → repository, Prisma/database ou client;
- repository → route, controller ou Express;
- frontend → qualquer internal do backend;
- `shared` → módulo de domínio;
- middleware → repository;
- error handler → service de domínio;
- logger → Express;
- schema/validation → controller, repository ou Express;
- middleware de validação → service de domínio;
- `frontend/src/shared` → pages;
- ciclo entre arquivos do mesmo módulo;
- import do `index.js` do próprio módulo por um internal desse módulo.
- gravação de `AuditEvent` fora do adapter `audit.repository` ou da retenção controlada;
- import de scripts operacionais pelo runtime.

## Prevenção de ciclos

1. A dependência sempre aponta para baixo na cadeia.
2. Casos de uso irmãos compartilham funções puras ou repository; não se importam mutuamente quando isso formar ciclo.
3. O índice é uma fronteira externa, nunca um atalho interno.
4. `npm run architecture:check` percorre imports estáticos e falha em ciclos evidentes ou violações mínimas obrigatórias.

## Exemplos do TRACEFLOW

- `github.service.js → github.client.js`: service coordena e o client encapsula Octokit.
- `github-app.service.js → github.repository.js + github.client.js`: state/metadados ficam no repository; tokens temporários existem somente no credential provider/client.
- `githubSync.service.js → commit/pullRequest/issue repositories`: orquestração externa permanece no service e persistência nos repositories.
- `traceability.service.js → traceability.mapper.js → traceability.calculator.js`: coordenação, DTO e cálculo são responsabilidades distintas.
- `project.service.js → services/project-*.service.js`: agregador público do domínio, sem segunda implementação nem alias de contrato.
- `privacy.service.js → privacy.repository.js → audit.repository.js`: direitos do titular coordenam adapters; somente o adapter central persiste auditoria.

## Verificação

```bash
cd backend
npm run architecture:check
```

O verificador imprime arquivo, regra e import causador e encerra com código diferente de zero diante de violação. A fixture inválida em `backend/test/fixtures/architecture/invalid` comprova route/controller importando repository, repository importando controller e ciclo interno.
