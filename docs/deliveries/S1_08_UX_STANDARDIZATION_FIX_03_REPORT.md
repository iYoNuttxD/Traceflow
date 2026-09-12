# S1-08 — UX/UI Standardization FIX 03

**S1-08 UX STANDARDIZATION FIX 03 — PASS LOCAL**

Data: 2026-09-09. Escopo: densidade e ações de Defect Cards, acesso à Correção e
paridade estrutural entre Rastreabilidade e Qualidade em Task Details.

## A — Baseline

| Item | Estado antes da implementação |
|---|---|
| Checkout | `/Users/daniel/Coding/Traceflow` |
| Branch | `daniel-dev` |
| HEAD | `591453fabd3ca2c91df8ee43200736e1d426d9e4` |
| Working tree | Limpa; nenhum arquivo modificado ou não rastreado |
| `git diff --check` | PASS |

Antes de editar, foram lidos os padrões canônicos de Design System/inventário e
inspecionados DefectCard, TaskDetailsLayout, TaskTraceability, TaskQuality,
EntityRow, DefectFlow/Details e a leitura do catálogo. Na sessão real, o catálogo
e TASK-16 foram observados no tema escuro a 1440px. O hash dos arquivos rastreados
foi registrado em `/private/tmp/traceflow-s108-fix03/baseline.json`; observações
iniciais em `audit.md` no mesmo diretório.

## B — Defect Card Before/After

| Aspecto | Antes | Depois |
|---|---|---|
| Informação | Identidade, título, severidade, responsável, status, detecção, contagem/ciclo | Mantém o contexto e acrescenta requisito, TASK-id/status quando única e contadores quando múltiplas |
| Espaço vazio | Altura fixa de 448px, com espaço sem informação operacional | Mínimo de 416px, preenchimento útil e crescimento por conteúdo |
| Grid | Família `sprint-grid`, até três colunas | Mesmas colunas e gap de 20px; tiles alinhados por linha |
| Footer | Histórico/menu; Retestar no estado elegível | Adicionar/Acessar correções sempre contextual; Retestar primário quando elegível |
| Requisito ausente | Não apresentado no card | Sem wrapper vazio; não inventa vínculo |
| Mobile | Altura automática | Mantida; ações legíveis a 390px |

A 1440px e 1280px, a linha que contém Aguardando reteste mediu 459px para acomodar
as duas linhas de ações; Aberto/Validado mediram 416px. Portanto, a melhoria é
densidade informativa e ajuste ao conteúdo, sem afirmar redução de altura de
todos os estados. Acessar correções ocupa a primeira linha do footer de reteste;
Retestar, Histórico e menu ocupam a segunda. Nas demais situações há uma linha.
Nenhuma ação ficou cortada ou sobreposta nos quatro recortes.

Sprint, Marco, TestCase e Defect foram comparados renderizados a 1440px no tema
claro: grid, raio, títulos, metadados, tile de criação e footer pertencem à mesma
família. Os conteúdos específicos e as alturas por conteúdo foram preservados.

## C — Correction Actions

| Defect state | Correction tasks | Actions |
|---|---:|---|
| Aberto | 0 | Adicionar correção primário → Details/Correção → Criar ou Vincular; Histórico/menu |
| Aberto | 1+ | Acessar correções; Histórico/menu |
| Em correção | 1+ | Acessar correções; Histórico/menu |
| Aguardando reteste | 1+ | Retestar primário; Acessar correções secundário; Histórico/menu |
| Validado | 1+ | Acessar correções e Histórico/menu; correções e validação continuam consultáveis |

Tabela para quem possui escrita. VIEWER recebe Acessar correções e Histórico, sem
Criar/Vincular, Retestar ou menu de escrita. Autorização e permissões de edição/
exclusão existentes permanecem sob o contrato vigente.

A entrada contextual usa `?defect=<id>&section=correction`, abre Defect Details
e posiciona scroll/foco na região Correção após carregar os dados. Não há manager
intermediário. Criar e Vincular continuam subviews do mesmo dialog. Cancelar
restaura foco no CTA usado. O link da Correction Task navega ao Task Details
existente no Kanban; o retorno é pelo histórico do navegador, preservando o
defeito e a seção. Não foi criado um novo botão de retorno nem empilhado dialog.

Observado: DEF-4 → Correção com foco → TASK-17 com um dialog → Voltar → mesmo
DEF-4/Correção com foco. DEF-2 → Adicionar correção → Criar/Cancelar e Vincular/
Cancelar restauraram o foco correspondente. DEF-1 validado abriu Correção,
TASK-12, tentativa anterior e validação EXEC-0005, sem oferecer criar/vincular.

## D — Quality Parity

Comparação na mesma TASK-16: Requisito e PR preenchidos, Commits/Issues vazios,
TestCase preenchido e Defect ORIGEM. TASK-15 complementou TC vazio + Defect CORREÇÃO.

| Propriedade | Rastreabilidade | Qualidade |
|---|---|---|
| Shell | `ArtifactCategory` | O mesmo componente |
| Cabeçalho/contador | 53px / contador de 28px | Mesmos valores observados |
| Padding do corpo | 16px | 16px |
| Gap de corpo/lista | 12px | 12px; sem stream vazia reservando espaço |
| EntityRow com metadados | 102px na linha REQ | 102px nas linhas TC/DEF |
| Footer | Opcional, independente | Criar caso de teste compacto, largura do conteúdo |
| Grid | Duas colunas, colapso móvel | Mesmo grid |

Os cards TC/DEF preenchidos passaram de 271,39px para 253,39px no desktop;
REQ/PR mediram 209,5px e Commits/Issues vazios 144px. Alturas totais variam com o
conteúdo e ações; borda, cabeçalho, padding, alinhamento e geometria das linhas
compartilham a mesma estrutura. TC vazio e DEF preenchido continuam alinhados por
linha, com ação no footer e estado vazio no corpo.

## E — Card Shell

Reuso de `TaskDetailsLayout`, `TaskTraceabilityGrid`, `ArtifactCategory`,
`EntityRow` e tokens existentes. A classe explícita `task-detail-relation-card`
delimita o shell, substituindo o seletor genérico de qualquer article descendente.
`task-detail-artifact-heading`, `task-detail-artifact-body`,
`task-detail-artifact-footer` e `task-detail-relation-list` concentram a composição.
Nenhum componente paralelo de card ou nova camada de interface foi criado.

## F — Entity Rows

| Entidade | Apresentação | Navegação |
|---|---|---|
| TestCase | TC-id/título; status e última execução em texto compacto | Details existente do caso |
| Defect | DEF-id/título; ORIGEM/CORREÇÃO, severidade e status em texto compacto | Details existente do defeito |
| Correction Task | TASK-id/título; status, prioridade, responsável e referência existente | Task Details existente, com retorno pelo navegador |

Nas categorias de relação, título e metadados ocupam até duas linhas com alturas
de linha 20px e 16px e gap de 4px. O título completo permanece no nome acessível;
o chevron não encolhe e conserva seu alinhamento. TC e DEF não usam badges de
alturas diferentes dentro da mesma linha. CorrectionTaskRows mantém seu conteúdo
e semântica; a navegação deixa a rota do defeito no histórico em vez de limpá-la
antes de abrir a tarefa. Paginação, erros, retries e contexto assíncrono foram
preservados.

## G — Visual Matrix

Chrome real autenticado, APIs locais, projeto 2, dados sintéticos persistidos
preexistentes. Viewports emulados com altura de 1000px. **PASS significa inspeção
renderizada nesta rodada**, com capturas vistas durante a sessão e medições DOM
complementares. Uma captura pode cobrir várias superfícies; a tabela representa
96 células de cobertura, não 96 arquivos de imagem.

| Surface | Light 1440 | Dark 1440 | Light 1280 | Dark 1280 | Light 768 | Dark 768 | Light 390 | Dark 390 |
|---|---|---|---|---|---|---|---|---|
| Defect Catalog | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Defect Card aberto | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Defect Card em correção | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Defect Card aguardando reteste | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Defect Card validado | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Task Details | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Task Rastreabilidade | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Task Qualidade | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Quality TestCases empty | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Quality TestCases populated | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Quality Defects | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Defect Details Correção | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |

Dados observados: DEF-2 aberto/zero, DEF-3 em correção/TASK-15,
DEF-4 aguardando reteste/TASK-17 concluída e DEF-1 validado/ciclo 2/TASK-12.
TASK-16/TC-5/DEF-4 cobriram Qualidade preenchida; TASK-15/DEF-3 cobriram TC vazio.
Não foi observado overflow horizontal da página ou sobreposição das ações.
Títulos em duas linhas e requisitos truncados mantiveram o grid e os chevrons.

Complementos renderizados: referências Sprint/Marco/TestCase no desktop claro;
consulta de correções do validado; criação/vínculo abertos e cancelados no mobile;
navegação de tarefa e retorno no desktop. Não houve submissão de dados de negócio.
Múltiplas correções, requisito ausente, VIEWER, erros remotos, concorrência e
mutações são evidência automatizada, não classificação visual desses estados.
Interrupções de conexão do navegador foram recuperadas e as capturas incompletas
refeitas. Não houve bloqueio visual residual.

## H — Tests

Runtime local dos gates: Node 22.23.2, com
`NODE_OPTIONS=--no-experimental-webstorage`.

| Execução | Resultado |
|---|---|
| Focados: `npx vitest run test/defects test/components/FrozenTaskDetails.test.jsx test/pages/KanbanPage.test.jsx` | 129/129, 9 arquivos |
| Repetibilidade: mesmo comando, dez vezes sequenciais, sem retry | 10/10 PASS; 129 testes em cada execução |
| Frontend `npm test` | 978/978, 82 arquivos |
| Frontend `npm run test:coverage` | 978/978; thresholds aprovados |
| Backend `npx vitest run test/unit/defects` | 31/31, 3 arquivos |

Novos testes em `Fix03.test.jsx`: cinco combinações status/contagem/CTA, VIEWER,
requisito presente/ausente, tarefa única/agregados, ausência de leituras por card,
entrada assíncrona com foco em Correção, cancelamento com retorno de foco,
Correction Task navegável e composição comum das seis categorias com TC vazio ou
preenchido. As suites existentes cobrem regressões de fluxo, recibos, concorrência,
histórico, contexto congelado e Kanban. Geometria CSS foi conferida no navegador.

Backend: resumo zero/uma/várias tarefas, exclusão de ciclo anterior e consulta de
listagem sem busca individual de Task. A alteração de leitura usa o mesmo
findMany/count/groupBy do repositório e seleciona apenas id/status na relação.

Cobertura final: statements **80,43%**, branches **75,21%**, functions **75,85%**,
lines **82,57%**. Logs finais em `/private/tmp/traceflow-s108-fix03/`:
`repeat-final-1.log` a `repeat-final-10.log`, `full-final.log`,
`coverage-final.log`, `backend-final.log` e os logs dos gates abaixo.

## I — Gates

| Gate | Resultado |
|---|---|
| focused | PASS — 129 testes |
| repeatability | PASS — 10 consecutivas, sem retry |
| frontend lint | PASS |
| frontend format:check | PASS |
| frontend full | PASS — 978 testes |
| frontend coverage | PASS — 978 testes e thresholds |
| frontend build | PASS |
| backend affected | PASS — 31 testes |
| backend lint / format:check / architecture:check | PASS |
| git diff --check | PASS |

Lint/format/build: `lint-final.log`, `format-final.log`, `build-final.log`.
Backend: `backend-lint.log`, `backend-format.log`, `backend-architecture.log`.
Evidência local; CI remoto não foi executado nem reclassificado como aprovado.

## J — Backend Impact

| Área | Impacto |
|---|---|
| Schema | UNCHANGED |
| Migration | UNCHANGED |
| Domain | UNCHANGED |
| Lifecycle | UNCHANGED |
| Autorização / soft delete / retest | UNCHANGED |
| List/read DTO | Acrescenta `correctionSummary` do ciclo atual |

Formato: `{total,todo,inProgress,done,singleTask}`. A tarefa única contém somente
`{id,status}`; nos demais casos é `null`. `correctionTaskCount` permanece.
A relação de correção já consultada passa a selecionar os dois campos de Task;
os contadores são projetados no presenter. Não há endpoint novo, consulta de
detalhe por card, chamada GitHub ou chamada de Task por item. A paginação da
listagem permanece. Detalhes/recibos incluem o mesmo resumo para reconciliar o
catálogo após operações existentes. Requisito já estava no DTO.

Arquivos backend de produção alterados: `defect.presenter.js` e
`repositories/defect.repository.js`. Contrato registrado em `API_CONTRACTS.md`.
Não houve escrita no banco nesta rodada.

## K — Git final

Branch e HEAD permanecem `daniel-dev` e
`591453fabd3ca2c91df8ee43200736e1d426d9e4`.
`git diff --check`: PASS. Working tree contém somente as alterações locais desta
rodada, apresentadas por `git status --short`:

```text
 M backend/src/modules/defects/defect.presenter.js
 M backend/src/modules/defects/repositories/defect.repository.js
 M backend/test/unit/defects/read-presentation.test.js
 M docs/api/API_CONTRACTS.md
 M docs/design/DESIGN_SYSTEM.md
 M docs/design/UI_SURFACE_INVENTORY.md
 M docs/design/validation/VISUAL_VALIDATION_LOG.md
 M frontend/src/features/defects/DefectsScreen.jsx
 M frontend/src/features/defects/components/DefectDetails.jsx
 M frontend/src/features/defects/components/DefectFlow.jsx
 M frontend/src/features/defects/defects.css
 M frontend/src/features/tasks/components/TaskDetailsLayout.jsx
 M frontend/src/features/tasks/components/TaskDetailsPanel.css
 M frontend/src/features/tasks/components/TaskQuality.jsx
 M frontend/src/shared/components/EntityRow.css
 M frontend/test/defects/UxAlignment.test.jsx
?? backend/test/unit/defects/catalog-summary.test.js
?? docs/deliveries/S1_08_UX_STANDARDIZATION_FIX_03_REPORT.md
?? frontend/test/defects/Fix03.test.jsx
```

Comparação de hashes com o baseline: arquivos rastreados fora dessa lista
preservados. Schema, migrations e regras de domínio/lifecycle não foram alterados.

**NO COMMIT · NO PUSH · NO MERGE · NO REBASE · NO RESET.**
Também não houve force-push, clean ou stash. Nenhuma etapa S1-09, revisão geral ou
S1-08 Final Integrated QA foi iniciada. Rodada encerrada neste gate local.
