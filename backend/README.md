# TRACEFLOW Backend

API REST responsável por regras de negócio, persistência, integração com GitHub e consolidação da rastreabilidade entre requisitos, tarefas e artefatos técnicos.

As regras transversais do produto estão em [Contexto e arquitetura](../TRACEFLOW_CONTEXTO_ARQUITETURA.md).

## Arquitetura

```txt
Routes -> Controller -> Service -> Repository -> Prisma -> MySQL
```

- **Routes:** registram caminhos, métodos e middlewares.
- **Controllers:** interpretam entradas HTTP e formatam respostas.
- **Services:** aplicam regras de negócio e coordenam casos de uso.
- **Repositories:** isolam consultas e mutações de persistência.
- **Prisma/MySQL:** modelam e armazenam os dados.

Octokit é acessado pela camada de serviço/cliente GitHub. Controllers não devem consultar Prisma ou APIs externas diretamente, e repositories não devem conter regras de negócio.

## Tecnologias

- Node.js e Express
- Prisma ORM e MySQL
- Octokit
- dotenv e cors

## Estrutura

```txt
backend/
├── prisma/
│   ├── migrations/
│   └── schema.prisma
└── src/
    ├── config/
    ├── database/
    ├── modules/
    │   ├── artifacts/
    │   ├── commits/
    │   ├── github/
    │   ├── issues/
    │   ├── projects/
    │   ├── pullRequests/
    │   ├── requirements/
    │   ├── tasks/
    │   └── traceability/
    ├── routes/
    ├── app.js
    └── server.js
```

## Configuração e execução

```bash
cd backend
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate deploy
npm run dev
```

Variáveis esperadas:

```env
DATABASE_URL="mysql://usuario:senha@localhost:3306/traceflow"
GITHUB_TOKEN="token_do_github"
PORT=3001
FRONTEND_URL="http://localhost:5173"
```

Use privilégio mínimo nas credenciais. Nunca registre `GITHUB_TOKEN`, `DATABASE_URL`, cabeçalhos de autorização ou dados pessoais em logs.

## Banco de dados e Prisma

```bash
npx prisma validate
npx prisma generate
npx prisma migrate deploy
npx prisma migrate status
```

Alterações de schema devem incluir migração revisável e compatível com os dados existentes. Não use `prisma migrate reset` como procedimento normal: ele apaga dados. Migrações destrutivas exigem plano explícito de compatibilidade, backup e recuperação.

## Módulos principais

- `projects`: projetos, membros, convites e integração inicial com repositórios.
- `github`: autenticação, listagem de repositórios e sincronização.
- `commits`, `pullRequests` e `issues`: artefatos importados.
- `artifacts`: visão consolidada dos artefatos do repositório.
- `tasks`: tarefas, Kanban e vínculos de rastreabilidade.
- `requirements`: requisitos, status e vínculo com tarefas.
- `traceability`: matriz e cadeia de rastreabilidade.

## Endpoints principais

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/github/auth/check` | Verifica autenticação com GitHub |
| GET | `/api/github/repositories` | Lista repositórios GitHub |
| POST | `/api/projects/from-github` | Cria projeto a partir de repositório |
| GET/POST | `/api/projects` | Lista/cria projetos conforme rota disponível |
| GET/PUT | `/api/projects/:id` | Consulta/atualiza projeto |
| POST | `/api/projects/:projectId/github/sync` | Sincroniza artefatos GitHub |
| GET | `/api/projects/:projectId/artifacts` | Lista artefatos |
| GET | `/api/projects/:projectId/commits` | Lista commits |
| GET | `/api/projects/:projectId/pull-requests` | Lista pull requests |
| GET | `/api/projects/:projectId/issues` | Lista issues |
| GET/POST | `/api/projects/:projectId/tasks` | Lista/cria tarefas |
| PUT/DELETE | `/api/tasks/:id` | Atualiza/exclui tarefa |
| PATCH | `/api/tasks/:id/move` | Move tarefa no Kanban |
| GET/POST | `/api/projects/:projectId/requirements` | Lista/cria requisitos |
| PUT/DELETE | `/api/requirements/:id` | Atualiza/exclui requisito |
| GET | `/api/projects/:projectId/traceability/requirements-matrix` | Matriz de rastreabilidade |
| GET | `/api/projects/:projectId/traceability/requirements/:requirementId` | Cadeia de um requisito |

Consulte os arquivos `*.routes.js` para o contrato efetivamente implementado. Mudanças de API devem validar entradas, usar códigos HTTP consistentes e preservar compatibilidade ou documentar a ruptura.

## Sincronização GitHub

A sincronização usa Octokit e persiste commits, pull requests e issues. O projeto registra última sincronização bem-sucedida, última tentativa, estado e erro resumido. Em falhas, o erro deve ser sanitizado e `githubLastSyncAt` não deve indicar sucesso.

Integrações externas precisam de timeout, tratamento de limite de requisições, falhas previsíveis e operações idempotentes quando aplicável. Não substitua indisponibilidade externa por dados mockados em produção.

## Segurança e LGPD

O backend deve seguir OWASP ASVS 5.0 Level 2 como referência inicial:

- validar tipo, formato, tamanho e faixa de toda entrada no limite da aplicação;
- usar Prisma parametrizado e nunca concatenar entrada em consultas;
- autenticar e autorizar cada recurso no servidor, inclusive por projeto;
- restringir CORS a origens confiáveis por ambiente;
- manter segredos fora do repositório e rotacioná-los quando expostos;
- retornar erros seguros, sem stack trace ou detalhes internos;
- aplicar limites de corpo, paginação, rate limiting e proteção contra abuso;
- registrar eventos de segurança sem tokens ou dados pessoais desnecessários.

Dados pessoais devem ter finalidade definida, coleta mínima, retenção controlada e mecanismo de correção/eliminação quando aplicável. Novos campos pessoais exigem avaliação de finalidade e base legal.

## Testes e validações

Mudanças devem adicionar testes unitários de services e regras de negócio, testes de integração para repositories/Prisma e testes de API para rotas críticas. APIs externas podem ser simuladas somente nos testes; o código executado em produção deve usar integrações reais.

Validações atuais:

```bash
npx prisma validate
npx prisma generate
find src -name '*.js' -exec node --check {} \;
```

A integração contínua executa as verificações disponíveis. À medida que suites de teste forem introduzidas, seus scripts `test` devem ser obrigatórios no workflow.

## Exclusão segura

Exclusões devem preservar consistência e respeitar retenção/LGPD. A exclusão de tarefa remove seus vínculos e movimentações, mas mantém requisitos e artefatos importados. A exclusão de requisito desvincula tarefas sem apagar tarefas ou artefatos. Qualquer mudança nessa semântica exige teste de integração e documentação.

## Definition of Done

Uma alteração de backend está concluída quando respeita as camadas, possui validação e autorização, trata erros sem vazar dados, inclui migração quando necessária, tem testes proporcionais ao risco, passa pela CI e atualiza documentação/contratos. Consulte a definição completa no documento de arquitetura.
