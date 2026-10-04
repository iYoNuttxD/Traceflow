# S2 P9.1 — Personalized dashboard visual polish

Data: 04/10/2026. Escopo: toolbar de Meu painel e ordenação no editor existente.

## 1. Baseline

| Item | Valor antes das alterações |
| --- | --- |
| Branch | `daniel-dev` |
| HEAD | `88c6ef85c9851ad88fe926e9e9c0014a8ebec407` |
| Working tree | Limpa; `git status --short` sem saída |
| Diff | `git diff --check` e `git diff --stat` sem saída |
| Node padrão | 26.9.0 |
| Node dos gates | 22.23.3, `/opt/homebrew/opt/node@22/bin` |

Gates executados com `NODE_OPTIONS=--no-experimental-webstorage`.
Sem commit/push, reset, clean, stash, merge ou rebase.

## 2. Fontes e auditoria

Revisados Design System, UI Surface Inventory, Visual Validation Log e
`S2_P9_PERSONALIZED_INDICATORS_DASHBOARD_REPORT.md`, além do editor, toolbar,
CSS e testes atuais. A baseline P9 está no HEAD acima.

A toolbar de Meu painel impunha duas linhas inclusive em desktop. O editor
oferecia somente botões Mover. O frontend já usa drag nativo no Kanban; não há
biblioteca de sortable adequada instalada. A dependência de grafo não foi
reutilizada para uma lista de até 12 itens. Nenhuma dependência foi adicionada.

## 3. Alterações

- Toolbar de Meu painel com tabs e ações em duas colunas na mesma linha desktop,
  divisor comum e wrap controlado em áreas menores que 42rem.
- Em 1280–1439px, tabs com fonte 13px, padding horizontal 8px e gap 2px. Targets
  preservados: 48px nas tabs e 44px nas ações.
- Alça de seis pontos com nome acessível, posição e target 44px. Somente a alça
  inicia drag. Linha de origem suavizada e marcador de destino superior/inferior.
- Hover apenas altera o destino visual quando ele muda. Drop reorganiza o draft.
  Cancelamento do gesto limpa o feedback; drop externo é ignorado.
- Setas do teclado na alça e botões Mover existentes permitem ordenar sem drag.
  Foco acompanha o item; região viva anuncia sua posição.

Arquivos de implementação: `DashboardEditor.jsx` e `PersonalizedDashboard.css`.
O teste `PersonalizedDashboard.test.jsx` ganhou cinco cenários focados e uma
asserção adicional de exclusividade da ação Personalizar.

## 4. Persistência, async e limites

Persistência, autorização, ownership, catálogo, máximo de 12, API e modelo
permanecem os mesmos. Ordem continua sendo o array `widgets`, versão 1.
Não há alteração de backend, schema, migration, lockfile, fórmulas, Health ou
filtros. Picker, busca, categoria, remoção e confirmação de reset foram preservados.

Testes comprovam: nenhum PUT ou refetch de agregado/preferência/catálogo durante
drag/hover/drop; Save envia exatamente um array ordenado e solicita o agregado uma
vez. Cancel descarta o draft. Estado de drag reside no editor; não há listener de
pointer move que atualize a página inteira. Não foi criado mecanismo de refetch
por foco. A regressão existente de focus/visibility passou; não se alega novo
teste nativo Alt+Tab nesta rodada.

## 5. Inspeção real

Chrome autenticado com API real, Project 2 existente, período 01–30/09/2026,
America/Sao_Paulo, Sprint A (16). Dados observados: progresso 70%, WIP 4,
taxa de sucesso 36,67%, implementação 25% com referência 70%, Health 70/100,
cobertura 81%. Nenhum seed ou alteração dos fatos do domínio.

As nove views foram abertas. Personalizar aparece somente em Meu painel;
refresh aparece em todas. Período/Sprint continuaram na URL ao navegar.
Refresh real atualizou a metadata do resumo. Console da aba de validação sem
warnings/erros novos.

Drag nativo efetivamente mudou WIP da segunda para a primeira posição e, em
outra execução, Progresso da primeira para a quarta. Ordem final e foco foram
conferidos no DOM/render. Cancelar e reabrir recuperou os seis itens originais.
Save após drop foi validado por teste automatizado; a inspeção desta rodada
descartou seus drafts, sem salvar preferências de homologação.

### Matriz de toolbar

| Viewport | Tabs: client/scroll (px) | Ações | Documento sem overflow |
| --- | --- | --- | --- |
| 1440 | 879/879 | Mesma linha | Sim |
| 1280 | 727/727 | Mesma linha | Sim |
| 1024 | 463/797 | Mesma linha; tabs com scroll interno | Sim |
| 768 | 432/797 | Wrap dentro da composição | Sim |
| 430 | 398/797 | Wrap dentro da composição | Sim |
| 390 | 358/797 | Wrap dentro da composição | Sim |
| 360 | 328/797 | Wrap dentro da composição | Sim |

Dark inspecionado nas sete larguras. Light inspecionado em 1440/1280/768/390.
Capturas móveis de 430/390 foram repetidas após estabilizar a transição da
sidebar; capturas durante essa transição não fundamentam a aprovação.

Editor padrão: desktop Light/Dark e mobile Light/Dark; amostra tablet 768 Light.
Editor com 12: desktop 1440 Light e mobile 360 Dark. Contagem, limite, títulos,
ações e rodapé rolável continuaram legíveis. Botões Add ficam desabilitados no
máximo; os controles de ordenação continuam disponíveis.

Teclado real: ArrowUp/Down na alça, Enter nos botões Mover, primeira/última posição,
Tab/Shift+Tab contidos no diálogo e foco em Personalizar após Cancel. Controles
móveis de 44px oferecem fallback; não se alega drag touch em aparelho físico ou
certificação de leitor de tela/WCAG.

### Pendência de inspeção durante o gesto

**MEDIUM / DND — evidência visual pendente.** O reorder nativo funcionou, e testes
confirmaram os atributos de origem/destino, mas a ferramenta executa o gesto como
uma ação indivisível. As tentativas de captura não mostraram o estado intermediário
de forma verificável. Foi solicitada confirmação manual do marcador de destino;
ela ainda não foi recebida no fechamento deste relatório. Não há bug confirmado,
mas este critério obrigatório não pode ser marcado como visualmente aprovado.

## 6. Gates com Node 22

| Gate | Resultado |
| --- | --- |
| Frontend focado: PersonalizedDashboard + DashboardPanel | 55 PASS |
| Frontend `npm test` | 1.338 PASS / 109 arquivos |
| Frontend `npm run test:coverage` | PASS; S/B/F/L 85,20 / 79,88 / 81,05 / 87,61% |
| Frontend lint, format:check, build | PASS |
| Backend regressão completa via `npm run test:coverage` | 1.522 PASS / 134 arquivos; 5 skips legados em 2 arquivos |
| Backend coverage S/B/F/L | 92,25 / 85,54 / 95,53 / 94,64% |
| Backend lint e format:check | PASS |
| Prisma validate e generate | PASS, sem migration |
| Architecture check | PASS |
| Security secrets | PASS |
| Validação local da política CI | PASS |
| Testes locais de CI/audit | 83 PASS |
| Formatação dos arquivos de política CI | PASS |
| Security gate canônico frontend/backend | PASS: 0 HIGH, 0 CRITICAL, 0 exceções usadas |
| `git diff --check` | PASS |

Regressão backend inclui suites unitárias e integration/API. Validação local CI
executou `validateRepositoryCi()`, os testes `validate-ci.test.mjs` e
`check-npm-audit.test.mjs` e a verificação de formato da política. Audit executou
`scripts/check-npm-audit.mjs` para ambos os pacotes com a política canônica
existente. Não houve mudança de política nem omissão de dependências dev.
Zero HIGH/CRITICAL não equivale a zero achados moderate. Gates locais não são
execução de CI hospedada.

## 7. Documentação e evidências

Atualizados Design System, UI Surface Inventory e Visual Validation Log.
`PERSONALIZED_DASHBOARD_V1.md` recebeu somente correção da descrição de apresentação;
contrato permanece v1.

Evidências transitórias: `/private/tmp/traceflow-p91-20261004/`.

- `before-toolbar.jpg`: baseline anterior.
- `toolbar-{1440,1280,1024,768,430,390,360}-dark.jpg` e amostras `*-light.jpg`.
- `editor-reordered-dark.jpg`, `editor-default-*`, `editor-reorder-390-light.jpg`.
- `editor-max-1440-light.jpg`, `editor-max-360-dark.jpg`, `editor-footer-360-dark.jpg`.
- `responsive-matrix.json`, `canonical-actions.json`, `console.json`.
- `*-gates.json` e logs individuais dos gates.

Capturas chamadas `editor-during-drag-dark.jpg` ou `native-drag-*`, geradas nas
tentativas, **não** comprovam feedback durante drag e não são evidência de aceite.
Override de viewport removido e aba auxiliar encerrada. Aba original mantida
para a confirmação manual pendente. Tema Escuro restaurado na aba de validação.

## 8. Veredito

**S2 P9.1 PERSONALIZED DASHBOARD VISUAL POLISH — CHANGES REQUIRED**

Implementação, regressão, toolbar, responsive e teclado aprovados nos cenários
descritos. Pendência única: **MEDIUM / DND**, inspecionar o feedback visual durante
o gesto real. Sem confirmação desse critério, não se declara PASS LOCAL.

Sem commit/push. P10 não iniciado.
Sugestão de commit: `refactor: polish personalized dashboard controls`.
