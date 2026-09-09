# TRACEFLOW Visual Validation Log

## 2026-09-09 — S1-08 UI Standardization FIX 02

Chrome real autenticado em `localhost:5173`, projeto local 2, Light/Dark,
1440×1000, 1280×1000, 768×1000 e 390×1000. Foram inspecionados os 112 recortes da
matriz de 14 superfícies em [relatório A–S](../../deliveries/S1_08_TRACEFLOW_UI_STANDARDIZATION_REPORT.md).
Comparação entre Sprint/Marco, Task, TestCase e Defect guiou a implementação.

PASS renderizado: filtros Kanban, marcador de correção, Task Details/Qualidade,
TC catálogo/Details/form, DEF catálogo/filtros/Details/form/correção/validação e
histórico DEF. Complementos: histórico Task/TC desktop/mobile nos dois temas;
registro a partir de EXEC-0008 FAIL; detalhes validados DEF-1 ciclo 2/EXEC-0005;
criar/vincular correção e cancelamento; buscas de responsável, requisito, tarefas,
Marco e referência testada. Não houve submissão de dados de negócio nesta rodada.

A inspeção de interação encontrou lista encobrindo rodapé e foco retornando ao corpo
do dialog. Ambos foram corrigidos e reinspecionados: resultados no fluxo normal e
callback de fechamento estável. A inspeção final também corrigiu seta/posição do
select ao abrir uma busca vizinha e o gap duplicado de seções TC. Não foi observado
overflow horizontal da página; o scroll horizontal contido do Kanban foi preservado.

Loading/erro/permissões/concorrência e mutações foram verificados nos testes, não
reclassificados como observação visual. Esta evidência é local e restrita à rodada;
não equivale a CI remoto, certificação de acessibilidade ou QA integrado final.

## 2026-09-08 — S1-08 frontend UX alignment

**Resultado: VISUALLY APPROVED para os estados carregados e cancelamento abaixo.**
Chrome autenticado, APIs locais e dados sintéticos persistidos já existentes.
Light e Dark em 1440×1000, 1280×1000, 768×1000 e 390×844, com viewport emulado,
screenshots observados e interação real. Esta rodada substitui a pendência de
matriz do smoke anterior apenas para este escopo.

Matriz completa: detalhes, edição e confirmação/cancelamento de Defect; detalhes
da execução e defeitos registrados no passo FAIL; seção Correção e manager com
tarefa existente; histórico de Defect; alterações do TestCase; detalhes e
Qualidade da tarefa de origem; card de correção no Kanban. IDs: `DEF-DETAILS`,
`DEF-EDIT`, `DEF-DELETE`, `DEF-CORRECTION`, `DEF-HISTORY`, `TC-CHANGES`,
`TC-EXECUTION-DETAILS` (detalhes carregados), `TC-FAILED-STEP-DEFECTS`,
`TASK-QUALITY`, `TASK-CORRECTION-DETAILS` e `TASK-CORRECTION-CARD`.

Referências comparadas: Task Details/History, confirmações Task/TestCase,
ArtifactCategory, SprintDialog e SearchCombobox. Confirmação compacta, foco inicial
em Cancelar, retorno ao acionador, menu mobile e navegação Ver correção observados.
Nenhuma página/dialog da matriz apresentou overflow horizontal; o scroll interno
do Kanban é intencional. A inspeção identificou e revalidou correções de identidade
no histórico aberto por deep link, especificidade da badge de severidade e
contenção de nomes longos de sprint no card. Inspeções adicionais cobriram manager
vazio, Qualidade de tarefa de correção e fechamento do popup de responsável.

Nenhum formulário, exclusão, execução ou movimento de tarefa foi confirmado.
VIEWER, erros de rede, conflitos, múltiplos defeitos por tarefa e estados raros
permanecem tecnicamente verificados por automação, sem aprovação visual inferida.
Não houve nova homologação de todos os formatos de evidência, lifecycle completo,
cross-browser ou WCAG integral. Evidência por cenário, matriz e gates no
[relatório de alinhamento](../../deliveries/S1_08_FRONTEND_UX_ALIGNMENT_REPORT.md).

## 2026-09-08 — S1-08 dados autorizados e smoke adicional

Bloqueio por ausência de dados removido. Quatro defeitos persistidos, um por
estado, com ciclo completo de reabertura e validação no DEF-1. Chrome autenticado,
desktop Dark: cards, indicadores, detalhes de DEF-1/DEF-4 e wizard de reteste
de DEF-4 observados. Wizard não submetido; cenário aguardando reteste preservado.
Matriz visual completa continua pendente. Inventário, vínculos e limites no
[ciclo de dados](../../deliveries/S1_08_QA_DATA_CYCLE.md).

## Purpose

This log is the versioned authority for rendered visual-validation evidence. The
[UI Surface Inventory](../UI_SURFACE_INVENTORY.md) records each surface's current status; this log
records what was actually rendered and evaluated at a specific point in time.

`VISUALLY APPROVED` means that the surface passed the manual/rendered matrix stated in its entry. It
does not mean WCAG certification, exhaustive browser certification, or approval of states listed as
limitations. A later material change to layout or interaction requires the corresponding inventory
status to be reconsidered until that changed behavior is rendered again.

Screenshots are optional supporting artifacts, not a prerequisite for an entry. External workspaces,
chat histories, local prototype folders, and ignored files are not canonical evidence. Entries must
not contain credentials, tokens, cookies, personal data, fixture access URLs, or other secrets.

## Validation records

### Authenticated Shell and Theme Foundation

- **Date:** 2026-08-30
- **Scope:** Authenticated shell, expanded/collapsed sidebar, mobile drawer, quick projects, theme
  persistence, and essential keyboard/focus behavior.
- **Surface IDs:** `GLOBAL-AUTHENTICATED-SHELL`, `GLOBAL-SIDEBAR-EXPANDED`,
  `GLOBAL-SIDEBAR-COLLAPSED`, `GLOBAL-MOBILE-DRAWER`, `GLOBAL-QUICK-PROJECTS`,
  `GLOBAL-THEME-CONTROL`.
- **Themes:** Light and Dark.
- **Viewports:** 1440 x 900, 768 x 1024, and 390 x 844.
- **Validation type:** Rendered visual validation, responsive validation, and focused manual keyboard
  validation.
- **Result:** `VISUALLY APPROVED` for the shell and two resolved themes as implemented at that time.
- **Known limitations:** The validation predates the explicit System / Light / Dark preference and the
  skip link added later. The current three-state theme control and changed shell keyboard path remain
  `TECHNICALLY VERIFIED` until consolidated rendered revalidation.

### Projects, Overview, Edit, and Members

- **Date:** 2026-08-30
- **Scope:** Projects grid, Create/Join flows, Project Overview, Edit Project, Members Team and
  Invitations, Access Code, regeneration confirmation, responsive headers, focus transfer, and
  available auxiliary feedback/confirmations.
- **Surface IDs:** `PROJECTS-MAIN`, `PROJECTS-REQUEST-STATES`, `PROJECTS-INVITATION-CARD`,
  `PROJECTS-NEW-CHOOSER-DIALOG`, `PROJECTS-CREATE-DIALOG`, `PROJECTS-JOIN-DIALOG`,
  `PROJECT-OVERVIEW-MAIN`, `PROJECT-OVERVIEW-REQUEST-AND-SYNC`, `PROJECT-EDIT-PAGE`,
  `PROJECT-MEMBERS-PAGE`, `MEMBERS-TEAM-TAB`, `MEMBERS-INVITATIONS-TAB`, `MEMBERS-ACCESS-CODE`,
  `MEMBERS-ACCESS-REGENERATE-CONFIRM`, `PROJECTS-AUXILIARY-FEEDBACK`.
- **Themes:** Light and Dark.
- **Viewports:** 1440 x 900, 768 x 1024 with the sidebar collapsed, 768 x 1024 with the sidebar
  expanded, and 390 x 844.
- **Validation type:** Rendered visual validation, responsive validation, and focused manual keyboard
  validation.
- **Result:** `VISUALLY APPROVED` for the listed surfaces in the recorded matrix.
- **Known limitations:** Rare states that required a real invitation or additional user/ownership
  configuration were not promoted by inference. Members tab semantics and keyboard interaction were
  materially changed later and currently require rendered revalidation.

### Auth and Account Lifecycle

- **Date:** 2026-08-30
- **Scope:** Login, Register, Recovery, available Reset states, Verification, Email Verification
  Banner, Username Setup Banner, Bootstrap Error, `DEACTIVATED`, `DELETION_PENDING`, Email Change
  Confirmation, and Reactivation Confirmation.
- **Surface IDs:** `AUTH-LOGIN-PAGE`, `AUTH-LOGIN-VALIDATION-FEEDBACK`, `AUTH-GITHUB-OAUTH`,
  `AUTH-REGISTER-PAGE`, `AUTH-REGISTER-VALIDATION-FEEDBACK`, `AUTH-RECOVERY-REQUEST`,
  `AUTH-RESET-PASSWORD`, `AUTH-VERIFY-EMAIL`, `AUTH-EMAIL-VERIFICATION-BANNER`,
  `AUTH-USERNAME-SETUP-BANNER`, `AUTH-BOOTSTRAP-ERROR`, `ACCOUNT-RESTRICTED-DEACTIVATED`,
  `ACCOUNT-RESTRICTED-DELETION-PENDING`, `ACCOUNT-EMAIL-CHANGE-CONFIRMATION`,
  `ACCOUNT-REACTIVATION-CONFIRMATION`.
- **Themes:** Light and Dark.
- **Viewports:** 1440 x 900, 768 x 1024 where applicable, and 390 x 844.
- **Validation type:** Rendered visual validation and responsive validation.
- **Result:** `VISUALLY APPROVED` for the listed surfaces and states that were rendered with the local
  test-only fixtures described in the Auth validation runbook.
- **Known limitations:** Transient runtime loading remained `ENVIRONMENT LIMITATION` and was not
  promoted by inference. The Login recovery-link target changed after this record; the current Login
  surface therefore requires Light/Dark rendered revalidation. SMTP delivery and external GitHub
  behavior remain separate operational evidence.

### Settings

- **Date:** 2026-08-31
- **Scope:** Account, Security, Privacy, Integrations, SensitiveActionDialog, Sessions, password UX,
  and responsive Settings navigation. The final pass specifically included the mobile sensitive
  dialog and Security's container-aware responsive reflow.
- **Surface IDs:** `SETTINGS-SHELL`, `SETTINGS-ACCOUNT`, `SETTINGS-SENSITIVE-REAUTH`,
  `SETTINGS-DEACTIVATE-CONFIRM`, `SETTINGS-SECURITY`, `SETTINGS-SESSIONS`,
  `SETTINGS-SESSION-REVOKE-CONFIRM`, `SETTINGS-PRIVACY`, `SETTINGS-DATA-EXPORT`,
  `SETTINGS-DELETION-STATES`, `SETTINGS-DELETION-REQUEST-CONFIRM`,
  `SETTINGS-DELETION-CANCEL-CONFIRM`, `SETTINGS-INTEGRATIONS`, `SETTINGS-GITHUB-IDENTITY`,
  `SETTINGS-GITHUB-IDENTITY-UNLINK-CONFIRM`, `SETTINGS-GITHUB-APP`,
  `SETTINGS-GITHUB-APP-DISCONNECT-CONFIRM`, `SETTINGS-GLOBAL-FEEDBACK`.
- **Themes:** Light and Dark.
- **Viewports:** 1440 x 900, 768 x 1024 with the sidebar collapsed, 768 x 1024 with the sidebar
  expanded, and 390 x 844.
- **Validation type:** Rendered visual validation, responsive validation, and focused manual keyboard
  validation.
- **Result:** `VISUALLY APPROVED` for the listed surfaces in the recorded matrix.
- **Known limitations:** Account partial-save feedback, sensitive-dialog focus/success behavior,
  Integrations cooldown/impact feedback, and route-navigation semantics changed later. Those current
  surfaces remain `TECHNICALLY VERIFIED` until rendered revalidation. Initial fatal-error and loading
  states were not promoted without direct rendered evidence.

### Frozen Task Details — FIX-04 addenda 2/3

- **Date / revision:** 2026-09-05; working tree over `48ca54f6cb9f39db58b595ba6b08bd52dbdaeb1b`.
- **Scope:** shared read-only Task Details information and traceability, full-width frozen dialog,
  explicit transition to current details, frozen/legacy/empty/unavailable-current states.
- **Surface IDs:** `KANBAN-FROZEN-TASK-DETAIL-DIALOG`, `KANBAN-TASK-DETAIL-INFO`,
  `KANBAN-TASK-DETAIL-TRACEABILITY`; current dialog read-only content as comparison.
- **Themes / viewports:** Light and Dark; 1440, 1024, 768 and 390 pixels wide, height 1000.
- **Method:** real Chrome headless with native input through CDP; real application routes/API,
  exclusive local disposable MySQL fixtures. Screenshots inspected for hierarchy, grids, spacing,
  full-width frozen content, theme tokens, wrapping and bounded scrolling. No production data.
- **Result:** visual parity PASS in the recorded content matrix. Shared information and traceability
  sections are `VISUALLY APPROVED` for this matrix. Frozen contains no Comments/composer/mutable
  actions; current contains Comments and authorized edit/delete. Enter/Space open; Escape closes
  and restores card focus while preserving the historical Sprint filter. Frozen opening performs
  no current Task/artifact reads. V2 fields remain original after current changes.
- **Long content:** 16 commits, 12 issues, long title and description within the real API limit;
  all eight theme/viewport combinations. Removed the shared mobile `overflow-y: visible` override:
  lists retain bounded scroll and their last links are accessible. Current mobile rechecked too.
- **Legacy / empty / unavailable:** rendered in both themes at 390; legacy limitations are explicit,
  captured empty relations remain empty and a deleted current Task has no open-current action.
- **Evidence:** [FIX-04 report](../../qa/PLANNING_QA_FIX_04.md), including capture filenames and local
  evidence manifest. `browser-smoke.json`, `browser-long.json`, `browser-edges.json` record results.
- **Limits:** transient loading and HTTP 404 race are covered by automated tests, not promoted to
  rendered approval. No broad approval of editing, all authorization roles, sidebar permutations,
  external GitHub destinations or the whole Kanban page. Their previous inventory status remains.

## Current revalidation queue

The following materially changed areas require a new rendered record before they can regain or gain
`VISUALLY APPROVED` for their current implementation:

- System / Light / Dark control and live System resolution;
- authenticated-shell skip link and its first-focus path;
- Members tabs, including roving focus and panel associations;
- Account partial-save and Integrations cooldown feedback;
- SensitiveActionDialog busy, error, cancel, Escape, and post-success focus;
- UX-PLANNING-SPRINTS em Light/Dark, sidebar expandida/recolhida, tablet e mobile, incluindo filtros recolhíveis;
- UX-PLANNING-MILESTONES em Light/Dark, sidebar expandida/recolhida, tablet e mobile, incluindo filtros recolhíveis;
- UX-PLANNING-SCHEDULE em Light/Dark, sidebar expandida/recolhida, tablet e mobile, incluindo faixas,
  lanes/overflow, cores automáticas, marcadores, painel Contexto Mês/Dia, grid de próximos prazos e
  estados vazios;
- UX-PLANNING-KANBAN em Light/Dark, sidebar expandida/recolhida, tablet e mobile, incluindo resumo,
  filtros recolhíveis, quadro horizontal em containers estreitos, Task Details e histórico individual;
- legacy Dark-compatible operational surfaces.


### S1-07 — frontend integrado (2026-09-07)

**Status: TECHNICALLY VERIFIED; homologação visual completa pendente.** Checkout
operacional, branch `daniel-dev`, HEAD `b5732ca41cf66b1520e46edbb07c9d4c2d59ed16`.
A sessão usou exclusivamente uma conta artificial e o schema descartável
`traceflow_s107_20260907_test`. Nenhuma alteração no banco de desenvolvimento.

Renderização observada por captura nativa do Safari, sem equivalência comprovada a
um viewport CSS de 1440/1280/768/390. Em Dark: catálogo, formulário de criação,
cinco passos em duas colunas, assistente, resumo e detalhe histórico. Em Light:
catálogo, filtros expandidos, detalhes atuais v4, Execuções, Alterações, detalhe
histórico v3 e confirmação de exclusão. O histórico foi recarregado após ajustar
as classes das abas ao controle canônico `internal-tab`. Os demais estados e as
combinações de tema/dimensão não observados continuam pendentes.

Fluxo real observado: criar com Requirement/Task encontrados no servidor, editar
até v3, registrar cinco passos PASS com PNG no passo 3, consultar histórico,
abrir execução v3 após alteração do caso para v4, baixar JSON e excluir logicamente.
O download do navegador foi comparado com a fixture: bytes idênticos.

A tentativa nativa de upload conjunto PNG/MP4/JSON teve seleção de arquivos
inconsistente (botão Enviar desabilitado apesar do arquivo selecionado e erro
`noWindowsAvailable`). Não houve comprovação completa desse upload conjunto pelo
navegador. Um smoke HTTP autenticado complementar registrou os três anexos e
validou três downloads por SHA-256; o frontend renderizou essa execução real,
incluindo PNG no passo 3, MP4 no passo 5 e JSON geral. Isso não transforma o smoke
HTTP em PASS do upload completo pela UI. Extensões e MIME types estão explicitados
no `accept`; esse ajuste não foi considerado prova de resolução do seletor nativo.

**ENVIRONMENT BLOCKED:** controle exato de viewport, matriz responsiva completa,
medidas DOM/overflow/44px, coleta de console do navegador e comparação renderizada
completa com Sprints/Tasks. Nenhum browser provider estava disponível; houve apenas
controle nativo do Safari. O atalho de modo responsivo não disponibilizou controles
mensuráveis. Não há declaração de zero erros no console real nem `VISUALLY APPROVED`.

Testes automatizados, API/DB, CSS estrutural e cobertura estão detalhados no
[relatório de integração](../../deliveries/S1_07_FRONTEND_INTEGRATION_REPORT.md).
Esses resultados não substituem a matriz visual solicitada nem aprovação humana.

## 2026-09-08 — S1-07 Frontend Final UX Fix

**Estado: TECHNICALLY VERIFIED; matriz visual exata ENVIRONMENT BLOCKED.**
Checkout `/Users/daniel/Coding/Traceflow`, branch `daniel-dev`, baseline
`b5e6b83c1c632aa566ec8cfc8d4e23acdab2edc2`. Implementação real, sem runtime fake.

Smoke desktop nativo no Safari, sessão já autenticada, projeto 2: Main, filtros
abertos/fechados, New TestCase e TC-1 PASS, create/edit sem salvar, Details, execução
com dropdown inicialmente fechado e aberto por clique, Step, resumo com referência
longa, ambas as tabs do histórico, EXEC-0001 histórica e confirmação cancelada.
Superfícies observadas em Light/Dark. Links REQ-1 e TASK-2 navegaram às seções
canônicas fechando o contexto anterior. Nenhum registro foi criado, editado ou excluído;
nenhuma execução foi enviada. Tema Sistema restaurado ao encerrar.

Comparação sequencial renderizada em Light com Task Card/Task Details/Sprint Filters.
O comparativo identificou a necessidade de reutilizar GithubExternalAction, aplicada
pelo barrel público de tasks. A seleção longa do SearchCombobox revelou overflow
intrínseco, corrigido com min-width: 0 e revalidado em ambos os temas. PageDown
confirmou que o dropdown fecha ao rolar o modal; não interfere no footer. Recarregamento
precedeu a captura Dark final da execução histórica com a ação externa canônica.

Limites: nenhum browser provider; sem viewport CSS medido em 1440/1280/768/390, sem
coletor de console/computed styles e sem matriz de variantes de cards simultâneas.
O comando nativo de scroll retornou noWindowsAvailable em tentativas, contornado
para o smoke de scroll por teclado. Não há visual PASS para as combinações exatas,
medição de targets/overflow ou console. Não promover a VISUALLY APPROVED/C2 COMPLETE.

Evidências e gates: [S1-07 FRONTEND FINAL UX FIX REPORT](../../deliveries/S1_07_FRONTEND_FINAL_UX_FIX_REPORT.md),
com 230 testes focados, 864 testes completos e cobertura aprovada. Capturas foram
observadas durante a sessão; este registro não as apresenta como artefatos PNG versionados.


### S1-07 Addendum 3 — Traceability + Evidence Viewer

- **Date:** 2026-09-08.
- **Baseline:** `daniel-dev`, `c25348b523230b3607a6879d5c60aad1e9da0a19`; working tree inicialmente limpo.
- **Surface IDs:** `TC-TRACEABILITY`, `TC-EVIDENCE-LIST`, `TC-EVIDENCE-VIEWER`, `TC-EXECUTION-DETAILS`.
- **Resultado:** `TECHNICALLY VERIFIED`; homologação visual parcial, sem promoção a `VISUALLY APPROVED`.
- **Render real:** Safari autenticado em localhost, cenário já existente, leitura de requisito/tarefa
  vinculados e imagem JPG persistida. Rastreabilidade em Light/Dark e mesma família visual da Task
  Details; comparação sequencial. Viewer JPG em Light/Dark, contextos de passo/geral, header,
  voltar e fechar. Retorno com foco visível em Visualizar e posição preservada observado em Dark.
- **Backend/dados:** nenhuma alteração de backend, banco, upload ou registro de execução. Somente
  navegação e leitura autenticada. A preferência de tema original foi restaurada ao final.
- **Viewports:** dimensões CSS exatas 1440/1280/768/390 `ENVIRONMENT BLOCKED`; somente provider nativo,
  sem controle de viewport/DevTools. Captura de janela não foi usada como medição de viewport CSS.
- **Outros formatos/estados:** video, PDF, TXT/LOG, JSON, unsupported, loading e erro controlados:
  `ENVIRONMENT BLOCKED` para render real por ausência de cenário persistido disponível nesta sessão
  de leitura. Cobertos por testes, sem inferência de codecs/plugin PDF ou aprovação visual.
- **Console:** navegador `ENVIRONMENT BLOCKED`; testes focados assertam zero errors/warnings e o
  runner não reportou unhandled rejections. Não há equivalência entre essas duas fontes de evidência.
- **Gates:** 130 focados, 118 regressão canônica, 898 completos e coverage PASS; lint, format,
  build, arquitetura, secrets e diff-check PASS.
- **Relatório:** [S1-07 Traceability + Evidence Viewer](../../deliveries/S1_07_TRACEABILITY_EVIDENCE_VIEWER_REPORT.md).

## 2026-09-08 — S1-08 frontend integration

**ENVIRONMENT BLOCKED para homologação completa.** Sessão real no Chrome local,
projeto 2, sem defeitos e sem candidatos FAIL. Smoke renderizado do catálogo vazio
em Light/Dark 1440, 768 e 390; filtros abertos em desktop e Dark 390; seletor vazio
de criação observado em desktop Dark. Comparação com TestCases Main e Task Details
em Light 1280. Isso não prova cards de defeitos, correções, reteste ou histórico.

Detalhamento por superfície/viewport, console, testes e gaps no
[S1_08_FRONTEND_INTEGRATION_REPORT](../../deliveries/S1_08_FRONTEND_INTEGRATION_REPORT.md).

Um reinício local provocou `ERR_CONNECTION_REFUSED` em auth/me; a sessão foi
recuperada e a leitura de defeitos retornou 200. Os controles nativos de filtro
receberam id/name durante a investigação de Issues do navegador. A ausência de
warnings nas superfícies não percorridas não está homologada.

**FROZEN CORRECTION CONTEXT CONTRACT GAP** registrado: sem metadados no snapshot,
nenhum Defect atual é consultado para representar o contexto congelado.

Smoke adicional Light 1280: Task Details → criação contextual no mesmo dialog,
TASK-2 + REQ-1 selecionados sem persistência. Corrigido e reobservado o foco no
título ao entrar; retorno ao botão de criação implementado. A Task normal não
recebeu contexto de correção. Um Issue de melhoria do Chrome também apareceu na
superfície canônica de tarefa; o painel Issues classificou a família como campos sem id/name (dois apontamentos),
sem page errors/breaking changes. A atribuição individual permanece pendente.
