# Frontend final review — targeted corrections

## Resultado

`FRONTEND FINAL REVIEW TARGETED CORRECTIONS — PASS LOCAL`

FR-01 a FR-06 foram corrigidos e revalidados localmente. FR-07 permanece fora desta rodada como
`SUGGESTION / TECHNICAL DEBT`, sem efeito bloqueante. Não houve alteração de API, regra de negócio,
schema, migration ou dado de projeto. Nenhum commit ou push foi realizado.

## Baseline

| Item | Evidência |
|---|---|
| Branch | `daniel-dev` |
| HEAD | `9f7e618fa39838b733079c9ad728e615f7c1afc0` |
| Working tree inicial | limpa |
| Node canônico usado nos gates | `v22.23.2` |
| Node default observado, não usado como referência | `v26.8.2` |

Foram lidos antes da implementação o Design System, o inventário de superfícies, o log de validação
visual, os tokens, os contratos de API e a matriz de autorização. O baseline automatizado reproduziu
as lacunas de teclado, scroll, picker inline, touch target, pilha de diálogos e fronteira de chunks
antes da correção.

## FR-01 — movimentação acessível no Kanban

### Reprodução e causa

O card expunha drag-and-drop como única forma de alterar a coluna. O status continuava corretamente
read-only em Task Details, porém não havia ação equivalente no owner canônico, o Kanban.

### Correção

- `TaskMoveMenu` adiciona uma ação `Mover tarefa` operável com Tab, Enter/Space, setas, Home, End e
  Escape.
- O menu usa `role="menu"`, `role="menuitem"`, `aria-haspopup` e `aria-expanded`, abre em overlay
  fixo e devolve o foco ao card.
- Menu e drag-and-drop chamam a mesma função `moveTaskToStatus` e, portanto, a mesma mutation já
  existente.
- Após sucesso, o foco acompanha o card na nova coluna; após erro, o status anterior e o foco são
  preservados e o feedback é anunciado.
- VIEWER, Sprint congelada e task congelada não recebem uma ação mutável; drag-and-drop também fica
  indisponível nesses estados.

### Validação

Os testes cobrem A Fazer para Em Andamento, Em Andamento para Concluído, retorno para A Fazer,
VIEWER, frozen, falha backend, foco após sucesso/erro e preservação do drag-and-drop. No navegador,
em 390 px, o menu ficou integralmente dentro do viewport (`left=166`, `right=382`, viewport `390`),
`End` focou `Mover para Concluído` e Escape fechou somente o menu, retornando o foco ao trigger.

## FR-02 — opção ativa visível no SearchCombobox

### Reprodução e causa

`activeIndex` e `aria-activedescendant` mudavam, mas o componente não sincronizava o scroll interno
da lista. Em listas longas, o item ativo saía da área visível.

### Correção

Um layout effect chama `scrollIntoView({ block: 'nearest', inline: 'nearest' })` somente na opção
ativa. Portal, posição fixa, latest-wins, AbortController, loading, empty, click outside e
reposicionamento em scroll/resize foram preservados.

### Validação

Uma busca renderizada retornou 14 opções (`scrollHeight=638`, `clientHeight=286`). `End` moveu o
scroll interno de `0` para `348` e manteve a última opção totalmente visível; ArrowUp preservou a
visibilidade; Home voltou à primeira opção (`scrollTop=4`); ArrowDown avançou à segunda. O scroll do
dialog permaneceu `0` e o scroll do documento permaneceu `360.5` durante toda a sequência. Os testes
incluem primeiro/último item, ArrowDown, ArrowUp, Home, End, lista longa, item desabilitado e
`aria-activedescendant`.

## FR-03 — pickers de Task em overlay

### Reprodução e causa

Requirement, PR, Commit e Issue ainda possuíam estado, debounce e `.traceability-results` próprios em
`TaskForm` e `TaskTraceabilityEditor`. As listas pertenciam ao fluxo normal e deslocavam os controles
seguintes.

### Correção

- Os quatro pickers convergiram para `SearchCombobox`.
- O primitive compartilhado passou a suportar validação de query numérica/textual, ação de limpar e
  mensagem de erro contextual.
- As buscas preservam AbortController/latest-wins, exclusões de vínculos já selecionados,
  deduplicação de commit, PR singular e relações N:N de commits/issues.
- O popover permanece dentro da árvore modal para acessibilidade, mas usa `position: fixed`, largura
  do trigger e não participa do fluxo.

### Validação de zero shift

Em Task create real, com o dialog aberto em 1280 px/Dark, os quatro pickers apresentaram:

| Picker | Delta do campo | Delta do scroll interno | Delta da altura do dialog | Delta da altura do documento | Largura input/lista |
|---|---:|---:|---:|---:|---:|
| Requirement | `0 px` | `0 px` | `0 px` | `0 px` | `840 / 840 px` |
| Pull request | `0 px` | `0 px` | `0 px` | `0 px` | `840 / 840 px` |
| Commit | `0 px` | `0 px` | `0 px` | `0 px` | `840 / 840 px` |
| Issue | `0 px` | `0 px` | `0 px` | `0 px` | `840 / 840 px` |

Também foi validado que Escape fecha o popover sem fechar o dialog owner; essa coordenação recebeu
uma regressão automatizada dedicada.

## FR-04 — touch targets

### Causa e correção

Os owners compartilhados não aplicavam o token mínimo de toque de forma uniforme. `.button` e
`.button-compact` agora têm `min-height: var(--size-touch-target)`. O help trigger e o link/chip de
defeito receberam também largura mínima canônica.

### Medições renderizadas

| Controle | Box real após correção |
|---|---:|
| Retomar | `104.06 × 44 px` |
| Lançar manualmente | `173.66 × 44 px` |
| Criar caso de teste (Task Details) | `186.18 × 44 px` |
| Criar caso de teste (Requirement Details) | `170.97 × 44 px` |
| Ajuda de rastreabilidade | `44 × 44 px` |
| Link DEF no Kanban | `44 × 44 px` |

A densidade visual foi preservada por `min-*` e padding, sem ampliar artificialmente o conteúdo.

## FR-05 — stack global de dialogs

### Reprodução e causa

`SprintDialog`, `KanbanDialog` e `ConfirmDialog` mantinham listeners de teclado independentes. Com
Details e confirmação abertos, o mesmo Escape podia ser processado por mais de uma camada.

### Correção

`dialog-stack.js` mantém uma pilha compartilhada por token. Somente a camada superior trata Escape e
Tab. O mecanismo também reconhece um combobox expandido como owner do primeiro Escape, evitando que
o popover e seu dialog sejam fechados juntos.

### Validação

No fluxo renderizado `REQ-8 Details -> Excluir requisito`, havia dois dialogs. Após Escape, restou
somente o Details, e o foco retornou para `Excluir requisito`. Cancel, confirmação, fechamento do
Details, focus trap e os dialogs de esforço continuam cobertos pela suíte existente.

## FR-06 — fronteiras lazy do grafo

### Causa e correção

O barrel de Traceability exportava Workspace/Screen junto com APIs leves. Consumers de Requirements
e Tasks atravessavam esse barrel e antecipavam módulos exclusivos do grafo. O barrel agora contém
somente API leve; as páginas importam `TraceabilityWorkspace` dinamicamente, e o Workspace importa
`TraceabilityFlow` dinamicamente. Os dois limites exibem `LoadingState` C2.

### Build antes/depois

| Chunk | Antes | Depois | Gzip antes | Gzip depois |
|---|---:|---:|---:|---:|
| main/index | `387.32 kB` | `387.50 kB` | `112.35 kB` | `112.44 kB` |
| shared feature chunk | `496.83 kB` | `269.82 kB` | `143.16 kB` | `71.56 kB` |
| TraceabilityFlow | embutido no shared | `205.17 kB` | embutido no shared | `66.39 kB` |
| TraceabilityWorkspace | embutido no shared | `2.74 kB` | embutido no shared | `1.14 kB` |
| ELK bundled | `1,433.73 kB` | `1,433.73 kB` | `441.98 kB` | `441.98 kB` |
| ELK worker | `1,426.50 kB` | `1,426.50 kB` | não reportado | não reportado |
| Tasks route facade | `0.15 kB` | `0.15 kB` | `0.14 kB` | `0.15 kB` |
| Requirements route facade | `0.16 kB` | `0.16 kB` | `0.15 kB` | `0.15 kB` |
| Defects route facade | `0.16 kB` | `0.16 kB` | `0.15 kB` | `0.15 kB` |

O pequeno aumento do main (`+0.18 kB`, `+0.09 kB gzip`) corresponde à coordenação compartilhada de
dialogs e aos contratos adicionais do combobox. A redução do chunk compartilhado é a separação real
de React Flow; nenhum threshold foi alterado. A inspeção do build confirmou que os facades de Tasks,
Requirements e Defects não contêm marcadores de React Flow/ELK e que esses marcadores aparecem apenas
em `TraceabilityFlow-*.js`. ELK continua atrás do limite dinâmico já existente.

No navegador, abrir Rastreabilidade mostrou primeiro o dialog C2 com
`Carregando visualização de rastreabilidade...`; em seguida, o mesmo dialog recebeu o grafo React
Flow com duas entidades, sem flash de modal vazio ou mudança de superfície.

## Visual QA e acessibilidade

Foram inspecionados Light e Dark em `1440`, `1280`, `1024`, `768` e `390` px. Em todos os tamanhos,
`documentElement.scrollWidth === clientWidth`; não houve overflow horizontal global. A navegação do
projeto permaneceu em seu scroll interno nos breakpoints estreitos.

Além da matriz de viewport, foram exercitados no navegador:

- Kanban: foco no card, abertura/fechamento do menu por teclado, End, Escape e retorno de foco;
- SearchCombobox: ArrowDown, ArrowUp, Home, End e lista interna longa;
- Task create: overlays de Requirement, PR, Commit e Issue, mesma largura do trigger e zero shift;
- dialogs: Details + confirmação, Escape somente no topo e retorno de foco;
- touch targets: boxes reais dos controles identificados;
- Traceability: loading lazy C2 seguido do grafo funcional.

VIEWER, frozen, falha backend e todas as transições de coluna foram confirmados pelos testes
determinísticos, sem mutation de dados durante a inspeção visual.

## Gates finais — Node 22

| Gate | Resultado |
|---|---|
| Focused | `9 files / 169 tests PASS` |
| Frontend full | `98 files / 1,205 tests PASS` |
| Coverage | `83.75% statements`, `78.22% branches`, `78.68% functions`, `86.24% lines` |
| Lint | PASS |
| Format check | PASS |
| Build | PASS (`597 modules`) |
| Backend architecture check | PASS, zero violações |
| `git diff --check` | PASS |

O warning preexistente de chunk acima de 500 kB continua visível por causa do ELK; ele não foi
mascarado nem teve seu limite alterado.

## Finding remanescente

FR-07 — teste de concorrência com tempo real — permanece explicitamente fora de escopo como
`SUGGESTION / TECHNICAL DEBT`. Não há BLOCKING ou IMPORTANT conhecido remanescente desta revisão.
