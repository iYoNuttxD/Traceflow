# TRACEFLOW HYBRID — Design System

## Estado

```text
Concept C2 — TraceFlow Hybrid
DIREÇÃO VISUAL APROVADA
TOKENS E SHELL AUTENTICADO — IMPLEMENTADOS
AUTH FOCUSED — IMPLEMENTADO
VALIDAÇÃO RENDERIZADA — RASTREADA POR SURFACE
```

Este documento é a referência humana inicial da linguagem visual do TRACEFLOW. A especificação
visual aprovada permanece em [`traceflow-tokens.css`](./traceflow-tokens.css), enquanto a fonte
executável do frontend está em `frontend/src/styles/tokens.css`. O runtime não importa arquivos de
`docs/`. O estado atual de cada surface está no
[inventário de UI](./UI_SURFACE_INVENTORY.md), e a evidência renderizada versionada está no
[Visual Validation Log](./validation/VISUAL_VALIDATION_LOG.md). Protótipos locais e arquivos
ignorados pelo Git não são evidência canônica.

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
- preferência visível em três estados: Sistema, Claro e Escuro;
- Sistema como padrão, resolvido por `prefers-color-scheme`, com overrides manuais persistidos;
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

O conjunto atual possui 120 tokens únicos. Ele permanece abaixo do limite de 150 e evita
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
podem acompanhar o tema, como a compatibilidade temporária do canvas categórico legado de
Traceability. Eles não formam uma segunda paleta e não devem substituir os pares normais de surface
e texto temáticos.

Surfaces legadas neutras devem preferir os pares temáticos normais quando a troca altera somente
cor, sem mudar estrutura ou hierarquia. Uma light island é reservada a composições invariantes cuja
tokenização mudaria a linguagem visual adiada — por exemplo, o canvas categórico de Traceability —
e deve declarar foreground `on-light` legível. Compatibilidade Dark não promove a surface para C2.

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

A aparência compartilhada não determina a semântica. Destinos que trocam de rota usam `nav`, links
e `aria-current="page"`. Conteúdo alternado na mesma rota pode usar `tablist`, `tab` e `tabpanel`,
desde que implemente associação completa dos painéis, roving tabindex e navegação por setas,
Home/End. Roles de tab não são aplicados a links de navegação apenas por semelhança visual.

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

A interface oferece as preferências Sistema, Claro e Escuro em um único botão. Sistema é o default;
Claro e Escuro são overrides manuais. Light é o `:root`, e Dark sobrescreve somente tokens temáticos
em `[data-theme="dark"]`. A preferência persistida é sempre um dos valores `system`, `light` ou
`dark`, preservando escolhas Light/Dark já existentes e tratando valor ausente ou inválido como
Sistema.

Sistema resolve o tema por meio da media feature padrão `prefers-color-scheme` antes do mount e
acompanha mudanças do sistema operacional enquanto permanece selecionado. Browsers que suportam a
media query recebem essa atualização sem reload; quando `matchMedia` não está disponível, o fallback
é Light. Overrides Claro/Escuro ignoram eventos do sistema. O bootstrap anti-FOUC e o provider
aplicam a mesma semântica sem detecção de navegador ou sistema operacional por user-agent.

## Shell autenticado

- rotas públicas não recebem a navegação autenticada;
- o primeiro controle focável oferece “Pular para o conteúdo” e direciona o foco ao início estável
  do conteúdo, evitando a navegação repetitiva da sidebar;
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
inexistentes não pertencem à interface. A remoção da referência pública a um aviso de privacidade
inexistente é intencional; o frontend não deve inventar link, documento ou promessa jurídica sem
uma fonte canônica de produto/jurídica. GitHub OAuth representa autenticação/identidade; GitHub App
permanece restrita aos fluxos de integração de repositórios.

## Settings C2

Settings permanece dentro do AppShell autenticado e usa a mesma navegação interna horizontal de
Project Overview: texto, divisor inferior, indicador ativo, hover e focus-visible. Como os itens
navegam entre rotas, usam links em uma `nav` com `aria-current`, não semântica de tabs ARIA. Em
mobile, os links preservam largura legível e scroll horizontal controlado. O conteúdo usa largura contextual, sem
adotar a coluna estreita de Auth nem ocupar toda a área disponível do shell.

Conta, Segurança, Privacidade e Integrações usam uma surface temática integrada, dividida em seções
internas. Grupos do mesmo formulário usam gap pequeno; grupos distintos usam gap médio; status,
callout ou feedback seguido de novo bloco recebe separação explícita. Divisores não substituem
padding. Danger permanece localizada no título, borda, background semântico e ação — nunca colore a
seção inteira de forma indiscriminada.

Campos de senha digitáveis usam o mesmo controle show/hide de Auth, com nome acessível “Mostrar
senha”/“Ocultar senha” e target mínimo de 44 × 44 px. Campos que definem uma nova senha podem expor
o padrão reativo compartilhado:

- força informativa, inicialmente “Não avaliada”;
- requisito obrigatório com ícone e texto Pendente/Atendido/Não atendido;
- comportamento permitido identificado como informativo;
- confirmação vazia, coincidente ou divergente por texto e estado semântico.

Cadastro, Reset e Segurança reutilizam esse padrão visual. O backend continua autoritativo para a
política e a força não cria requisito funcional adicional. Campos de senha atual não exibem força ou
requisitos de nova senha.

Ações sensíveis iniciadas em Integrações usam um único dialog C2 que reúne impacto,
reautenticação e ação final. Não existe sequência de dois dialogs nem senha permanente no estado
normal da integração. Cancelar recebe foco inicial; trap, Escape, erro inline, processamento sem
submit duplicado e retorno de foco são obrigatórios. Durante o processamento, o dialog conserva ao
menos um controle focável e possui fallback programático no próprio painel; erro de credencial
retorna o foco à senha. Cancelar ou Escape devolvem foco ao trigger, enquanto sucesso que remove o
trigger direciona foco a um heading estável da seção resultante. O mecanismo de reautenticação
continua vindo do contrato vigente — senha local, pré-requisito de senha ou reautenticação GitHub
conforme a conta.

GitHub OAuth e GitHub App são integrações independentes. OAuth apresenta identidade/login em row
compacta quando vinculada; App apresenta instalação, contagens autorizadas e link externo de gestão
em uma row detalhada. As duas usam a mesma linguagem de surface, mas a densidade acompanha os dados
reais e não força alturas iguais. Desvincular OAuth não implica desconectar App, e desconectar App
não implica remover OAuth.

## Linhas de entidades, histórico e confirmação

`EntityRow` é a primitive compartilhada para entidades internas em categorias de
rastreabilidade e qualidade. Reúne identidade, título e metadados disponíveis no
contrato, com a linha inteira acionável: Link nativo para navegação e button para
mudança de subview. Deve conservar foco visível, alvo mínimo de 44px e quebra de
texto responsiva. Links externos GitHub continuam usando `GithubExternalAction`.

`HistoryEventRow` organiza data, evento, mudança e autor com os mesmos tokens de
superfície, borda, espaçamento e tipografia. As quatro colunas viram uma no mobile.
Cada histórico preserva as abas, filtros e paginação realmente oferecidos pelo
seu contrato; paridade visual não autoriza inventar filtros ou dados ausentes.

Confirmações destrutivas reutilizam `ConfirmDialogContent`: título, descrição,
Cancelar e ação danger em superfície compacta, com foco inicial em Cancelar.
Quando a confirmação substitui o conteúdo de um dialog existente, utiliza a
variante de confirmação desse owner, sem segundo popup nem header duplicado.
Trap, Escape, estado busy e retorno de foco continuam sob responsabilidade do dialog.

## Acessibilidade foundations

- referência: WCAG 2.2 AA, sem declaração de conformidade nesta fase;
- foco visível em todos os controles;
- touch target mínimo de 44 × 44 px;
- texto, ícone, label ou forma acompanham a cor semântica;
- ordem de leitura e heading hierarchy refletem a hierarquia visual;
- zoom, reflow, contraste, teclado e tecnologias assistivas são registrados por surface quando
  realmente validados;
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

A homologação é granular por surface. O
[Visual Validation Log](./validation/VISUAL_VALIDATION_LOG.md) é a fonte versionada para a matriz
renderizada realmente executada; o [inventário](./UI_SURFACE_INVENTORY.md) registra o estado atual e
deve ser reavaliado quando uma mudança posterior afetar materialmente layout ou interação.

A matriz aplicável compara Light/Dark, componentes e estados relevantes, sidebar
expandida/recolhida quando presente e viewports de referência. `VISUALLY APPROVED` exige uma entrada
correspondente no log e não equivale a certificação WCAG ou cobertura histórica de todos os
browsers. Testes automatizados sustentam `TECHNICALLY VERIFIED`, mas não substituem inspeção
renderizada. `ENVIRONMENT BLOCKED` registra uma limitação objetiva; não é aprovação nem falha visual.


## Padronização transversal de controles e Details — S1-08 FIX 02

Enums finitos usam `SelectControl` (select nativo com seta compartilhada): status,
prioridade, severidade, ambiente e campo do histórico. O campo tem 44px, tipografia
regular de 16px e tokens de borda, fundo, foco e espaçamento. A seta pertence ao
controle, nunca à altura variável da linha do formulário.

Entidades usam `SearchCombobox`; responsáveis usam o adaptador `ResponsibleCombobox`.
A lista começa fechada e abre por clique, digitação ou teclado. Selecionar, Escape,
saída de foco ou clique externo fecha a lista. A seleção é explícita; respostas
obsoletas não substituem o contexto atual. A lista fica abaixo do campo **no fluxo
normal do container**, com altura limitada e rolagem própria. Não usar portal fixo
nem lista absoluta sobre ações: o corpo do dialog deve acomodar os resultados sem
encobrir o rodapé. Rótulos continuam visíveis e placeholders descrevem a pesquisa.

Responsáveis elegíveis são filtrados pelo contrato; não exibir o sufixo “ativo” nas
opções. Um valor histórico já selecionado permanece legível. Obrigatoriedade vem do
domínio: TC/Defect requerem responsável; Task admite ausência. Exibir apenas um
marcador obrigatório, sem torná-lo parte do nome acessível do combobox. Mensagens de
validação pedem um responsável, sem expor o detalhe de elegibilidade.

`DescriptionSurface` é o padrão de descrição de Task, TestCase e Defect: fundo
secundário, borda padrão, raio médio, padding 16px, gap 12px e texto com quebras
preservadas. Vazio: “Nenhuma descrição informada.” Informações usam o grid unido de
Task Details, com divisórias internas e colapso responsivo. O container da seção é
responsável pelo gap de 24px; não somar margem de seção e gap do stack.

Rastreabilidade e Qualidade usam `ArtifactCategory` e `EntityRow`: cabeçalho com
rótulo/contador, corpo de linhas, rodapé de ações independente. Pares de categorias
alinham cabeçalhos, início das linhas e rodapés. O CTA contextual fica no rodapé;
ações de entidade ficam na linha e não duplicam o contexto. Textos longos quebram
sem deslocar o botão de remoção de 44px. Referências externas preservam ações e
semântica existentes.

Resumos de execução usam `ExecutionSummary` sobre `DetailSurface`, com resultado,
EXEC-id, data, ambiente, identidade histórica do executor, referência testada e
versão do caso. A Validação do defeito usa a execução validante do ciclo atual;
nenhum resultado deve ser deduzido apenas do estado das tarefas.

Catálogos TestCase/Defect pertencem à família de tiles de Sprint/Marco: grid
`sprint-grid`, gap 20px, até três colunas, raio grande, título em até duas linhas,
metadados compactos e ações no rodapé. Tile de criação e tile de entidade têm a mesma
altura por linha no desktop. TestCase mantém 28rem; Defect usa mínimo de 26rem e
cresce com o conteúdo, incluindo o rodapé de reteste em duas linhas. Na faixa móvel
até 34rem, altura automática evita corte de conteúdo. A largura segue as mesmas
colunas e breakpoints de Planning.

Filtros usam `CollapsibleFilterPanel`: rótulos visíveis, placeholders de busca e
wrapper de “Limpar filtros” renderizado somente com filtro ativo. O estado sem
filtros não reserva uma linha vazia. Severidade usa tokens semânticos de status
(baixa/success, média/info, alta/warning, crítica/danger), sem segundo badge junto ao
select em formulário ou filtro.

Correção abre em Defect Details → Tarefas de correção. Criar e vincular são subviews
diretas do mesmo dialog, com contexto DEF/ciclo, Cancelar e ação primária. Voltar
restaura scroll e foco no CTA de origem, inclusive após atualização do catálogo.
Não introduzir um gerenciador intermediário. No Kanban, o marcador usa o ícone bug,
tipografia de metadado e tokens info, com alvo clicável mínimo de 44px; o card inteiro
não recebe tratamento de erro. Históricos mantêm a família `HistoryEventRow` e
shell compacto existente, preservando os filtros específicos de cada domínio.

### Relation cards e densidade de Defect — S1-08 FIX 03

Requisito, Pull Request, Commits, Issues, TestCases e Defects compartilham o shell
`ArtifactCategory` / `task-detail-relation-card`: cabeçalho e contador, corpo com
padding 16px e gap 12px, borda/raio/fundo comuns, rodapé opcional independente.
Rastreabilidade é a referência estrutural de Qualidade. O grid tem duas colunas e
colapsa no mobile; a altura se alinha por linha, conforme conteúdo e ações.
Uma stream vazia não gera wrapper nem espaçamento adicional.

`EntityRow` mantém identidade/título, metadados e chevron sem encolhimento. Nas
categorias de relação, título e metadados têm até duas linhas, com line-height
20px/16px e gap 4px. O nome acessível preserva a identidade e o título completo.
TestCase apresenta status/última execução; Defect apresenta ORIGEM ou CORREÇÃO,
severidade e status como texto compacto. “Criar caso de teste” pertence ao rodapé,
com largura do conteúdo, sem reservar um rodapé vazio no card irmão.

Defect Card informa detecção, ciclo, quantidade de correções e requisito quando
presente. Uma correção exibe TASK-id/status; várias exibem contadores por status.
O estado vazio oferece “Adicionar correção” a quem pode escrever; tarefas
existentes oferecem “Acessar correções”, inclusive em Validado. Aguardando reteste
mantém “Retestar” primário e acesso às correções secundário. VIEWER consulta sem
ações de escrita. O acesso contextual abre o mesmo Defect Details na seção
Correção com scroll/foco semântico. A tarefa abre o Task Details existente; o
histórico do navegador preserva o retorno ao defeito e à seção, sem dialogs
empilhados. Criar/vincular continuam subviews diretas do mesmo dialog.

### S1-09 Etapa 5 — composição final (2026-09-12)

Overview de TestCases, Defects e Traceability usa texto curto como irmão do bloco
de título, na estrutura `sprints-summary__heading` da família Kanban. A quebra
responsiva pertence ao layout existente.

Defect Card conserva o shell `sprint-card tc-card`, separa Rastreabilidade de
Correção/Reteste e usa `LifecycleTrail`: Detecção → Correção → Reteste → Validado.
O passo corrente usa `aria-current="step"`; passos anteriores indicam percurso
alcançado, não eventos históricos nem uma segunda regra de domínio. Reteste
mostra resultado real e ciclo; ausência não recebe resultado presumido.

Inspector organiza identidade/badges, Informações, Rastreabilidade, Relações na
cadeia e ação final. Task acrescenta esforço estimado/realizado com os helpers
canônicos; sem estimativa não há percentual. Ação GitHub reutiliza
`GithubExternalAction`, inclusive estados de link sem underline. Estilos novos
ficam nos owners das superfícies, sem alterar tokens ou CSS global.

Project tabs: Visão geral, Requisitos, Sprints, Marcos, Cronograma, Tarefas,
Kanban, Casos de teste, Defeitos, Repositório, Rastreabilidade. Overflow somente
horizontal; indicador dentro da barra; reposicionamento da aba ativa altera
apenas `scrollLeft`. Links conservam teclado, foco e `aria-current="page"`.

Esforço distingue Histórico de eventos de Sessões atuais. Controles de seleção
quebram linha quando necessário; Evento pertence só ao histórico. Editar/excluir
atua na sessão atual autorizada, nunca no snapshot exibido. Evidência e limites
na seção FINAL TARGETED CORRECTIONS do
[relatório da Etapa 5](../deliveries/S1_09_TRACEABILITY_GRAPH_WORKSPACE_UX_REPORT.md).
