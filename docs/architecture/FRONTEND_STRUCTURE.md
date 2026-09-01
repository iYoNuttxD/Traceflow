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
├── app/
│   ├── layout/                  # shell autenticado e preferências de navegação
│   ├── routes/                  # composição e lazy loading de rotas
│   └── theme/                   # preferência System/Light/Dark e tema resolvido
├── api/
│   └── http-client.js
├── pages/                     # adaptadores finos de rota
├── features/
│   ├── auth/
│   ├── github/
│   ├── invitations/
│   ├── members/
│   ├── privacy/
│   ├── projects/
│   ├── requirements/
│   ├── settings/
│   ├── tasks/
│   └── traceability/
├── shared/
│   ├── components/
│   ├── hooks/
│   ├── services/
│   └── styles/                # exceções com múltiplos consumers reais
└── styles/
    ├── base.css
    ├── global.css
    └── tokens.css
```

Somente pastas com implementação real devem existir.

## Rotas e chunks

`AppRoutes` declara as páginas com `React.lazy` por meio do adaptador mínimo `lazyNamed`. Um único
`Suspense` na fronteira das rotas fornece fallback anunciado por `role="status"`; o `ErrorBoundary`
global captura também falhas de importação dinâmica. `ProtectedRoute`, restauração da sessão, CSRF
e os providers globais permanecem fora dos chunks de página. `AuthenticatedLayout` aplica o shell
somente às rotas protegidas de contas ativas; rotas públicas e páginas de conta restrita não recebem
a sidebar.

O build separa as telas públicas e protegidas, os módulos de domínio e o grafo. `TraceabilityFlow` e `@xyflow/react` são alcançados apenas pelo chunk de rastreabilidade e não pertencem à entrada inicial.

## Shell, tema e catálogo de projetos

`app/layout` é owner do shell transversal: sidebar 272/88 px, drawer mobile, navegação global,
identidade e os controles de tema, Settings e logout. A antiga navbar não permanece em paralelo. O
drawer gerencia Escape, foco inicial, contenção do foco, conteúdo de fundo inerte e retorno ao
trigger; as transições respeitam reduced motion. Todos os controles expostos preservam área mínima
de 44 × 44 px.

`app/theme` separa a preferência `system | light | dark` do tema resolvido `light | dark`, aplica
`data-theme` no elemento `html` e persiste os três estados. Sistema é o default e usa
`prefers-color-scheme`, acompanhando mudanças do sistema operacional; Claro/Escuro ignoram esses
eventos. O script mínimo em `index.html` aplica a mesma resolução antes do mount e usa Light quando
`matchMedia` não está disponível.

`ProjectsCatalogProvider` pertence a `features/projects` e compartilha a resposta autorizada de
`GET /projects` entre shell e Projects. O shell mantém fixados e recentes como preferências locais
por usuário, limita a exibição a cinco e cruza todos os IDs com esse catálogo. LocalStorage não
concede membership ou acesso. Loading ou erro no catálogo não bloqueiam a navegação principal.

## Projects e visão do projeto

`/projects` apresenta projetos e convites pendentes no mesmo grid responsivo. O grid responde à
largura útil do container — inclusive quando a sidebar está expandida — e preserva uma largura
mínima legível para os cards. O card inteiro do projeto navega para sua visão geral, enquanto o card
Novo projeto abre um dialog acessível que só então expõe os fluxos existentes de criação ou entrada
por código. Essa apresentação não altera os casos de uso, contratos HTTP ou critérios de
autorização desses fluxos.

`/projects/:projectId` é a visão geral do projeto e agrupa Projeto, GitHub e Equipe em uma única
surface. A navegação horizontal interna parte de Visão geral e mantém Tasks, Requirements, Kanban,
Repositório e Rastreabilidade como destinos do mesmo projeto. Ações administrativas não ficam
embutidas na Overview: edição usa `/projects/:projectId/edit`, e membros, convites e código de acesso
usam `/projects/:projectId/members`. As telas continuam exibindo ações conforme o papel retornado
pela API; o backend permanece autoritativo para autorização e lifecycle.

Overview, edição e membros usam `BackButton`, primitive shared com destino conhecido, nome acessível
e touch target. A rota de membros organiza Equipe e Convites em tabs com a mesma primitive visual da
navegação interna do projeto. Nome, username e perfil são filtrados client-side sobre a lista já
autorizada; convites e código/link permanecem disponíveis somente conforme a autorização vigente.
`TraceFlowIcon` centraliza a família outline utilizada por essas ações sem introduzir biblioteca
externa.

## Auth público e ciclo de conta

Login, cadastro, recuperação e callbacks públicos reutilizam `PublicPageShell`, primitive shared
que concentra a composição Focused, a marca e a integração visual com os temas do runtime.
`AuthShell` permanece no domínio de autenticação e organiza formulários, feedback de bootstrap e
navegação secundária. Estados sem formulário, como verificação, confirmação pública e restrição de
conta, reutilizam `StatusSurface` sem transferir requests, guards ou lifecycle para `shared`.

As rotas públicas continuam fora do AppShell. Contas autenticadas em estado restrito também não
recebem a sidebar, mas preservam seus guards e as ações permitidas pelo domínio. GitHub OAuth em
Auth representa identidade; GitHub App e autorização de repositórios permanecem em integrações.

## Settings e ações sensíveis

`SettingsLayout` compõe header, tabs internas e o outlet dentro do AppShell; `/projects` permanece a
entrada autenticada canônica e nenhuma Home paralela é criada. `AccountSettingsPage`,
`SecuritySettingsPage`, `PrivacySettingsPage` e `IntegrationsSettingsPage` continuam owners de suas
queries, mutações, loading, erro inicial e feedback.

`shared/styles/internal-tabs.css` concentra a navegação horizontal realmente reutilizada por
Project Overview, Members e Settings. Cada consumer mantém apenas o layout contextual no CSS da
própria feature; Settings não importa estilos internos de Projects.

`PasswordField` é exposto pelo barrel público de Auth e concentra visibilidade, força informativa,
requisitos reativos e confirmação de nova senha para Cadastro, Reset e Security. Settings não
importa internals de Auth nem duplica a apresentação dessas regras; validações do backend permanecem
autoritativas.

`SensitiveActionDialog` pertence à feature Settings porque combina impacto e reautenticação dos
fluxos de integração. Ele preserva o mecanismo existente por tipo de conta e delega requests ao
owner da página. `GithubSensitiveReauthentication` continua owner da iniciação OAuth para ação
sensível; GitHub App não autentica identidade, e GitHub OAuth não concede autorização de
repositório.

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

`frontend/src/styles/` contém somente fundamentos globais. `tokens.css` é a fonte executável dos
tokens semânticos Light/Dark; `base.css` concentra reset, elementos base, `:root`, `body`, `#root` e
foco transversal; `global.css` contém primitives realmente usadas em vários domínios, como layout
de página, campos, botões, feedback e badges.

`global.css` não é depósito de feature: novas implementações não adicionam `.project-*`,
`.settings-*`, `.auth-*`, `.kanban-*` ou seletores equivalentes específicos de domínio. Overrides
cross-feature são evitados; reutilização visual real deve virar shared component, estilo shared com
múltiplos consumers comprovados ou token.

CSS de componente ou screen usa o mesmo basename e diretório do JSX sempre que existe um owner
único. Não há pasta obrigatória por componente: a árvore existente é preservada com pares como
`ProjectForm.jsx` + `ProjectForm.css`. Componentes shared também importam o próprio CSS; ser
reutilizável não torna a regra global.

`shared/styles/` e `features/<domain>/styles/` são exceções pequenas para regras com múltiplos
consumers reais. Não substituem `global.css` por um monólito de feature, não funcionam como barrel de
CSS e são importados pelos consumers ou pelo layout owner correspondente.

Inline style só é usado para valor realmente calculado em runtime. Cor, espaçamento, layout e demais
estilos estáticos pertencem ao CSS do owner.

## Estado vigente da modularização

O CSS legado foi distribuído entre fundamentos globais, shared e owners de pages/features sem mudar
selectors, valores ou breakpoints. Cada media query acompanha o arquivo que possui o seletor base.
Seletores dinâmicos e regras sem consumer textual conclusivo foram preservados no owner provável; a
busca textual isolada não autoriza remoção.

Mudanças futuras mantêm a mesma disciplina: mapear markup, estados, media queries, specificity e
ordem de carregamento antes de mover uma regra; executar os gates do frontend; e validar visualmente
os fluxos e breakpoints afetados. Refatoração de ownership não é oportunidade para redesign,
responsividade nova, dark mode ou troca de identidade visual.
