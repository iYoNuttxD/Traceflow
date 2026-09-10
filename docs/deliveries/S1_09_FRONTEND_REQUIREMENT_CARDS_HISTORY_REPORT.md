# TRACEFLOW S1-09 — FRONTEND REQUIREMENT CARDS + HISTORY REPORT

**S1-09 FRONTEND REQUIREMENT CARDS — PASS LOCAL**

- Date: 2026-09-10.
- Branch: `daniel-dev`.
- HEAD: `bb768e33b2002ab3e35edf7175760ebb0eb7bb88`.
- Node: `v22.23.2`; testes com `NODE_OPTIONS=--no-experimental-webstorage`.
- Browser: Chrome real, sessão autenticada, `http://localhost:5173/projects/2/traceability`.
- Database migration status: 51 migrations aplicadas; nenhuma pendente nesta rodada.
- Database: MySQL `9.7.1`, `localhost:3306/traceflow`, `NODE_ENV=development`, distinto de `TEST_DATABASE_URL`.

## A — Baseline

Checkout operacional: `/Users/daniel/Coding/Traceflow`. Working tree inicialmente limpa;
branch e HEAD acima preservados. `git diff --check` inicial e final sem erros.

O relatório anterior indicava migration ainda não aplicada ao desenvolvimento. A consulta
**atual** `npx prisma migrate status` encontrou o banco atualizado antes da homologação.
A migration `20260910120000_s109_requirement_traceability` já tinha `finished_at`
`2026-09-10T22:41:16.803Z`. Nenhum deploy de migration foi necessário nesta etapa.
Antes/depois: mesma migration aplicada; schema/migration não editados.

O projeto local 2 tinha quatro requisitos sem estado inicial de rastreabilidade. O script
canônico `reconcile-requirement-traceability.js --project-id=2 --dry-run` identificou somente
quatro `BASELINE_INITIALIZED`. A execução autorizada com `--apply` registrou o estado atual,
sem reconstruir passado. Novo dry-run: `requirements=4`, `withoutState=0`, `changes=[]`.
Não houve criação/edição de tarefas, testes, defeitos ou requisitos nesta rodada; não houve
reset, drop, truncate, limpeza de banco ou acesso à produção.

## B — Previous UI

A tela usava `requirements-matrix`, cinco métricas legadas, tabela de nove colunas,
paginação anterior/próxima e seleção de linha para abrir o fluxo. Não havia histórico
de situação. O endpoint legado permanece disponível para seus consumidores; o markup
e CSS da tabela deixaram a superfície principal.

## C — New UI

Cabeçalho → resumo integrado → `CollapsibleFilterPanel` fechado inicialmente → catálogo
em `sprint-grid` → fluxo existente. Cada Requirement Card oferece “Ver rastreabilidade” e
“Histórico”. O histórico usa `SprintDialog` e `HistoryEventRow` canônicos.

A composição usa tokens semânticos, gap de 24px entre seções e 20px entre cards,
sem somar margens das primitives ao gap da composição. Os cards usam a família
Sprint/Marco, título em até duas linhas, rodapé próprio e ações existentes. Altura de
36rem no catálogo de múltiplas colunas; altura automática quando a área útil passa
para uma coluna. O resumo segue a tipografia dos catálogos TestCases/Defects.

## D — Summary

| Metric | Source |
| --- | --- |
| Requisitos | `summary.total` |
| Em desenvolvimento | Soma dos buckets `PLANEJADO`, `EM_DESENVOLVIMENTO`, `IMPLEMENTADO` de `summary.bySituation` |
| Em validação | Soma dos buckets `AGUARDANDO_VALIDACAO`, `EM_VALIDACAO`, `VALIDADO` de `summary.bySituation` |
| Com defeito | `summary.withDefect` |
| Concluídos | `summary.bySituation.CONCLUIDO` |

As somas agrupam apenas contadores autoritativos da API; não classificam requisitos.
O resumo é global ao projeto, independente da página e dos filtros. Help discreto via
`title` e nome acessível explica cada macro. Durante ausência de resposta, mostra “—”.

No projeto real observado: 4 / 3 / 0 / 0 / 0. Há defeitos nos cards de REQ-3 e REQ-4,
mas a situação de ambos continua `EM_DESENVOLVIMENTO`, conforme prioridade do motor.
Por isso o macro de situações “Com defeito” não foi recalculado pela interface a partir
da mera existência desses defeitos.

## E — Filters

`GET /projects/:projectId/traceability/requirements` recebe:

- `search`: REQ-id ou título, debounce de 300ms; invalidação da resposta anterior imediata.
- `situation`: as 11 situações; `requirementStatus`: os oito valores persistidos existentes.
- `hasTests`, `hasOpenDefects`, `hasTechnicalEvidence`: Todos/Sim/Não via `SelectControl`.
- `page`, `limit=20`: paginação do servidor; alteração/limpeza volta à página 1.

“Com defeitos pendentes” apresenta `hasOpenDefects`, que inclui abertos, em correção e
aguardando reteste. Não há filtro local sobre os itens carregados. O wrapper e o botão
“Limpar filtros” só existem com algum filtro ativo. A busca real `REQ-2` retornou
“1 de 4 requisitos”; limpar restaurou os quatro. `false` é preservado pelo cliente HTTP.

## F — Requirement Card

| Conteúdo | Campo do DTO |
| --- | --- |
| Identidade, título, status secundário | `requirement.id/displayId/title/status` |
| Situação principal | `situation` |
| Progresso e tarefas | `progress.percentage/tasksDone/tasksTotal` |
| PRs, commits, issues | `artifacts.pullRequests/commits/issues` |
| Casos ativos e resultados atuais | `validation.testCasesTotal/pass/fail/blocked/neverExecuted` |
| Defeitos e fases | `defects.total/open/inCorrection/waitingRetest/validated` |
| Evidências | `evidence.implementation/validation/correction` |

Progresso nulo permanece “Sem dados”; zero tarefas recebe texto próprio. A barra existente
foi reaproveitada com nome acessível, valor e `aria-valuetext`. Correção distingue
`NOT_APPLICABLE`, `PRESENT` e `MISSING`. Os números de resultados não são apresentados
como total histórico de execuções. Artefatos são contadores de vínculos fornecidos pela
projeção, que não contém URLs individuais; nenhum link específico foi inventado.

Os botões são os alvos de teclado; a surface inteira não duplica a ativação. Seleção
usa contorno semântico e `aria-current`. O título completo continua disponível no atributo
`title` e no nome acessível do artigo.

## G — Situation Presentation

| Situation | Label | Variant |
| --- | --- | --- |
| SEM_RASTREABILIDADE | Sem rastreabilidade | neutral |
| PLANEJADO | Planejado | neutral |
| EM_DESENVOLVIMENTO | Em desenvolvimento | info |
| IMPLEMENTADO | Implementado | info |
| AGUARDANDO_VALIDACAO | Aguardando validação | warning |
| EM_VALIDACAO | Em validação | info |
| COM_FALHA | Com falha | danger |
| EM_CORRECAO | Em correção | warning |
| AGUARDANDO_RETESTE | Aguardando reteste | warning |
| VALIDADO | Validado | success |
| CONCLUIDO | Concluído | success |

Mapper único em `model/requirement-view.js`; o motor não foi reproduzido no frontend.
“Status do requisito” permanece explicitamente separado da situação derivada.

## H — History

`GET /projects/:projectId/traceability/requirements/:requirementId/history`, `limit=30`,
`cursor` opaco. Append mantém ordem recebida e deduplica por ID; retry conserva o cursor
que falhou. Loading, erro e vazio próprios não apagam o catálogo.

`BASELINE_INITIALIZED` recebe “Baseline da rastreabilidade registrado” e “Situação inicial
observada: …”, sem estado anterior fictício. Transições normais e regressões mostram
origem → destino com labels localizadas. Reasons de requisitos/tarefas/evidências/testes/
defeitos/retestes usam descrições em português. Entidade/id de origem só aparecem quando
fornecidos, sem inferir mudanças de campos não presentes no evento. “Registro automático”
não atribui o evento a uma pessoa não informada pela API.

Dialog compacto, descrição “Evolução da situação de rastreabilidade.”, Escape, trap e retorno
ao trigger. Nenhum filtro histórico foi simulado. O banco real cobriu baseline e estado
vazio anterior à adoção; transições, erros e cursor adicional foram cobertos por automação.

## I — React Flow Preservation

- New node types: **NONE**.
- New edge types: **NONE**.
- Existing flow behavior preserved: **YES**.

`TraceabilityFlow.jsx` e `TraceabilityFlow.css` permanecem byte a byte iguais ao baseline.
A seleção segue chamando o endpoint legado de perspectiva com o contrato original.
Foco vai ao heading do fluxo; a chegada da resposta ajusta o scroll somente enquanto
esse heading ainda mantém foco. Ações de histórico não acionam o fluxo.

Centralização e expansão do nó Requirement foram operadas no Chrome. Permanecem limitações
legadas: canvas claro em Dark; mínimo de zoom/enquadramento parcial para grafos largos
em 768/390; expansão de nó pode sobrepor níveis do layout fixo. O detalhe antigo também
continua exibindo alguns enums técnicos. Esses pontos não foram redesenhados nesta etapa.
O PASS do canvas significa **preservação**, não homologação do futuro grafo da Etapa 4.

## J — Async

Reutilizado `useTestCaseScope` pelo barrel público existente. Tokens validam identidade,
geração e requisição corrente mesmo quando o transporte ignora AbortSignal.

| Fluxo | Proteção |
| --- | --- |
| Projeto A → B | Instância da página por projectId; limpa filtros, seleção, histórico e dados |
| Search A → B | Cancela token imediatamente e agenda somente a consulta vigente |
| Filtro A → B | Página 1 e catálogo anterior removido; resposta obsoleta descartada |
| Load more → novo filtro | Append antigo não entra no novo catálogo |
| Requirement graph A → B | Recurso independente; resposta/erro antigo não substitui B |
| History A → B | Instância por requisito, cancelamento ao fechar e verificação do token |

Sem retry automático, sleep de aplicação, alteração de pathname ou reload geral para
resolver concorrência. Cancelamento do transporte é complementar à validade do token.

## K — Visual Matrix

Chrome real autenticado, projeto 2, Light/Dark, altura de viewport 1000px. Capturas reais
(full page e recortes do navegador) foram inspecionadas durante a sessão; medições DOM
complementaram a inspeção. Imagens transitórias durante animação da sidebar/capturas
reduzidas foram substituídas por capturas estáveis/integralmente legíveis. Não foram
adicionados arquivos PNG ao repositório.

| Surface | Light 1440 | Dark 1440 | Light 1280 | Dark 1280 | Light 768 | Dark 768 | Light 390 | Dark 390 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Traceability Main | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Summary | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Filters | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Requirement Card | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Requirement Card long data | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Requirement Card zero data | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Selected Requirement | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| History | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Existing React Flow | PASS* | PASS* | PASS* | PASS* | PASS* | PASS* | PASS* | PASS* |

72 células observadas; `*` indica preservação com as limitações de I. “Long data” usa
o título de REQ-4 e os contadores reais de testes/defeitos, não uma fixture extrema.
REQ-2 cobre zero tarefas/testes/defeitos e progresso sem dados. REQ-4 cobre seleção,
25%, evidência de implementação/validação, correção ausente e baseline real.

Cards desktop: altura externa 576px e `scrollHeight == clientHeight == 574px` nos dados
observados. Em 390px a altura é automática e os conteúdos/rodapés permanecem acessíveis.
Não houve overflow horizontal da página nas quatro larguras. Tablet foi inspecionado
com sidebar recolhida/expandida, incluindo card Light e composição Dark expandida.

Comparação renderizada em Light desktop: Sprint Card, Marco Card, TC-5 e DEF-4;
resumos TestCases/Defects; filtros TestCases/Defects/Kanban; históricos TASK-17 e DEF-4.
Mesmas families de borda/surface/rodapé, filtros recolhíveis, selects e HistoryEventRow.
As dimensões de conteúdo diferentes não foram forçadas a uma altura idêntica entre domínios.

Teclado: seleção por Enter, foco no heading, abertura de histórico, Escape e retorno ao
botão foram observados. Trap/ações Space e ausência de dupla ativação também possuem
testes. VIEWER, erros, eventos adicionais e paginação além dos quatro requisitos não foram
promovidos a evidência renderizada; cobertura automatizada é reportada separadamente.

## L — Tests

Suíte crítica final: `TraceabilityPage.test.jsx`, `TraceabilityFlow.test.jsx`,
`dark-legacy-compatibility.test.js`, `compactParams.test.js`.

- Focused: **70 PASS**.
- Repeatability: **10/10 execuções consecutivas**, 70 PASS por execução, sem retry/skips.
- Full: **82 arquivos / 1.019 testes PASS**.
- Coverage: **82 arquivos / 1.019 testes PASS**; statements 80,75%, branches 75,60%,
  functions 76,36%, lines 82,85%; thresholds do projeto atendidos.

A execução inicial completa encontrou uma asserção ligada à tabela removida; foi substituída
pela verificação de tokens da nova apresentação, preservando as demais asserções de tema.
As execuções finais foram feitas após os ajustes de densidade, responsividade e espaçamento.
Logs locais em `/private/tmp/traceflow-s109e3/final-*.log` são temporários.

## M — Gates

| Gate | Result |
| --- | --- |
| focused | PASS — 70 |
| repeatability | PASS — 10/10 consecutivas |
| full | PASS — 1.019 |
| coverage | PASS — thresholds atendidos |
| lint | PASS — `npm run lint` |
| format | PASS — `npm run format:check` |
| build | PASS — `npm run build` |
| backend affected | NOT APPLICABLE — código backend preservado |
| git diff --check | PASS |

Gates locais; nenhum resultado de CI remoto é afirmado.

## N — Backend Impact

Schema: **UNCHANGED**. Migration: **UNCHANGED**. Situation Engine: **UNCHANGED**.
History implementation: **UNCHANGED**. Read DTO/API: **UNCHANGED**.

A única escrita operacional foi a adoção do baseline atual de quatro requisitos pelo
script existente no banco local de QA. Não houve alteração do contrato ou criação de
regras. Snapshot SHA-256 confirmou os 453 arquivos monitorados de backend, tokens e
componentes do React Flow sem mudanças.

## O — Documentation

- Este relatório.
- `docs/design/UI_SURFACE_INVENTORY.md`: catálogo, resumo, filtros, Requirement Card,
  histórico e integração ao fluxo; matriz antiga deixa de ser superfície ativa.
- `docs/design/validation/VISUAL_VALIDATION_LOG.md`: somente observações desta rodada.

Design System, regras da baseline e API Contract não foram alterados.

## P — Git final

`git status --short`: alterações restritas ao frontend de rastreabilidade, três arquivos
de testes afetados e três documentos. Arquivos adicionados permanecem untracked;
não houve staging. `git diff --check`: PASS. HEAD preservado:
`bb768e33b2002ab3e35edf7175760ebb0eb7bb88`.

```text
 M docs/design/UI_SURFACE_INVENTORY.md
 M docs/design/validation/VISUAL_VALIDATION_LOG.md
 M frontend/src/features/traceability/api/traceability.api.js
 M frontend/src/features/traceability/pages/TraceabilityScreen.css
 M frontend/src/features/traceability/pages/TraceabilityScreen.jsx
 M frontend/test/pages/TraceabilityPage.test.jsx
 M frontend/test/shared/compactParams.test.js
 M frontend/test/styles/dark-legacy-compatibility.test.js
?? docs/deliveries/S1_09_FRONTEND_REQUIREMENT_CARDS_HISTORY_REPORT.md
?? frontend/src/features/traceability/components/RequirementCatalog.jsx
?? frontend/src/features/traceability/components/RequirementHistory.jsx
?? frontend/src/features/traceability/hooks/
?? frontend/src/features/traceability/model/
```

## Q — Git operations

**NO COMMIT · NO PUSH · NO MERGE · NO REBASE · NO RESET**.
Também não houve force, clean ou stash. Etapa 4 não iniciada.
