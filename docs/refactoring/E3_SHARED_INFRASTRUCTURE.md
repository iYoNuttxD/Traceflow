# E3 — Configuração, erros, respostas e logging compartilhados

## Identificação e resultado

- **Branch:** `daniel-dev`
- **Commit inicial:** `2ac8421c98a83fcc39e45cb8e62ba27cc3322d52`
- **Data:** 24/07/2026
- **Estado inicial:** árvore limpa; branch local um commit à frente de `origin/daniel-dev` e sem commits remotos ausentes (`+1/-0`).
- **Alterações locais preexistentes:** nenhuma.
- **Resultado:** **CONCLUÍDA**. A infraestrutura compartilhada foi implementada e todas as validações previstas passaram.

## Objetivo e decisões

A E3 centralizou configuração, contexto HTTP, erros e observabilidade sem alterar regras de negócio, respostas de sucesso, schema Prisma ou os sete endpoints `501`. Foram usadas apenas APIs nativas de JavaScript/Node e as dependências já instaladas; nenhuma dependência foi adicionada.

O contrato de erro histórico conhecido `{ "message": "..." }` foi mantido exatamente. Todas as respostas recebem `X-Request-Id`; apenas a nova resposta 404 e erros inesperados incluem `code` e `requestId` no corpo. Não foi criado envelope de sucesso nem helper de resposta genérico, pois isso não reduziria duplicação sem ampliar o risco contratual.

## Estrutura criada

```text
backend/src/
├── middlewares/
│   ├── error-handler.middleware.js
│   ├── not-found.middleware.js
│   └── request-context.middleware.js
└── shared/
    ├── errors/
    │   ├── app-error.js
    │   ├── domain-error.js
    │   ├── error-codes.js
    │   └── index.js
    ├── http/
    │   ├── async-handler.js
    │   ├── health.js
    │   └── index.js
    ├── logger/
    │   ├── logger.js
    │   ├── redaction.js
    │   └── index.js
    └── runtime/
        ├── graceful-shutdown.js
        └── index.js

frontend/src/shared/services/
└── http-error.js
```

O antigo placeholder `backend/src/shared/README.md` foi substituído pelos módulos compartilhados efetivamente utilizados.

## Configuração de ambiente

`backend/src/config/env.js` expõe um objeto imutável e uma função testável `createEnvironment`. São mapeadas `NODE_ENV`, `PORT`, `DATABASE_URL`, `TEST_DATABASE_URL`, `GITHUB_TOKEN` e `FRONTEND_URL`.

- `NODE_ENV` aceita `development`, `test` ou `production`.
- `PORT` precisa ser inteiro entre 1 e 65535.
- URLs de banco precisam usar MySQL; em teste, `TEST_DATABASE_URL` pode substituir `DATABASE_URL`.
- `FRONTEND_URL` precisa ser uma URL HTTP(S).
- `GITHUB_TOKEN` é obrigatório em produção e opcional nos ambientes em que o client real não é inicializado.
- Falhas lançam `ConfigurationError` sem incluir valores recebidos.

`.env.example` e `.env.test.example` documentam `NODE_ENV`; valores reais e credenciais não foram alterados nem registrados. A única leitura direta de `process.env` em runtime permanece na fronteira de configuração central.

## Erros e catálogo público

`AppError` concentra mensagem pública, status, código estável, detalhes internos opcionais, causa, classificação operacional e política de exposição. As subclasses utilizadas são `DomainError`, `ConfigurationError`, `NotFoundError` e `ExternalServiceError`.

O catálogo inicial contém: `VALIDATION_ERROR`, `RESOURCE_NOT_FOUND`, `PROJECT_NOT_FOUND`, `REQUIREMENT_NOT_FOUND`, `TASK_NOT_FOUND`, `GITHUB_AUTH_FAILED`, `GITHUB_RATE_LIMITED`, `EXTERNAL_SERVICE_ERROR`, `CONFLICT`, `CONFIGURATION_ERROR`, `INTERNAL_ERROR` e `ROUTE_NOT_FOUND`.

As antigas classes locais de erro de Projects, Requirements, Tasks, Traceability, Artifacts, Commits, Pull Requests, Issues e sincronização GitHub agora usam a base compartilhada. Não houve alteração das mensagens ou status públicos. Erros GitHub são normalizados antes de logging/persistência, preservando as mensagens já caracterizadas em `githubLastSyncError`. Não foi introduzido um mapeamento genérico de toda falha Prisma: apenas os comportamentos já tratados pelos casos de uso permanecem mapeados, evitando transformar falhas desconhecidas em `400`.

## Request ID, 404 e middleware global

O primeiro middleware aceita `X-Request-Id` somente com caracteres seguros e até 64 posições; valores ausentes ou inválidos são substituídos por `crypto.randomUUID()`. O identificador fica em `req.context`, volta no header e integra logs e erros.

Após as rotas, o middleware 404 retorna `404` com:

```json
{
  "message": "Rota não encontrada.",
  "code": "ROUTE_NOT_FOUND",
  "requestId": "<uuid>"
}
```

O error handler reconhece `AppError` e erros legados com `statusCode`, respeita `headersSent`, preserva status e mensagem conhecidos e sanitiza a mensagem. Falhas inesperadas retornam `500`, `INTERNAL_ERROR`, mensagem genérica e request ID; stack, Prisma, SQL, headers e objetos Octokit não são enviados ao cliente.

## Logging e redaction

O logger escreve um JSON por evento com `timestamp`, `level`, `message`, `environment` e, quando disponíveis, `requestId`, método, caminho, status, duração e código de erro. Em teste o writer padrão é silencioso e pode ser injetado para asserções.

A redaction recursiva é case-insensitive para `authorization`, `cookie`, `set-cookie`, `password`, `senha`, `token`, `githubToken`, `GITHUB_TOKEN`, `DATABASE_URL`, `secret`, `accessCode`, `inviteLink`, `authorEmail` e `email`. E-mails são mascarados; URLs MySQL e tokens contidos em texto também são sanitizados. Body e headers completos nunca entram automaticamente no logger. Stack é apenas interna e somente fora de produção.

Todos os `console.log`, `console.error` e `console.warn` foram removidos do runtime backend. As ocorrências restantes de `new Error` ficam em controle interno da infraestrutura de configuração/readiness/shutdown e nunca formam resposta pública.

## Controllers e services migrados

Controllers de Projects, Requirements, Tasks, Traceability, GitHub e Artifacts usam `asyncHandler` e encaminham falhas ao middleware global. O fallback histórico de cada handler é informado ao wrapper, de modo que erros conhecidos mantenham exatamente o contrato anterior. Os handlers `501` continuam diretos e inalterados.

Services e schemas de domínio passaram a herdar de `DomainError`; nenhum service ou controller lê `process.env`. O client GitHub lê apenas a configuração central e continua substituível nos testes. Nenhum mock ou fallback falso foi incluído no runtime.

## Health, liveness e readiness

- `GET /health`: contrato histórico preservado — `200`, `status: "ok"` e a mesma mensagem.
- `GET /health/live`: novo endpoint de infraestrutura, `200` e `{ "status": "ok" }`.
- `GET /health/ready`: verifica configuração carregada e conexão Prisma/MySQL com `SELECT 1`; retorna `200`/`ready` ou `503`/`unavailable`, sem consultar GitHub ou expor a causa.

No startup real, os três endpoints retornaram `200`; rota desconhecida retornou `404`; `DELETE /api/projects/1` continuou retornando `501` com o mesmo corpo.

## Shutdown controlado

`server.js` registra `SIGINT` e `SIGTERM`. A função compartilhada evita execução duplicada, para de aceitar conexões, fecha o servidor HTTP, desconecta o Prisma, registra início/conclusão e possui timeout de segurança que encerra conexões remanescentes. O teste unitário não envia sinais ao processo principal. No ensaio real, `SIGTERM` encerrou o processo com código zero e registrou as duas fases do shutdown.

## Frontend

`normalizeApiError` foi adicionado a `frontend/src/shared/services/http-error.js` e exportado pelas APIs compartilhada e HTTP existentes. Ele produz `{ message, status, code, requestId, isNetworkError }`, distingue falha HTTP de rede e aceita request ID do corpo ou header. A adoção é opt-in: nenhuma página, mensagem, rota, layout ou interceptor de sessão foi alterado nesta etapa.

## Verificação arquitetural

O script existente foi ampliado sem dependência adicional. Além das regras E2, agora reprova:

- `shared` backend importando módulo de domínio;
- middleware importando repository;
- logger importando Express;
- error handler importando service de domínio;
- `frontend/src/shared` importando pages.

Fixtures controladas e o teste unitário demonstram a falha dessas regras. O código real passou com zero violações.

## Testes adicionados

Foram adicionados 26 testes: 23 backend e 3 frontend.

- configuração válida/inválida, segredo omitido e seleção do banco de teste;
- defaults, causa e serialização pública de `AppError`;
- geração, aceitação e substituição de request ID;
- erro operacional, inesperado e `headersSent`;
- 404 seguro e regressão dos `501`;
- formato do logger e redaction de token, banco e e-mail;
- normalização de erro GitHub;
- liveness/readiness disponível e indisponível;
- shutdown controlado e idempotente;
- normalização frontend para HTTP, header e rede.

Resultado final: 72 testes backend (35 unitários e 37 integração/API) e 15 frontend; 87 testes no total.

## Cobertura antes e depois

| Área | Momento | Statements | Branches | Functions | Lines |
|---|---|---:|---:|---:|---:|
| Backend | Antes | 66,06% | 44,61% | 70,11% | 66,66% |
| Backend | Depois | 71,54% | 54,49% | 73,07% | 72,64% |
| Frontend | Antes | 10,93% | 12,74% | 9,74% | 11,24% |
| Frontend | Depois | 11,17% | 13,97% | 9,93% | 11,49% |

Os módulos shared críticos possuem cobertura alta: env 96% de statements, errors 100%, middlewares 97,05%, HTTP 89,47%, logger/redaction 78,12% e runtime 70,96%. Nenhum arquivo funcional foi excluído para elevar percentuais.

## Validações finais

| Comando | Resultado |
|---|---|
| Backend `npm ci` | Aprovado; 236 pacotes instalados do lockfile, sem alteração de dependências. |
| `npx prisma validate` | Aprovado; schema válido e inalterado. |
| `npx prisma generate` | Aprovado. |
| `npm run architecture:check` | Aprovado; zero violações no código real. |
| Backend `npm test` | 11 arquivos, 72 testes aprovados. |
| Backend `npm run test:unit` | 9 arquivos, 35 testes aprovados. |
| Backend `npm run test:integration` | 2 arquivos, 37 testes aprovados em `traceflow_test`. |
| Backend `npm run test:coverage` | Aprovado; cobertura registrada acima. |
| Backend `npm start` | Aprovado; endpoints reais e `SIGTERM` validados. |
| Frontend `npm ci` | Aprovado; 180 pacotes instalados do lockfile. |
| Frontend `npm test` | 6 arquivos, 15 testes aprovados. |
| Frontend `npm run test:coverage` | Aprovado; cobertura registrada acima. |
| Frontend `npm run build` | Aprovado; permanece o aviso conhecido de chunk acima de 500 kB. |

A primeira tentativa de `prisma validate` no sandbox não conseguiu atualizar o cache global (`EPERM`); a repetição autorizada fora dessa restrição passou. Uma execução intermediária de testes HTTP também exigiu permissão de bind local. Não foram falhas do projeto.

## Limitações e bloqueios para E4

- A validação completa de body, params e query permanece nos pontos atuais; sua centralização pertence à E4.
- O mapeamento Prisma continua deliberadamente específico aos casos já conhecidos.
- A normalização frontend ainda não foi aplicada em massa às páginas; isso evita alteração visual/contratual e prepara trabalho posterior.
- Readiness verifica o banco em cada chamada e não inclui timeout próprio nesta etapa.
- CORS aberto, headers de segurança, rate limit, autenticação e autorização permanecem fora do escopo e devem ser tratados nas etapas previstas.
- A cobertura de módulos legados de Artifacts/Commits/Issues/Pull Requests e de páginas frontend permanece baixa.

Não há bloqueio da infraestrutura E3 para iniciar a E4. A E4 não foi iniciada nesta execução.

## Confirmações de escopo

A branch permaneceu `daniel-dev`. Nenhuma migration foi criada. O schema Prisma não foi alterado. Nenhum endpoint `501` foi implementado ou removido. Nenhum contrato de sucesso foi alterado. Nenhuma regra de negócio foi alterada. Nenhuma autenticação ou autorização foi implementada. Nenhum controle da E5 foi antecipado. Nenhum segredo é retornado ou registrado. Nenhum mock foi incluído no runtime. Nenhuma dependência de runtime foi adicionada. Nenhum commit foi criado. Nenhum push foi realizado. Nenhum pull request foi aberto.
