# TRACEFLOW HYBRID — Design System

## Estado

```text
Concept C2 — TraceFlow Hybrid
DIREÇÃO VISUAL APROVADA
TOKENS E SHELL AUTENTICADO — IMPLEMENTADOS
AUTH FOCUSED — IMPLEMENTADO
VISUAL HOMOLOGATION: DEFERRED TO WORK
```

Este documento é a referência humana inicial da linguagem visual do TRACEFLOW. A especificação
visual aprovada permanece em [`traceflow-tokens.css`](./traceflow-tokens.css), enquanto a fonte
executável do frontend está em `frontend/src/styles/tokens.css`. O runtime não importa arquivos de
`docs/`. Os protótipos aprovados permanecem em
[`experiments/concept-c2/`](./experiments/concept-c2/).

## Escopo e fronteira

O Design System define aparência, hierarquia, composição e estados de interação. Não define regra
de negócio, autorização, lifecycle, roteamento ou persistência. Por exemplo:

- define como `Ativo`, `Arquivado` e `Sincronizado` são apresentados;
- não define quando um projeto muda de estado;
- define como um convite e um quick project aparecem;
- não define destinatários, permissões ou a regra de seleção dos projetos rápidos.

O frontend possui Theme Provider e shell autenticado próprios em `app/`. Isso não cria biblioteca,
package, Storybook ou dependência visual nova e não transfere regra de domínio ao Design System.

## Decisões

### APPROVED

- linguagem TraceFlow Hybrid;
- Light com personalidade Management e Dark com personalidade Development;
- mesma arquitetura, spacing, radius, tipografia, dimensões, iconografia e interação nos temas;
- minimalismo funcional, simetria, baixo ruído e densidade moderada;
- surfaces e bordas como fontes principais de profundidade;
- geometria arredondada com escala curta;
- sidebar como navegação global;
- hierarquia da Projects e da Project Overview do Concept C2;
- progressive disclosure para ações complexas;
- iconografia outline consistente, sem emoji como interface;
- foco visível e feedback que não depende somente de cor;
- temas visíveis Light e Dark, com preferência manual persistida;
- preferência do sistema como resolução inicial quando não há escolha manual;
- shell autenticado com sidebar expandida, recolhida e drawer mobile.
- composição pública Focused para autenticação e estados de ciclo de conta.

### PROVISIONAL

- pontos exatos de quebra responsiva;
- ajustes finos das durações e curvas de motion;
- valores racionalizados de tipografia e spacing quando o protótipo usava medidas intermediárias;
- shadow para dialogs e overlays maiores;
- iconografia definitiva e possíveis assets de marca;
- resultados de contraste, reflow, teclado e tecnologia assistiva na homologação renderizada.

## Princípios

### Minimalismo funcional

Informação necessária para decidir fica visível. Metadata, IDs e detalhes de investigação recebem
menor ênfase ou aparecem sob demanda. Minimalismo não remove função relevante.

### Progressive disclosure

Formulários e ações complexas não ocupam espaço antes da solicitação do usuário. O padrão aprovado
é `Novo projeto → Criar projeto / Entrar com código`.

### Agrupamento real

Cards representam entidades, ações ou agrupamentos coerentes. Uma tela não deve virar um dashboard
de pequenos cards quando uma única surface com divisões internas comunica melhor a relação dos
dados.

### Mesma aplicação em Light e Dark

Os temas preservam navegação, layout, componentes, ações, tamanho, spacing, radius, tipografia,
iconografia e hierarquia. Variam backgrounds, surfaces, texto, bordas, accents, cores semânticas e
profundidade.

## Identidade dos temas

### Light — Management

Comunica gestão, organização, planejamento, clareza e produtividade. Usa background frio claro,
surfaces claras em níveis, azul funcional, texto slate e bordas suaves. Branco é reservado às
surfaces principais, não ao fundo inteiro da aplicação.

### Dark — Development

Comunica engenharia, concentração, precisão e tecnologia. Usa grafite profundo, sidebar
diferenciada, surfaces slate, texto claro e azul/cyan moderado. Não usa preto absoluto, neon ou
tratamento de terminal generalizado.

## Como o C2 foi traduzido para tokens

| Evidência do C2                                      | Tradução no sistema                                  |
| ---------------------------------------------------- | ---------------------------------------------------- |
| Hierarquia de page, sidebar e surfaces               | tokens semânticos de background e surface            |
| Azul funcional no Light e azul/cyan moderado no Dark | família semântica de accent por tema                 |
| Status com texto, dot e surface                      | cores semânticas compartilhadas por badge e feedback |
| Radius recorrentes de 8–28 px                        | escala curta de radius                               |
| Medidas intermediárias de 11–18 px                   | escala tipográfica racionalizada                     |
| Gaps recorrentes de 8–32 px                          | spacing baseado em múltiplos de 4 px                 |
| Bordas discretas e duas sombras                      | border e shadow foundations compactas                |
| Controles e icon buttons de 44–48 px                 | size e touch-target foundations                      |
| Collapse, hover e tooltip de 120–180 ms              | motion curto e discreto                              |
| Shell 272/88 px e conteúdo até 1320 px               | layout foundations reutilizáveis                     |

As cores-base mantêm os valores exatos do C2. Tipografia e spacing removem pequenas variações
históricas para formar escalas reutilizáveis.

## Tokens

A primeira versão possui 120 tokens únicos. O conjunto permanece abaixo do limite de 150 e evita
nomes ligados a páginas, features ou produtos de referência.

### Cores estruturais

| Token                             | Light                 | Dark                | Uso                            |
| --------------------------------- | --------------------- | ------------------- | ------------------------------ |
| `--color-bg-page`                 | `#f1f4f8`             | `#0d121b`           | fundo da aplicação             |
| `--color-bg-sidebar`              | `#f8fafd`             | `#101721`           | navegação global               |
| `--color-surface-primary`         | `#ffffff`             | `#151c27`           | cards e containers             |
| `--color-surface-secondary`       | `#f7f9fc`             | `#111823`           | áreas agrupadas e metadata     |
| `--color-surface-elevated`        | `#ffffff`             | `#1d2735`           | popover, dialog e menus        |
| `--color-surface-interactive`     | `#e9eef6`             | `#1d2735`           | hover e affordances neutras    |
| `--color-bg-input`                | surface secondary     | surface secondary   | campos e controles editáveis   |
| `--color-text-primary`            | `#172033`             | `#dce5f2`           | corpo e conteúdo               |
| `--color-text-strong`             | `#0e1627`             | `#f5f8fc`           | títulos e ênfase               |
| `--color-text-secondary`          | `#526078`             | `#9baac0`           | descrição e apoio              |
| `--color-text-muted`              | text secondary        | text secondary      | caption e metadata             |
| `--color-text-on-accent`          | `#ffffff`             | `#0b1728`           | conteúdo sobre accent forte    |
| `--color-text-on-light-primary`   | `#172033`             | `#172033`           | conteúdo em surface clara fixa |
| `--color-text-on-light-secondary` | `#667085`             | `#667085`           | apoio em surface clara fixa    |
| `--color-border-default`          | `#d9e1ed`             | `#293649`           | separação padrão               |
| `--color-border-strong`           | `#c4cfdf`             | `#3a4a61`           | controles e elevação           |
| `--color-border-interactive`      | `#2859c5`             | `#65a8ff`           | hover, active e seleção        |
| `--color-focus-ring`              | `#2d67dc`             | `#77b5ff`           | foco visível                   |
| `--color-overlay`                 | `rgb(11 18 31 / 48%)` | `rgb(2 6 12 / 72%)` | backdrop                       |

Os tokens `on-light` são invariantes e existem somente para surfaces claras fixas que ainda não
podem acompanhar o tema, como a compatibilidade temporária dos cards legados de Settings. Eles não
formam uma segunda paleta e não devem substituir os pares normais de surface e texto temáticos.

### Accent e semântica

| Token                       | Light               | Dark                | Uso                             |
| --------------------------- | ------------------- | ------------------- | ------------------------------- |
| `--color-accent-primary`    | `#2859c5`           | `#65a8ff`           | ação e relação principal        |
| `--color-accent-strong`     | `#1d45a0`           | `#89bcff`           | primary button                  |
| `--color-accent-surface`    | `#e9f0ff`           | `#172c48`           | active/hover accent             |
| `--color-accent-text`       | `#173d92`           | `#a9ceff`           | texto accent                    |
| `--color-success-text`      | `#17643b`           | `#72d49c`           | sucesso, ativo, sincronizado    |
| `--color-success-surface`   | `#e8f7ef`           | `#153528`           | surface de sucesso              |
| `--color-warning-text`      | `#8b4d09`           | `#f2bd6b`           | atenção, arquivado, reconexão   |
| `--color-warning-surface`   | `#fff3dc`           | `#3a2b18`           | surface de warning              |
| `--color-danger-text`       | `#a6333f`           | `#ff9ba5`           | erro e ação destrutiva          |
| `--color-danger-surface`    | mix semântico       | mix semântico       | feedback e hover destrutivo     |
| `--color-info-text`         | accent text         | accent text         | informação neutra               |
| `--color-info-surface`      | accent surface      | accent surface      | feedback informativo            |
| `--color-highlight-text`    | `#6b46b6`           | `#bba2ff`           | contexto especial, como convite |
| `--color-highlight-surface` | `#f2edff`           | `#2a2342`           | surface contextual              |
| `--color-neutral-text`      | text secondary      | text secondary      | status neutro                   |
| `--color-neutral-surface`   | interactive surface | interactive surface | badge neutro                    |

Border e icon tokens semânticos reutilizam a mesma família. Cor nunca atua sozinha: status inclui
label e pode incluir dot ou ícone; feedback inclui texto e semântica apropriada.

### Ação de provider

| Token                            | Light     | Dark      | Uso                                      |
| -------------------------------- | --------- | --------- | ---------------------------------------- |
| `--color-provider-surface`       | `#172033` | `#0f151f` | ação de autenticação de provider externo |
| `--color-provider-surface-hover` | `#253044` | `#1b2532` | hover da ação de provider                |
| `--color-provider-text`          | `#f5f8fc` | `#f5f8fc` | conteúdo sobre a surface de provider     |
| `--color-provider-border`        | `#2c374b` | `#3a4a61` | separação da ação de provider            |

A família é genérica para provedores externos e não representa integração de repositórios. A ação
continua secundária ao primary do formulário, mesmo com tratamento graphite nos dois temas.

### Mapeamento de estados conhecidos

| Estado funcional existente             | Variante visual                   |
| -------------------------------------- | --------------------------------- |
| Projeto `Ativo`                        | success                           |
| Projeto `Arquivado`                    | warning                           |
| GitHub `Sincronizado`                  | success                           |
| GitHub `Reconexão necessária`          | warning                           |
| GitHub `Falha`                         | danger                            |
| Convite                                | highlight contextual, não warning |
| Estado sem semântica positiva/negativa | neutral                           |

O Design System não adiciona estados nem altera lifecycle.

## Tipografia

### Famílias

- sans: `Inter`, `ui-sans-serif`, `system-ui`, stack nativa;
- mono: `ui-monospace`, `SFMono-Regular`, `Consolas`, `Liberation Mono`, apenas para repository,
  branch, commit, código e identificador técnico;
- nenhuma fonte externa é adicionada nesta fase.

### Escala

| Token           | Valor | Papel recorrente            |
| --------------- | ----: | --------------------------- |
| `--font-size-1` | 12 px | caption, metadata           |
| `--font-size-2` | 14 px | body small, label           |
| `--font-size-3` | 16 px | body                        |
| `--font-size-4` | 18 px | card/section title          |
| `--font-size-5` | 24 px | heading intermediário       |
| `--font-size-6` | 32 px | page title compacto         |
| `--font-size-7` | 40 px | page title desktop          |
| `--font-size-8` | 48 px | display/project title amplo |

Pesos disponíveis: regular 400, medium 500, semibold 600 e bold 700. A escala de line-height é
`1.1`, `1.25`, `1.5` e `1.625`; tracking especial limita-se a títulos tight e labels wide.

### Hierarquia

| Papel              | Composição                                 |
| ------------------ | ------------------------------------------ |
| Display/page title | size 6–8 responsivo, bold, tight           |
| Section title      | size 4, semibold, title line-height        |
| Card title         | size 4, semibold                           |
| Body               | size 3, regular, body line-height          |
| Body small         | size 2, regular, body line-height          |
| Label              | size 2, semibold                           |
| Caption            | size 1, medium                             |
| Metadata           | size 1, regular, secondary/muted           |
| Technical/code     | size 1–2, mono, semibold quando necessário |

## Spacing e densidade

| Token        | Valor | Uso típico                  |
| ------------ | ----: | --------------------------- |
| `--space-1`  |  4 px | micro-gap                   |
| `--space-2`  |  8 px | ícone/texto compacto        |
| `--space-3`  | 12 px | controles e grupos curtos   |
| `--space-4`  | 16 px | padding compacto            |
| `--space-5`  | 20 px | grid e card gap             |
| `--space-6`  | 24 px | padding de card/section gap |
| `--space-8`  | 32 px | gutter desktop              |
| `--space-10` | 40 px | separação ampla             |
| `--space-12` | 48 px | page rhythm                 |
| `--space-16` | 64 px | page bottom/área ampla      |

Não devem surgir valores intermediários por preferência local. Layout responsivo combina a escala
existente; não cria tokens como `--mobile-card-padding`.

## Radius, borders e shadows

| Foundation   | Tokens                              | Regra                                               |
| ------------ | ----------------------------------- | --------------------------------------------------- |
| Radius       | xs 8, sm 10, md 14, lg 20, xl 28 px | tooltip; controles; blocos; cards; grandes surfaces |
| Pill         | `--radius-pill`                     | badges, chips e status; não cards comuns            |
| Border       | default 1 px, strong 2 px           | 1 px é o padrão                                     |
| Shadow       | sm e md                             | sm em surface; md em popover/dialog/drawer          |
| Profundidade | surface + border antes de shadow    | evitar estética Material pesada                     |

`shadow-lg` não é criado sem evidência. Dialogs maiores usam `shadow-md` até homologação da
implementação.

## Interação e estados

### Focus

- ring de 3 px com offset de 3 px;
- `--color-focus-ring` próprio para Light e Dark;
- não remover outline sem substituição equivalente;
- ring deve acompanhar buttons, links, cards clicáveis, tabs, sidebar e inputs.

### Hover e active

- hover altera surface, border ou texto de forma discreta;
- não aplicar zoom, escala grande ou translate decorativo;
- active combina accent surface, accent text e marcador de borda/underline;
- sidebar e tabs usam a mesma semântica de accent, sem exigir o mesmo desenho.

### Disabled e busy

- disabled usa opacity `0.6`, texto/surface próprios e cursor `not-allowed`;
- conteúdo permanece legível;
- busy mantém dimensões, bloqueia nova ativação e comunica estado textual/semântico;
- disabled não deve ser simulado somente por redução de contraste.

## Controles

### Buttons

Todos os buttons usam altura mínima de 44 px, radius sm, spacing da escala e foco visível.

| Variante  | Aparência                                   | Uso                                          |
| --------- | ------------------------------------------- | -------------------------------------------- |
| Primary   | accent strong + text on accent              | ação principal: Salvar, Aceitar, Sincronizar |
| Secondary | surface primary + border strong             | alternativa ou cancelamento não destrutivo   |
| Ghost     | transparente; surface apenas em hover/focus | header, sidebar, tabs e icon actions         |
| Danger    | danger text/surface/border                  | somente ação realmente destrutiva            |
| Provider  | graphite temático + foreground claro        | autenticação com provider externo            |

Logout permanece ghost e neutro no estado normal. Pode adquirir danger discreto somente em
hover/focus; disponibilidade de logout não o transforma em danger button permanente.

### Icon buttons

- ícone visual: 16–20 px;
- área interativa mínima: 44 × 44 px;
- radius sm;
- hover/focus seguem ghost button;
- ícone sem texto em ação importante exige `aria-label`, tooltip e foco visível;
- disabled mantém label acessível.

`--size-control-sm` representa apenas uma dimensão visual/interna de 40 px. Ele não autoriza hit
box menor que 44 × 44 px; ações interativas usam no mínimo `--size-touch-target`.

O retorno entre fluxos conhecidos usa o mesmo padrão ghost em um icon button de seta para a
esquerda. O destino é determinístico — por exemplo, edição retorna à visão do projeto — e não
depende cegamente do histórico do navegador. A ação mantém tooltip, nome acessível e touch target.

### Inputs

- altura mínima de 44 px;
- padding horizontal 12–16 px;
- background input, border default e radius sm;
- label size 2 semibold; help/error size 1–2;
- focus usa border interactive e ring global;
- error usa danger text/border, mensagem associada e não depende somente de cor;
- disabled usa tokens próprios e não remove a identificação do valor.

## Containers e cards

### Surface container

Agrupa informação relacionada dentro de surface primary, border default e radius lg. Divisões
internas usam border default em vez de novos cards.

### Card

Entidade não necessariamente clicável. Usa surface primary, border default, radius lg, padding
space 6 e shadow sm opcional.

### Interactive card

Extende card com cursor/affordance, foco visível e hover por border interactive, mudança sutil de
surface e no máximo shadow md. O Project Card é uma instância deste padrão.

### Invitation card

Variante contextual de card: mantém radius, spacing e tipografia; usa highlight text/surface/border
e label `Convite`. Não deve parecer erro ou warning.

### New Project card

Instância de interactive card com border default dashed e ícone/label centralizados. O formulário
ou action sheet aparece apenas após ativação.

## Navegação

### Sidebar

| Propriedade    | Regra                                                                   |
| -------------- | ----------------------------------------------------------------------- |
| Expandida      | 272 px                                                                  |
| Recolhida      | 88 px                                                                   |
| Header         | 80 px, composto pela escala de spacing                                  |
| Item normal    | mínimo 44 px, radius sm, icon 20 px                                     |
| Item recolhido | 48 px, ícone/monograma centralizado                                     |
| Section label  | caption bold, uppercase, tracking wide                                  |
| Active         | accent surface/text + marcador lateral                                  |
| Hover          | surface primary + border default                                        |
| Bottom actions | Tema, Configurações e Sair com linguagem ghost comum                    |
| User block     | contexto separado, avatar + label principal + label secundária opcional |

Projetos rápidos usam a mesma estrutura visual dos itens secundários. A regra executável de seleção
pertence ao shell; o Design System define apenas sua apresentação.

### Tabs

- navegação horizontal com item mínimo de 48 px;
- active usa accent text e underline de 3 px;
- hover muda texto sem surface pesada;
- foco visível global;
- overflow horizontal preserva todos os destinos em largura reduzida.

Tabs internas de um projeto e tabs de administração reutilizam esta mesma linguagem; uma nova
área não cria uma segunda aparência de navegação horizontal.

### Breadcrumb

- size 1–2;
- ancestral navegável usa accent text e peso semibold;
- separador e item atual usam text secondary;
- não compete com page title.

## Badges, avatars e feedback

### Badges e chips

Sistema único com variantes neutral, success, warning, danger, info e highlight. Usa radius pill,
size 1, peso bold, label textual e dot/ícone opcional. Badge não decide regra funcional.

### Avatar

Três tamanhos: 32, 36 e 44 px. Avatar usa shape circular, label alternativa quando necessário e
border da surface ao formar stack. Cor decorativa não representa papel ou permissão.

### Feedback

Success, warning, error e info combinam icon, título/mensagem, surface e border semânticos. Regiões
dinâmicas devem adotar `role="status"`, `role="alert"` ou live region conforme urgência real. Cor não
é o único sinal.

### Empty state

Composição: ícone opcional, título, descrição, ação opcional e spacing centralizado. Ilustração não
é obrigatória. Empty state não oculta a ação necessária para continuar.

### Dialog e modal

- backdrop usa overlay;
- surface elevated, radius lg ou xl e shadow md;
- header, body e actions preservam a escala de spacing;
- implementação futura gerencia foco inicial, trap, Escape e retorno de foco;
- ação destrutiva continua explicitamente rotulada.

## Layout foundations

- shell: sidebar + content area em grid;
- sidebar: 272 px expandida e 88 px recolhida;
- conteúdo usa largura disponível até `1320px`;
- gutter desktop: 32 px por lado;
- grid gap racionalizado: 20 px;
- section gap: 24 px;
- Projects: três, duas ou uma coluna conforme a largura realmente disponível no container;
- Overview: uma surface integrada; divisões internas se reorganizam sem virar cards independentes.

Pages dentro do shell respondem primeiro ao espaço útil do próprio container. Grid intrínseco e
container queries têm preferência sobre regras baseadas apenas no viewport, pois a sidebar pode
estar expandida ou recolhida na mesma largura de tela. Larguras mínimas preservam leitura de cards e
ações quebram para uma nova linha antes de comprimir títulos indefinidamente.

### Breakpoints provisórios

| Faixa de referência       | Evidência do C2               | Estado                     |
| ------------------------- | ----------------------------- | -------------------------- |
| Mobile, até 720 px        | drawer e gutters compactos    | provisório até reflow real |
| Tablet, 721–1180 px       | comportamento padrão do shell | provisório                 |
| Desktop, acima de 1180 px | comportamento padrão do shell | provisório                 |

Breakpoints não são tokens CSS. Os valores permanecem provisórios até a homologação nos viewports
390 × 844, 768 × 1024 e 1440 × 900. O número de colunas e o reflow interno não são inferidos desta
tabela: cada owner usa o espaço disponível e valida seu limite no contexto real.

## Motion

- fast 120 ms: tooltip e microestado;
- normal 180 ms: hover, collapse e drawer;
- slow 240 ms: dialog/popover quando necessário;
- easing standard: `ease`;
- transições afetam propriedades necessárias, não usam movimento decorativo.

O runtime respeita `prefers-reduced-motion`: remove deslocamentos não essenciais e reduz durações
sem eliminar feedback de estado.

## Iconografia

- família outline consistente;
- viewBox e proporção uniformes;
- stroke aproximado de `1.8`, com linecap e linejoin arredondados;
- tamanhos visuais de 16, 20 e 24 px;
- emoji não é iconografia final;
- ícone não substitui label, tooltip ou nome acessível quando a ação não for inequívoca.

## Temas no runtime

A interface oferece Light e Dark. Light é o `:root`; Dark sobrescreve somente tokens temáticos em
`[data-theme="dark"]`. Sem preferência manual salva, o bootstrap consulta
`prefers-color-scheme` antes do mount para reduzir flash de tema incorreto. Uma escolha manual passa
a prevalecer e é persistida localmente; não existe uma terceira opção visível de tema. O provider
resolve, aplica e alterna tema sem conhecer autenticação ou domínio.

## Shell autenticado

- rotas públicas não recebem a navegação autenticada;
- sidebar usa 272 px expandida e 88 px recolhida, com escolha persistida;
- tablet inicia recolhido quando não há escolha explícita;
- mobile usa drawer fechado inicialmente, backdrop, Escape, contenção e retorno de foco;
- Projetos rápidos reutilizam o catálogo autorizado de `GET /projects`, sem request paralelo da
  página Projects;
- a lista mostra até cinco itens, prioriza fixados e completa com recentes não fixados;
- fixados e recentes são preferências locais por usuário, sempre filtradas pela resposta atual do
  backend e nunca usadas como prova de acesso;
- Theme, Configurações e Sair compartilham estado normal neutro; logout reutiliza a sessão vigente;
- motion da sidebar e do drawer respeita `prefers-reduced-motion`.

## Auth público Focused

Login, cadastro, recuperação, redefinição e callbacks públicos usam uma composição Focused: marca
discreta, grande respiro e uma única surface central. Essas rotas não recebem AppShell, sidebar,
navegação de projeto nem controle de tema próprio; elas consomem a mesma resolução Light/Dark do
runtime.

`PublicPageShell` concentra background, marca e posicionamento. `AuthShell` é owner dos formulários
de autenticação, e `StatusSurface` apresenta resultados, restrições e callbacks quando não há campo
editável. A abstração não reúne regras de domínio: cada screen continua responsável por request,
validação, redirect e autorização.

Copy de autenticação é funcional: orienta ação, explica estado ou restrição, identifica campo/ação
ou informa o próximo passo. Eyebrows institucionais, slogans e referências a termos ou avisos
inexistentes não pertencem à interface. GitHub OAuth representa autenticação/identidade; GitHub App
permanece restrita aos fluxos de integração de repositórios.

## Acessibilidade foundations

- referência: WCAG 2.2 AA, sem declaração de conformidade nesta fase;
- foco visível em todos os controles;
- touch target mínimo de 44 × 44 px;
- texto, ícone, label ou forma acompanham a cor semântica;
- ordem de leitura e heading hierarchy refletem a hierarquia visual;
- zoom, reflow, contraste, teclado e tecnologias assistivas serão validados na homologação;
- reduced motion é requisito;
- tooltips não são a única fonte de informação necessária.

Metas futuras auxiliares:

```text
Performance >= 90
Accessibility >= 95
Best Practices >= 95
Accessibility 100 quando possível
```

Lighthouse não substitui validação completa de WCAG.

## Regras de adoção

1. consumir a fonte executável de tokens em `frontend/src/styles/tokens.css`;
2. componentes consomem tokens semânticos, nunca nomes de página;
3. Light e Dark usam o mesmo markup e variantes;
4. media query acompanha o owner do componente;
5. valor local novo exige ausência comprovada de token adequado;
6. não copiar `styles.css` do protótipo para produção;
7. validar contraste e estados renderizados antes de declarar homologação visual;
8. manter a especificação documental e a fonte executável semanticamente alinhadas.

## Homologação

```text
VISUAL HOMOLOGATION: DEFERRED TO WORK
```

A homologação deve comparar os tokens em Light/Dark, componentes básicos, sidebar
expandida/recolhida e viewports de referência. Esta especificação não equivale a implementação nem
a PASS visual do frontend; a inspeção renderizada permanece delegada ao Work.
