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

## Compatibilidade pré-release

Wrappers `pages → features` e barrels públicos usados são fronteiras arquiteturais, não legado.
Aliases sem consumidor não permanecem por compatibilidade pré-release. A API de membros é
`membersApi`, e privacidade usa `/settings/privacy`. Novos aliases exigem consumidor, prazo e decisão
explícitos.

## Ownership de estilos

CSS continua convencional. Esta decisão não introduz CSS Modules, CSS-in-JS ou biblioteca nova.
Para novas implementações e alterações em estilos existentes, cada regra deve ter owner rastreável:

- componente shared → CSS junto do componente em `shared`;
- componente, page ou fluxo de domínio → CSS junto da feature correspondente;
- page adaptadora com apresentação própria → CSS junto da page;
- responsive rule → mesmo arquivo/owner do seletor que ela adapta;
- token, reset, elemento base ou regra transversal verdadeira → `frontend/src/styles/`.

`frontend/src/styles/` pode evoluir para `tokens.css`, `base.css` e `global.css`, sem exigir essa
separação de uma vez. `global.css` não é depósito de feature: novas implementações não adicionam
`.project-*`, `.settings-*`, `.auth-*`, `.kanban-*` ou seletores equivalentes específicos de domínio.
Overrides cross-feature são evitados; reutilização visual real deve virar shared component ou token.

Inline style só é usado para valor realmente calculado em runtime. Cor, espaçamento, layout e demais
estilos estáticos pertencem ao CSS do owner.

## Migração futura do `global.css`

O arquivo `frontend/src/styles/global.css` ainda concentra estilos base, shared e específicos de
features. Esta documentação não altera a UI nem move regras agora. Uma migração futura deve ocorrer
por owner, em mudanças pequenas, seguindo este roteiro:

1. mapear seletores, markup consumidor, media queries e overrides associados;
2. mover uma unidade coesa sem renomear classes ou reordenar regras sem necessidade;
3. preservar ordem de cascade, especificidade e breakpoints;
4. executar lint, Prettier, testes e build;
5. validar visualmente estados e breakpoints afetados antes de remover a origem.

Não faça split mecânico cego nem aproveite a migração para redesenhar a interface.
