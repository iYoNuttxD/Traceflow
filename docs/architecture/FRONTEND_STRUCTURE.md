# Estrutura frontend do TRACEFLOW

## Direção permitida

```text
app/routes → pages → features/<domain> → shared + api/http-client
```

- `app/routes` declara rotas e providers de composição.
- `pages` é um adaptador fino entre a rota e uma ou mais features.
- `features/<domain>/pages` coordena seções do fluxo daquele domínio.
- `features/<domain>/api` descreve contratos HTTP do domínio.
- `features/<domain>/hooks` controla consultas, mutações e estados do fluxo.
- `features/<domain>/components` contém apresentação específica do domínio.
- `shared` contém componentes, hooks e utilitários independentes.
- `api/http-client.js` é a única infraestrutura Axios, CSRF, timeout e 401.

`shared` não importa feature ou page. Uma feature não importa internals de outra; integrações usam o `index.js` público ou são coordenadas pela page. Pages não importam Axios ou o cliente HTTP. O verificador arquitetural comprova essas regras.

## Estrutura vigente

```text
src/
├── app/routes/
│   ├── AppRoutes.jsx
│   └── lazy-route.js
├── api/
│   └── http-client.js
├── pages/                     # adaptadores finos de rota
├── features/
│   ├── auth/
│   ├── github/
│   ├── members/
│   ├── privacy/
│   ├── projects/
│   ├── requirements/
│   ├── tasks/
│   └── traceability/
└── shared/
    ├── components/
    ├── hooks/
    └── services/
```

Somente pastas com implementação real devem existir.

## Rotas e chunks

`AppRoutes` declara as páginas com `React.lazy` por meio do adaptador mínimo `lazyNamed`. Um único `Suspense` na fronteira das rotas fornece fallback anunciado por `role="status"`; o `ErrorBoundary` global captura também falhas de importação dinâmica. `ProtectedRoute`, restauração da sessão, CSRF e os providers globais permanecem fora dos chunks de página.

O build separa as telas públicas e protegidas, os módulos de domínio e o grafo. `TraceabilityFlow` e `@xyflow/react` são alcançados apenas pelo chunk de rastreabilidade e não pertencem à entrada inicial.

## Consolidação de Tasks e Kanban

As screens de Tasks e Kanban coordenam estado e casos de uso, enquanto componentes do próprio domínio apresentam responsabilidades delimitadas:

- `TaskMetrics` e `TaskList` apresentam resumo, tarefas e vínculos;
- `KanbanBoard` apresenta colunas e cartões com interação por teclado e drag-and-drop;
- `MovementHistory` apresenta filtros e paginação do backend;
- `TaskDetailsPanel` apresenta o detalhe e delega mutações;
- `kanban-display` centraliza somente labels e formatação de apresentação.

A restauração de sessão coalesce chamadas concorrentes e as cargas iniciais de Tasks/Kanban são protegidas contra a segunda execução de efeitos em desenvolvimento, sem introduzir cache global.

## Cliente HTTP

Toda API de domínio usa `httpClient`. Queries recebem `params` e, quando obsoletas, `signal`. A UI consome erros normalizados com `status`, `code`, `message`, `fieldErrors` e `requestId`. 401 encerra a sessão local; 403 mantém a sessão e é apresentado como acesso restrito.

## Estado e acessibilidade

- `LoadingState`, `EmptyState`, `ErrorState` e `ForbiddenState` são mutuamente exclusivos.
- `FeedbackRegion` anuncia mensagens por semântica, não apenas por cor.
- `ConfirmProvider` substitui confirmação nativa e gerencia foco/Escape.
- `ErrorBoundary` trata falhas de renderização, não erros HTTP.
- Formulários associam label/controle/erro e focam o primeiro campo inválido.
- Rotas públicas de login/cadastro/recuperação usam `GuestOnlyRoute`; autenticação restaurada redireciona para `/projects` sem loop.
- Pages de autenticação são adaptadores finos para screens em `features/auth/pages`; força de senha é informativa e o backend continua autoritativo.
- Links externos em nova aba usam `noopener noreferrer`.

## Compatibilidade

Reexports legados podem permanecer apenas como adaptadores sem regra, desde que não sejam consumers de runtime. Sua remoção deve ocorrer após busca completa e regressão verde. Não se usa `TODO(E2.9)` como justificativa permanente.
