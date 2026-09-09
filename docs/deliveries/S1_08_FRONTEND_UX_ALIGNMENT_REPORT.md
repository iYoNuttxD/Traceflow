# TRACEFLOW S1-08 — FRONTEND UX ALIGNMENT REPORT

Date: 2026-09-08  
Branch: `daniel-dev`  
HEAD: `b59ee4de7aaf9460ad0a05ba0a480129ffd9db95`  
Browser: Chrome, sessão autenticada local; viewports emulados  
Node: 22.23.2

## A — Design Audit

Auditoria anterior às alterações de CSS/JSX: DESIGN_SYSTEM.md,
UI_SURFACE_INVENTORY.md, validation/VISUAL_VALIDATION_LOG.md, tokens executáveis e
traceflow-tokens.css. Inventário atual: quatro documentos em docs/design, mais os tokens executáveis em frontend.
Referências reais: TaskDetailsLayout/TaskTraceability, TaskHistoryDialog,
KanbanDialog, SprintDialog, TestCaseHeaderActions, ConfirmProvider/ConfirmDialog,
SearchCombobox, SprintActionsMenu, TestCaseDetails, PersistedEvidence e EvidenceViewer.
Baseline limpa; hashes dos arquivos rastreados em
`/private/tmp/traceflow-s108-alignment/baseline.json`.

## B — Parity Matrix (antes do código)

| Surface | Canonical reference | Reuso implementado |
| --- | --- | --- |
| Defect Details | Task Details | task-detail-section/grid, ArtifactCategory |
| Defect Edit | TestCase edit | SprintDialog, campos e subtitle |
| Defect Delete | Task/TestCase delete | ConfirmProvider e button-danger |
| Defect History | Task History | primitive de event row e mesmo chrome |
| TestCase History | Task History | event rows; manter tabs e execuções |
| Execution Details | S1-07 | identidade/subtitle; resultados e evidências preservados |
| Correction Tasks | Task entity/traceability | rows compactas e tarefas atuais |
| Task Quality | Task Traceability | grid e ArtifactCategory |
| Severity | tokens semânticos | baixa success, média info, alta warning, crítica danger |
| Entity rows | tc-entity-link | primitive pequena compartilhada de navegação interna |
| Responsible | SearchCombobox | corrigir fechamento inline e asterisco no consumer |
| GitHub | GithubExternalAction | anchor externo existente |
| Catalog | TestCases/Sprints/Kanban | manter dimensões e footer; marker info |

Contratos de leitura já oferecem TestCases por taskId e Defects por originTaskId/
correctionTaskId, com paginação. Qualidade não exige mudança de backend nem N+1.
Históricos de Defect/TestCase não suportam filtros por data/campo; não criar filtros locais falsos.

## C — Findings

| Finding | Before / causa | Change | After |
| --- | --- | --- | --- |
| 01 Delete | ação secundária sem semântica destrutiva | button-danger e menu danger | exclusão identificável nos dois temas |
| 02 Internal links | anchors crus em entidades internas | EntityRow com identidade, metadata e foco | linha inteira navegável; GitHub continua ação externa |
| 03 Spacing | composição própria, contexto de origem repetido e gaps acumulados | seções de Task Details, origem resumida na edição, margens locais | densidade coerente, altura conforme conteúdo |
| 04 Execution header | título genérico sem identidade | EXEC no título, TC/título no subtitle | origem histórica identificável |
| 05 Failed step | defeitos dentro da coluna de resultado | seção após o conteúdo do passo | largura completa e estado vazio explícito |
| 06 Severity | representação pouco distinta; label sobrescrevia cor | variantes success/info/warning/danger com texto | mesma badge em cards, edição, detalhes, histórico e filtro selecionado |
| 07 Confirmation | confirmação dentro do chrome completo | ConfirmDialogContent e variante compacta no mesmo dialog | sem seta/header duplicado; Cancelar recebe foco |
| 08 Responsible | inline sem fechamento consistente; aberto sem intenção | dismissal compartilhado, blur/outside/seleção/Escape, portal contido | pesquisa encerra corretamente e desmonta com o formulário |
| 09 Required | label e componente adicionavam asterisco | apenas required no componente | Responsável * uma vez |
| 10 Edit subtitle | orientação ausente | subtitle de edição | intenção explícita |
| 11 View correction | abria diretamente gerenciamento | details com foco/scroll na seção Correção | consulta da tarefa existente antes de gerenciar |
| 12 Current tasks | manager só mostrava ações | reutiliza CorrectionTaskRows do ciclo atual | tarefa existente visível; vazio apenas com zero |
| 13 Task header | Criar caso de teste fora do contexto | ação movida para Qualidade | header Editar/Excluir/Fechar |
| 14 Task Quality | relações dispersas/ausentes | grid Casos de teste e Defeitos, três catálogos filtrados | ORIGEM/CORREÇÃO explícitas e criação contextual |
| 15 Kanban | eyebrow fraco; textos longos ampliavam conteúdo | marcador info com ícone; colunas internas minmax(0,1fr) | correção perceptível sem pintar card inteiro; conteúdo contido |
| 16 History | linhas próprias divergentes | HistoryEventRow compartilhado pelos três históricos | data, evento, mudança e autor na mesma estrutura |
| 17 Dimensions | chrome de histórico mais largo e spacing desigual | histórico 46rem; confirmação 32rem; tokens de superfície | família visual equivalente, mantendo especializações |
| 18 Design docs | risco de novos padrões paralelos | auditoria antes do código, inventário e log atualizados | primitives canônicos reutilizados |
| 19 Actions | duplicações no header/correção/validação | gestão na seção Correção, reteste no header autorizado, Qualidade única | ações próximas ao contexto correspondente |

Achados adicionais da inspeção: histórico aberto por deep link perdia TC/título;
`switchView` agora conserva a identidade antes de desmontar detalhes. Regressão
automatizada cobre ida às duas abas e retorno. CSS do painel respeita `hidden`.
A badge selecionada do filtro mantém nome acessível estável no select.

## D — Delete actions

`button button-danger` e `SprintActionsMenu` com `danger: true`.
O conteúdo canônico foi extraído de ConfirmDialog para `ConfirmDialogContent`.
DefectFlow o renderiza na variante `confirmation` do SprintDialog, sem abrir
segundo modal. Cancelar inicial, Tab/Shift+Tab, Escape e retorno ao acionador
preservados. Comparação renderizada com exclusão de Task e TestCase nos dois
temas: mesma superfície de 32rem, título, descrição e duas ações.

A confirmação canônica de Task já fica sobre Task Details (dois dialogs no DOM);
esta rodada não estendeu esse empilhamento ao Defect. Nenhuma exclusão foi
confirmada durante a inspeção real.

## E — Internal links

EntityRow substitui links crus de TC/EXEC na detecção, requisito, tarefas de
origem e correção, defeitos do passo e vínculos do TestCase. Qualidade usa a
mesma row. Link nativo para mudança de rota, button nativo para subview, nome
acessível, foco visível e alvo mínimo de 44px. IDs, títulos e metadata vêm do DTO;
campos não fornecidos pelo contrato não foram inventados. GithubExternalAction
mantém URL externa, nova aba e rel seguro.

## F — Spacing

Defect Details reutiliza task-detail-section/grid e ArtifactCategory. A origem
na edição mostra EXEC/TC/passo e versão, sem repetir o próprio defeito nem a
observação extensa. Formulário usa alinhamento inicial das colunas, sem esticar
responsável para acompanhar a badge. Registered Defects tem heading sem margem
acumulada e gap de token. Manager e histórico têm altura conforme conteúdo.
As áreas de comentários existentes permanecem no layout canônico de Task.

## G — Execution Details

Cabeçalho `EXEC-0008`, subtitle com tipo da visualização, TC e título do snapshot.
Passo preserva ação, resultado esperado/observado e evidências; defeitos vêm
depois desses campos, em largura total. FAIL sem defeitos informa zero; PASS e
BLOCKED não oferecem registro indevido. Fluxo de registro contextual e snapshots
históricos continuam cobertos pelos testes existentes. Nenhuma execução foi
submetida nesta rodada de inspeção.

## H — Severity

| Severity | Variant/token |
| --- | --- |
| Baixa | --color-success-text / --color-success-surface |
| Média | --color-info-text / --color-info-surface |
| Alta | --color-warning-text / --color-warning-surface |
| Crítica | --color-danger-text / --color-danger-surface |

Texto sempre presente. DefectBadge é o único renderer, inclusive nas mudanças
de severidade do histórico e junto do select nos formulários/filtros.
Especificidade protege a badge contra a regra genérica `.field span`.

## I — SearchCombobox

Causa: dismissal e blur não eram equivalentes no modo inline; minQueryLength=0
podia abrir sem interação. Agora começa fechado, fecha ao selecionar/limpar,
clique externo e blur, e Escape consome apenas a lista aberta. MouseDown em
opção conserva foco até concluir seleção. Portal fixed permanece dentro do dialog
e fecha com scroll/resize/desmontagem; não há listener órfão nem popup paralelo.

Inspeção real: edição do responsável, lista com opção, seleção, clique externo
e Escape mantendo o formulário. O screenshot com clip pode provocar reposição
de viewport e fechar o popup pelo listener de resize; teclado foi verificado
sem intercalar esse screenshot. Captura normal mostrou a lista corretamente.
Consumers cobertos: DefectForm, casos de teste, filtros/Planning e componentes
compartilhados pela suíte completa. Regressões inline/fixed, stale response e
unmount constam dos testes focados.

## J — Correction UX

Ver correção no DEF-3 abre Details e leva foco à região Correção; observado no
DOM e no render. Gerenciar correção abre ações de criação/vínculo e lista TASK-15
ou TASK-17 já existente. DEF-2 mostra vazio real. Não existe CTA de gestão
duplicado no header. Backend continua responsável pelo status e pelos ciclos;
retestes anteriores permanecem disponíveis. Navegação de retorno conserva foco.

## K — Task Quality

Após Rastreabilidade, grid de duas categorias no desktop e uma coluna no mobile.
Casos mostram status e última execução. Defeitos mostram severidade, status e
relação ORIGEM/CORREÇÃO. A criação de caso está no card de casos, somente para
quem pode escrever; reutiliza formulário/prefill existente. Task e requisito
singular continuam herdados. Contexto de correção isolado foi removido do painel.

Leituras existentes: TestCases por taskId, Defects por originTaskId e
correctionTaskId, três consultas paginadas por contexto (sem chamada por item).
Loading, erro, retry, paginação incremental e respostas fora de ordem são
tratados. Testes preservam página anterior quando load-more falha. Snapshots
congelados continuam sem reconstruir relações atuais ausentes do snapshot.

## L — Kanban

Task normal e Task de origem mantêm card comum. Task de correção exibe ícone
canônico e marcador informativo com DEF-ID navegável, mantendo título,
responsável, prazo, sprint e rastreabilidade. Vários defeitos usam disclosure
existente, com quebra de conteúdo e alvos de 44px; essa variante foi coberta
por teste, não criada artificialmente no banco para render.

Nomes longos de sprint agora truncam dentro da largura disponível. A rolagem
horizontal interna do quadro em mobile permanece intencional; não há overflow
horizontal da página. Nenhum drag/move foi executado na inspeção desta rodada.

## M — History parity

TaskHistoryDialog, DefectHistory e alterações de TestCaseHistory usam o mesmo
HistoryEventRow: data, evento, mudança e autor, quatro colunas/uma no mobile,
mesmo padding, borda, radius, fundo e tipografia. Históricos usam 46rem.
Task conserva seus filtros reais; TestCase conserva abas Execuções/Alterações
e paginação; Defect conserva eventos de ciclo/reteste. Não foram inventados
filtros ausentes da API. Autor indisponível continua identificado pelo ID
quando esse é o único dado do contrato.

## N — Visual Matrix

Chrome autenticado, build de desenvolvimento local com APIs reais e dados
sintéticos persistidos já existentes. Desktop/tablet: altura 1000; mobile:
390×844. Inspeção por screenshots e interação real, com consulta de geometria
DOM para complementar a observação. PASS se refere ao estado carregado descrito,
não a todos os estados de erro/permissão possíveis.

| Surface | Light 1440 | Dark 1440 | Light 768 | Dark 768 | Light 390 | Dark 390 | Light 1280 | Dark 1280 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Defect Details | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Edit | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Delete / cancelar | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Execution Details | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Failed Step / Registered Defects | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Correction section | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Correction Manager / tarefa existente | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Defect History | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| TestCase History / alterações | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Task Details | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Task Quality / origem | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Kanban Correction | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |

Evidência reproduzível: cenário aguardando reteste DEF-4 / EXEC-0008 / TC-5 /
TASK-16 e TASK-17; correção em andamento DEF-3 / TASK-15; vazio de correção DEF-2.
Comparadores: Task Details, histórico TASK-15, exclusão de tarefa e TC-5.
Inspeções suplementares: Qualidade de tarefa de correção, gerente vazio, Ver
correção, menu mobile, foco de Cancelar e popup do responsável. As quatro
severidades estão representadas no catálogo. Nenhuma página/dialog inspecionado
teve overflow horizontal; Kanban mantém scroll interno documentado.

Capturas foram observadas durante a sessão. Este registro versionado descreve
cenários, dimensões, resultados e limites; não depende de arquivos temporários
ou histórico de chat como autoridade. URLs do ambiente e dados pessoais não
integram a evidência canônica. Capturas intermediárias com tema divergente do
rótulo foram descartadas; o tema foi confirmado no DOM antes da revalidação.

Limites: VIEWER, falhas de rede, conflitos, múltiplos defeitos por tarefa e estados
raros foram cobertos por automação, sem aprovação visual por inferência. Não há
certificação cross-browser, WCAG integral ou novo QA de lifecycle completo.

## O — Usability Inspection

Ações movidas: criação de caso para Qualidade; gestão para Correção.
Removidas: duplicação de contexto de correção, gestão no header e CTA redundante
de reteste no corpo. Preservadas: edição/exclusão/fechar, ações de evidência,
registrar defeito no passo FAIL, criação contextual e histórico. Links internos
viraram rows; links GitHub mantiveram affordance externa. Header longo quebra
sem esconder ações; menu mobile conserva teclado e foco. Confirmação tem foco
seguro e pode ser cancelada sem chamada de exclusão.

## P — Tests

- Focados iniciais: 239/239 em 13 arquivos.
- Focados finais: 49/49, incluindo deep link → histórico e os novos contratos UX.
- Repeatability crítica: 71 testes × 10 execuções consecutivas = 710 PASS,
  cinco arquivos, sem retry: UxAlignment, RetestContext, ExecutionBridge,
  SearchCombobox e TestCases.
- Frontend completo: 956/956, 80 arquivos.
- Cobertura final: ver tabela de gates; thresholds do projeto respeitados.
- Backend preventivo: 119/119, domínio de defeitos e casos/evidências.

Asserções antigas foram ajustadas somente para mudanças de intenção desta rodada
(navegação por entidade, Qualidade e fechamento). Não foram removidas proteções
de lifecycle, snapshot, Viewer, concorrência, evidência ou Frozen.

## Q — Gates

| Gate | Resultado |
| --- | --- |
| focused | PASS: 49; conjunto ampliado 239 |
| 10x repeatability | PASS: 71 × 10, sem retry |
| frontend full | PASS: 956, 80 arquivos |
| frontend coverage | PASS: 956 testes; statements 80.46%, branches 74.98%, functions 75.66%, lines 82.63% |
| lint | PASS |
| format | PASS |
| build | PASS |
| backend affected | UNCHANGED; prevenção 119 PASS |
| architecture | PASS |
| git diff --check | PASS |

Logs locais em `/private/tmp/traceflow-s108-alignment/`: final-focused.log,
final-repeat-1.log até final-repeat-10.log, final-full.log, release-coverage.log,
release-lint.log, release-format.log, release-build.log, backend-unit.log e
architecture.log. Resultados são locais; CI remoto não foi executado nesta rodada.

## R — Backend impact

Schema: UNCHANGED. Migrations: UNCHANGED. Domain: UNCHANGED.
Lifecycle: UNCHANGED. Authorization: UNCHANGED. Read DTO: UNCHANGED.
Nenhuma chamada direta ao banco nem migração foi necessária nesta rodada.
Os dados de homologação anteriores foram preservados; formulários e confirmações
foram cancelados. APIs continuam decidindo permissões, status e transições.

## S — Git final

Branch `daniel-dev`; HEAD `b59ee4de7aaf9460ad0a05ba0a480129ffd9db95`.
Baseline limpa. Alterações restritas a frontend, testes correspondentes e docs
de design/entrega. Os 438 arquivos rastreados de backend mantêm os hashes da
baseline, incluindo schema, migrations e autorização. `git diff --check`: PASS.
Nenhum arquivo fora de frontend e dos quatro documentos de design/entrega foi alterado.


`git status --short` (36 arquivos rastreados modificados e oito novos):

```text
 M docs/design/DESIGN_SYSTEM.md
 M docs/design/UI_SURFACE_INVENTORY.md
 M docs/design/validation/VISUAL_VALIDATION_LOG.md
 M frontend/src/features/defects/DefectsScreen.jsx
 M frontend/src/features/defects/components/CorrectionManager.jsx
 M frontend/src/features/defects/components/DefectDetails.jsx
 M frontend/src/features/defects/components/DefectFlow.jsx
 M frontend/src/features/defects/components/DefectForm.jsx
 M frontend/src/features/defects/components/DefectHistory.jsx
 M frontend/src/features/defects/defects.css
 M frontend/src/features/defects/index.js
 M frontend/src/features/defects/model/defects.js
 M frontend/src/features/schedule/components/SprintDialog.jsx
 M frontend/src/features/tasks/components/KanbanBoard.css
 M frontend/src/features/tasks/components/TaskCorrectionContext.css
 M frontend/src/features/tasks/components/TaskCorrectionContext.jsx
 M frontend/src/features/tasks/components/TaskDetailsLayout.jsx
 M frontend/src/features/tasks/components/TaskDetailsPanel.css
 M frontend/src/features/tasks/components/TaskDetailsPanel.jsx
 M frontend/src/features/tasks/components/TaskHistoryDialog.jsx
 M frontend/src/features/testCases/TestCasesScreen.jsx
 M frontend/src/features/testCases/components/TestCaseDetails.jsx
 M frontend/src/features/testCases/components/TestCaseHistory.jsx
 M frontend/src/features/testCases/styles/test-cases.css
 M frontend/src/shared/components/ConfirmDialog.css
 M frontend/src/shared/components/ConfirmDialog.jsx
 M frontend/src/shared/components/SearchCombobox.jsx
 M frontend/src/shared/index.js
 M frontend/test/components/FrozenTaskDetails.test.jsx
 M frontend/test/components/SearchCombobox.test.jsx
 M frontend/test/components/TaskPresentation.test.jsx
 M frontend/test/defects/Defects.test.jsx
 M frontend/test/defects/RetestContext.test.jsx
 M frontend/test/testCases/TestCases.test.jsx
 M frontend/test/testCases/evidence-viewer.test.jsx
 M frontend/test/testCases/final-ux.test.jsx
?? docs/deliveries/S1_08_FRONTEND_UX_ALIGNMENT_REPORT.md
?? frontend/src/features/defects/components/DefectHeaderActions.jsx
?? frontend/src/features/tasks/components/TaskQuality.jsx
?? frontend/src/shared/components/EntityRow.css
?? frontend/src/shared/components/EntityRow.jsx
?? frontend/src/shared/components/HistoryEventRow.css
?? frontend/src/shared/components/HistoryEventRow.jsx
?? frontend/test/defects/UxAlignment.test.jsx
```

`git rev-parse HEAD`: `b59ee4de7aaf9460ad0a05ba0a480129ffd9db95`.
`git diff --check`: saída vazia, código 0.

## T — Operations

NO COMMIT. NO PUSH. NO MERGE. NO REBASE. NO RESET.
Também não houve force-push, clean, stash, alteração de schema, comunicação
externa, operação em produção ou início de S1-09.

## Resultado

**S1-08 FRONTEND UX ALIGNMENT — PASS LOCAL.**

Os 19 findings foram tratados. Matriz renderizada aprovada para os estados
documentados; gates locais passaram. CI remoto não executado. Os limites da
inspeção constam da seção N e não são apresentados como aprovação visual.
