# S1-08 — TRACEFLOW UI Standardization FIX 02

Data: 2026-09-09. Resultado: **TRACEFLOW UI STANDARDIZATION — PASS LOCAL**.
Escopo: padronização transversal Hybrid C2 de Task, TestCase, Defect e Kanban.
Checkout: `daniel-dev`, HEAD `66a2b0e2638cb2714b68b98d8c703eae12b0981a`.
Árvore inicial limpa. Implementação, automação e renderização locais; CI remoto e
S1-08 FINAL INTEGRATED QA não fazem parte deste encerramento.

## A — Design Audit

Antes do código foram lidos `docs/design/DESIGN_SYSTEM.md`,
`UI_SURFACE_INVENTORY.md`, `validation/VISUAL_VALIDATION_LOG.md`,
`traceflow-tokens.css` e os tokens executáveis em `frontend/src/styles/tokens.css`.
Foram inspecionados no Chrome autenticado: Sprint/Marco, Kanban, Task Details e
Qualidade, TC catálogo/Details/alterações/execução e DEF catálogo/Details/histórico.
A matriz anterior ao código foi registrada em
`/private/tmp/traceflow-s108-fix02/parity.md` antes das edições.

| Elemento | Estado anterior observado | Decisão canônica aplicada |
|---|---|---|
| Controles | responsáveis nativos e buscas diferentes | ResponsibleCombobox sobre SearchCombobox; enums SelectControl |
| Description | texto Task simples, superfície TC | DescriptionSurface comum aos três |
| Information | Task unido, TC em caixas separadas | grid unido de Task Details |
| Rastreabilidade / Qualidade | cabeçalhos e ações desalinhados | ArtifactCategory com header/body/footer; EntityRow |
| Catálogos | Sprint/Marco em 3 colunas, TC/DEF em 4 estreitas | família sprint-grid e tile compacto de 28rem |
| Correção | View/Manage e manager intermediário | tarefas e dois CTAs diretamente em Details |
| Validação | texto isolado sem resumo equivalente | ExecutionSummary compartilhado com TC |
| Histórico | mesma família existente | preservar HistoryEventRow e shell; padronizar select de campo |
| Marcador Kanban | símbolo de código e bloco alto | bug, metadado info e alvo de 44px |
| Busca aberta | posicionamento fixo/portal | resultados dentro do fluxo do dialog |

Referência renderizada inicial: Sprint 405,34×417px e Marco 405,34×448px,
com três colunas na janela inicial. A altura do Marco fundamenta os 28rem de TC/DEF;
a geometria das Sprints não foi alterada. A proposta inicial de lista absoluta foi
substituída pelo fluxo normal após observar recorte do rodapé durante a interação.

Rastreabilidade dos 22 findings da solicitação:

| Findings | Correção / evidência neste relatório |
|---|---|
| 01–02 | geometria de categorias e linhas — D/L/M |
| 03 | wrapper condicional do Kanban — F/M |
| 04 | marcador bug compacto — J/M |
| 05 | resultado esperado histórico — K/M |
| 06–07 | oito rótulos e limpar condicional — F/M |
| 08–09 | adaptador transversal e copy de responsável — B/C/K |
| 10 | severidade sem duplicação — I/K |
| 11–12 | DescriptionSurface e grid unido — D/M |
| 13, 15–16 | tarefas e criar/vincular diretos, manager removido — G/M/N |
| 14 | resumo de execução na Validação — H/M/N |
| 17–18 | tiles da família Planning — E/M |
| 19 | família de histórico preservada — D/M/N |
| 20–21 | remoção 44px e EntityRow — D/K/M |
| 22 | controles/tokens/espaçamento compartilhados — B/P; limites de domínio em C/Q |

## B — Control Standard

| Tipo | Padrão | Comportamento |
|---|---|---|
| Status / prioridade / severidade / ambiente | SelectControl | enum finito, 44px, seta comum, 16px regular |
| Responsável | ResponsibleCombobox | pesquisa por nome; seleção explícita; identidade por id |
| Requisito | SearchCombobox / EntityRow | pesquisa e seleção; referência identificada na leitura |
| Tarefa | SearchCombobox / EntityRow | pesquisa; títulos longos; lista selecionada removível |
| TestCase | SearchCombobox / EntityRow | filtro remoto e navegação contextual |
| Defect | EntityRow e seleção contextual de candidatos | contrato existente; nenhuma lista inventada |
| Execução / versão testada | TestedReferencePicker sobre SearchCombobox / ExecutionSummary | referência pesquisável; histórico preservado |
| Sprint / Marco | SearchCombobox | opções elegíveis; seleção histórica existente preservada |

Não foi criado outro sistema de botões. Permanecem `button-primary`, secondary,
compact e icon conforme contexto, com Cancelar e ação primária no rodapé. A lista de
busca tem altura limitada, scroll próprio e posição relativa no fluxo; não cobre o
rodapé. Clique/digitação/teclado abrem; seleção/Escape/blur/clique externo fecham.
Debounce, abort e proteção contra respostas fora de ordem permanecem existentes.

## C — Responsible migration

| Consumidor | Alteração |
|---|---|
| TaskForm | responsável pesquisável e opcional; prioridade SelectControl; Sprint pesquisável |
| Task Details em edição | mesmo responsável e prioridade; campos alinhados com lista aberta |
| TestCase form | mesmo adaptador, obrigatório, uma indicação visual |
| TestCase filtros | mesmo adaptador, preservando opção de filtrar vínculos inativos |
| Defect form | mesmo adaptador obrigatório; erro “Selecione um responsável.” |
| Defect filtros | mesmo adaptador, sem sufixo ativo |
| Correction Task | composição existente de TaskForm; responsável opcional conforme Task |
| Kanban filtros | mesmo adaptador, sem linha de limpeza vazia |

Elegibilidade continua baseada nos membros/usuários permitidos pelo contrato.
Rótulo de seleção histórica permanece disponível quando não consta nas opções de
escrita. Task **não passou a exigir responsável**: isso alteraria o domínio. Os
editores próprios de rastreabilidade GitHub de Task foram preservados; esta rodada
não substitui indiscriminadamente todos os controles legados do produto.

## D — Details parity

| Element | Task | TestCase | Defect |
|---|---|---|---|
| Description | DescriptionSurface | DescriptionSurface | DescriptionSurface |
| Information | grid unido, divisórias | mesmo grid | mesmo grid |
| Traceability | ArtifactCategory; requisito EntityRow; GitHub canônico | ArtifactCategory / EntityRow | ArtifactCategory / EntityRow |
| Quality | categorias Casos de teste e Defeitos | resumo de execução compartilhado | tarefas de correção e ExecutionSummary |
| History | HistoryEventRow; filtro de campo compartilhado | HistoryEventRow; abas existentes | HistoryEventRow; ciclo/eventos |

Comparação visual entre as três descrições, grids e categorias: mesmo fundo
secundário, borda, escala de texto, espaçamento e linha de entidade. A largura maior
de Task atende a coluna de comentários; não foi removida essa função. Históricos
mantêm diferenças de conteúdo e adaptação móvel existentes, dentro da mesma família.
O gap entre seções TC passou a ter um único proprietário, evitando 24px + 24px.

## E — Catalog Cards

Referência: SprintCard/MarcoCard, `sprint-grid`, raio grande, gap 20px e breakpoints
de Planning. TC/DEF e tiles de criação usam altura desktop **28rem (448px)**;
largura acompanha o grid, com até três colunas. Até 34rem, altura automática.
Título limitado a duas linhas; metadados compactos; rodapé permanece na base.
Foram comparados os quatro catálogos, incluindo títulos longos, tile de criação e
rodapé. As capturas de 1440/1280/768/390 não mostraram overflow da página.

## F — Filters

Defect apresenta oito rótulos: Pesquisar, Status, Severidade, Responsável, Requisito,
Tarefa de origem, Tarefa de correção e Caso de teste. Pesquisas usam placeholders
que nomeiam a entidade; enums usam “Todos/Todas”. TC e Kanban seguem a mesma família.
“Limpar filtros” e seu wrapper só existem com filtros ativos. O estado inicial do
Kanban não reserva espaço inferior para uma ação ausente. Severidade não duplica o
valor selecionado com outro badge. Filtro remoto e invalidação existentes preservados.

## G — Correction UX

Removidos View Correction / Manage Correction e `CorrectionManager` intermediário.
O caminho agora é **Defect Details → Tarefas de correção → Criar tarefa de correção
ou Vincular tarefa existente**. As tarefas do ciclo atual ficam diretamente visíveis,
com identidade, status, prioridade e responsável; ciclos anteriores são disclosure.

Criar/vincular substituem o corpo do mesmo SprintDialog, mostram DEF/ciclo e possuem
Cancelar + ação primária. A criação reaproveita TaskForm e o contexto de requisito;
a busca de vínculo exclui tarefas de origem e vínculos já existentes conforme fluxo.
Voltar/Cancelar restaura scroll e foco no CTA de origem. O callback de fechamento foi
estabilizado para que uma atualização de catálogo não desfaça essa restauração.
Verificação real após cancelar: um dialog e foco em “Vincular tarefa existente”.
Sucesso confirmado e falha de reconciliação continuam separados; revisão/contexto
atual protegem a mutação e o retorno. Nenhuma mudança de regra de correção.

## H — Validation UX

`ExecutionSummary` é compartilhado com TestCase: resultado, EXEC-id, data, ambiente,
executor histórico, referência testada e versão do caso. No defeito validado, a
execução é a validante do ciclo atual. Observado DEF-1, ciclo 2, EXEC-0005 PASS,
ambiente Local e referência PR #8. Sem correções/antes do reteste, a seção mostra
pendência; aguardando reteste recebe texto próprio. Não há segundo CTA de reteste
na seção. Estado do servidor continua autoritativo.

## I — Severity

| Severity | Token/variant |
|---|---|
| Baixa | `color-success-text` / `color-success-surface` |
| Média | `color-info-text` / `color-info-surface` |
| Alta | `color-warning-text` / `color-warning-surface` |
| Crítica | `color-danger-text` / `color-danger-surface` |

Aplicados em cards/linhas/Details; formulários e filtros mostram somente o select.

## J — Correction marker

Ícone anterior: código. Novo: `TraceFlowIcon` bug.
Tipografia: `font-size-1`, peso medium; tratamento: tokens info, largura do conteúdo,
sem card inteiro vermelho. Link/summary conserva alvo mínimo de 44px. Task normal e
de origem não recebem marcador; múltiplos defeitos mantêm apresentação agregada.
O DnD e as regras de movimentação do Kanban não foram alterados.

## K — Forms

Severidade sem badge redundante; ação, resultado esperado e resultado observado
históricos sempre disponíveis no contexto de detecção. Observado registro real a
partir de EXEC-0008/TC-5/Passo 1 FAIL, depois cancelado sem submissão. Responsável
sem copy “ativo” nas opções ou na validação, com obrigatoriedade do domínio.
Entidades selecionadas preservam título/identidade e remoção acessível; tarefa de
origem usa botão de ícone 44×44 sem quebrar para outra linha. Criar/cancelar correção
mantém o mesmo dialog. Seleção inicial não abre listas automaticamente.

## L — Quality

Casos de teste e Defeitos usam o mesmo ArtifactCategory, contadores, EntityRow e
rodapé. Cabeçalhos e linhas começam alinhados; linhas populadas observadas com
120px; CTA de criar caso fica no rodapé da categoria. A criação contextual continua
recebendo a Task sem repetir o contexto de correção. Carregado foi observado nos
oito recortes; vazio, loading, erro/retry, VIEWER e reconciliação têm testes próprios.

## M — Visual Matrix

Chrome real, sessão autenticada, aplicação local e dados persistidos de homologação
já existentes no projeto 2. Cada PASS abaixo é **renderizado**, não derivado de
Vitest. Viewports com altura de 1000px; conteúdo longo inspecionado por scroll.

| Surface | Light 1440 | Dark 1440 | Light 1280 | Dark 1280 | Light 768 | Dark 768 | Light 390 | Dark 390 |
|---|---|---|---|---|---|---|---|---|
| Kanban Filters | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Kanban Correction Card | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Task Details | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Task Quality | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| TestCase Catalog | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| TestCase Details | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| TestCase Form | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Defect Catalog | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Defect Filters | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Defect Details | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Defect Form | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Correction Section | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Validation Section | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| History (Defect) | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |

São 112 células de superfícies, além das reinspeções após correções. As capturas
foram emitidas e inspecionadas na sessão de browser; não há pacote de PNG versionado.
A matriz e este registro são a evidência textual persistida no repositório.

Complementos: históricos Task e alterações TC em desktop/mobile Light/Dark;
correção vazia e com tarefa; DEF validado em ciclo posterior; criar/vincular e
cancelar; listas abertas de responsável, requisito, tarefa, Marco e referência
testada. A busca não selecionou automaticamente entidades. O footer permaneceu
acessível em 390px. O foco voltou ao CTA após cancelar o vínculo nos dois temas.

Falhas encontradas durante esta rodada e corrigidas antes do PASS: lista absoluta
recortada/encobrindo rodapé; foco devolvido ao corpo por callback instável; select
herdando peso de rótulo e seta fora do campo; gap duplo em TC Details. Os recortes
correspondentes foram reinspecionados. Nenhuma captura transitória com loading,
modal fechado ou tema ainda em transição foi usada para aprovar uma célula.

Não houve escrita de negócio pela UI ou diretamente no banco nesta rodada. Erros
remotos, concorrência, permissões e submits foram exercitados em automação. Não se
atribui aprovação visual a esses estados, preview/download de evidências ou fluxos
externos. Kanban conserva scroll horizontal contido da própria área de trabalho.

## N — Tests

Runtime: Node 22, `NODE_OPTIONS=--no-experimental-webstorage`.

- Focados: regressões de padronização/foco, seleção elegível, filtros, validação,
  correção e formulários; última bateria crítica inclui 223 testes em 15 arquivos.
- Repetibilidade final: **10/10 execuções consecutivas, 223/223 testes por execução**,
  sem retry, com Defects, TestCases, SearchCombobox, TaskForm e TaskHistorySprint.
- Suíte completa: `npm test`, **967/967 em 81 arquivos**.
- Coverage: `npm run test:coverage`, **967/967**; statements 80,48%, branches 75,19%,
  functions 75,84%, lines 82,63%.
- Backend afetado: **120/120 em 5 arquivos**, incluindo leitura de apresentação,
  contratos e serviços de defeitos/casos. Testes com mocks, sem reset de banco.

Os testes de foco cobrem Cancelar tanto em criar quanto em vincular e uma nova
renderização do catálogo, aguardando também o frame posterior. A busca de Sprint
preserva uma seleção terminal já existente e só oferece opções elegíveis para nova
escolha. Asserções antigas de texto/selector foram atualizadas para a UI resultante.

Comando da bateria repetida:

```bash
npx vitest run test/defects test/testCases \
  test/components/SearchCombobox.test.jsx \
  test/components/TaskForm.test.jsx \
  test/components/TaskHistorySprint.test.jsx
```

Logs locais desta sessão: `/private/tmp/traceflow-s108-fix02/`:
`delivery-full.log`, `delivery-coverage.log`, `delivery-repeat-1.log` a
`delivery-repeat-10.log`, `delivery-repeat-summary.log`, `delivery-gates.log`,
`backend.log` e `backend-gates.log`. São arquivos temporários, não dependências do app.

## O — Gates

| Gate | Resultado |
|---|---|
| focused | PASS — 223 testes da bateria crítica |
| repeatability | PASS — 10 × 223, sem retry |
| full tests | PASS — 967/967 |
| coverage | PASS — 81 arquivos / 967 testes |
| lint | PASS — frontend e backend |
| format | PASS — scripts frontend/backend; CSS alterado formatado |
| build | PASS — frontend Vite |
| backend affected | PASS — 120 testes; architecture:check PASS |
| git diff --check | PASS |

Gates locais. Nenhuma execução de CI remoto foi iniciada ou usada para validar este
working tree. A rodada não executa o QA integrado final nem testes destrutivos de DB.

## P — Design Documentation

Atualizados DESIGN_SYSTEM, UI_SURFACE_INVENTORY e VISUAL_VALIDATION_LOG com as regras
gerais de enums/entidades, lista no fluxo, responsável, descrição, grid unido,
header/body/footer, EntityRow, resumo de execução, tiles Planning, filtros
condicionais, severidade e correção direta. API_CONTRACTS documenta os campos mínimos
de leitura. Entradas históricas conservam seu contexto; o inventário atual substitui
as referências ao manager removido. Este relatório registra as seções A–S.

## Q — Backend Impact

Schema: **UNCHANGED**. Migration: **UNCHANGED**. Defect lifecycle: **UNCHANGED**.
Retest: **UNCHANGED**. Authorization: **UNCHANGED**.

Única extensão produtiva no backend: seleção de leitura do repositório de defeitos
acrescenta prioridade e responsável `{ id, name }` das tarefas, ambiente e snapshot
do executor da execução de reteste. Sem novo endpoint, mutação, schema ou consulta
extra por entidade. Teste de leitura assegura os campos e minimização de identidade.
Campos atuais de tarefa são apresentados como atuais; executor permanece histórico.

## R — Git final

Branch `daniel-dev`; HEAD preservado:
`66a2b0e2638cb2714b68b98d8c703eae12b0981a`.
`git diff --check`: PASS. Status final abaixo; todas as alterações são desta rodada,
pois o baseline estava limpo. Hashes de arquivos rastreados foram comparados com o
baseline, e o conjunto alterado coincide com o diff autorizado de frontend,
documentação e a extensão mínima de leitura backend. Dos 945 arquivos rastreados
do baseline, 898 permanecem idênticos; os 47 alterados coincidem exatamente com o
diff. Não há alteração em área proibida nem mudança de HEAD.

```text
 M backend/src/modules/defects/repositories/defect.repository.js
 M docs/api/API_CONTRACTS.md
 M docs/design/DESIGN_SYSTEM.md
 M docs/design/UI_SURFACE_INVENTORY.md
 M docs/design/validation/VISUAL_VALIDATION_LOG.md
 M frontend/src/features/defects/DefectsScreen.jsx
 D frontend/src/features/defects/components/CorrectionManager.jsx
 M frontend/src/features/defects/components/DefectDetails.jsx
 M frontend/src/features/defects/components/DefectFlow.jsx
 M frontend/src/features/defects/components/DefectForm.jsx
 M frontend/src/features/defects/defects.css
 M frontend/src/features/defects/model/defects.js
 M frontend/src/features/tasks/components/KanbanFilters.jsx
 M frontend/src/features/tasks/components/TaskCorrectionContext.css
 M frontend/src/features/tasks/components/TaskCorrectionContext.jsx
 M frontend/src/features/tasks/components/TaskDetailsLayout.jsx
 M frontend/src/features/tasks/components/TaskDetailsPanel.css
 M frontend/src/features/tasks/components/TaskDetailsPanel.jsx
 M frontend/src/features/tasks/components/TaskForm.css
 M frontend/src/features/tasks/components/TaskForm.jsx
 M frontend/src/features/tasks/components/TaskHistoryDialog.css
 M frontend/src/features/tasks/components/TaskHistoryDialog.jsx
 M frontend/src/features/tasks/components/TaskQuality.jsx
 M frontend/src/features/tasks/components/TaskTraceability.jsx
 M frontend/src/features/tasks/components/task-details-view.js
 M frontend/src/features/tasks/pages/KanbanScreen.css
 M frontend/src/features/testCases/components/Parts.jsx
 M frontend/src/features/testCases/components/TestCaseDetails.jsx
 M frontend/src/features/testCases/components/TestCaseForm.jsx
 M frontend/src/features/testCases/components/TestCaseList.jsx
 M frontend/src/features/testCases/components/TestExecutionWizard.jsx
 M frontend/src/features/testCases/index.js
 M frontend/src/features/testCases/model/test-cases.js
 M frontend/src/features/testCases/styles/test-cases.css
 M frontend/src/shared/components/SearchCombobox.css
 M frontend/src/shared/components/SearchCombobox.jsx
 M frontend/src/shared/components/TraceFlowIcon.jsx
 M frontend/src/shared/index.js
 M frontend/test/components/FrozenTaskDetails.test.jsx
 M frontend/test/components/SearchCombobox.test.jsx
 M frontend/test/components/TaskForm.test.jsx
 M frontend/test/defects/Defects.test.jsx
 M frontend/test/defects/UxAlignment.test.jsx
 M frontend/test/defects/contracts.test.js
 M frontend/test/pages/KanbanPage.test.jsx
 M frontend/test/testCases/TestCases.test.jsx
 M frontend/test/testCases/model-api.test.js
?? backend/test/unit/defects/read-presentation.test.js
?? docs/deliveries/S1_08_TRACEFLOW_UI_STANDARDIZATION_REPORT.md
?? frontend/src/features/defects/components/CorrectionTaskForm.jsx
?? frontend/src/features/testCases/components/ExecutionSummary.jsx
?? frontend/src/shared/components/DetailSurface.css
?? frontend/src/shared/components/DetailSurface.jsx
?? frontend/src/shared/components/ResponsibleCombobox.jsx
?? frontend/src/shared/components/SelectControl.css
?? frontend/src/shared/components/SelectControl.jsx
?? frontend/test/defects/Standardization.test.jsx
```

## S — Git operations

```text
NO COMMIT
NO PUSH
NO MERGE
NO REBASE
NO RESET
```

Também não houve stash, clean ou force-push. Tema Sistema e viewport original do
Chrome restaurados. Rodada encerrada; S1-09, revisão geral e FINAL INTEGRATED QA não
foram iniciados.

**TRACEFLOW UI STANDARDIZATION — PASS LOCAL**
