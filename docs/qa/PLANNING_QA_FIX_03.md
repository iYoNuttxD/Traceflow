# PLANNING-QA-FIX-03

## Decision

**PLANNING-QA-FIX-03 — TECHNICALLY PASS**

Execução local em 04/09/2026. Frozen Kanban, Marco opcional, exclusão lógica de Sprints/Marcos e hierarquia de ações implementados e verificados. Pronto para nova QA integrada; este relatório não representa homologação touch, aprovação visual final ou execução de CI remoto.

Evidências locais: `/private/tmp/planning-qa-fix-03/`. Os logs, JSONs, screenshots e relatórios HTML de coverage foram preservados nesse diretório. As credenciais, sessões artificiais e bancos de fixture não fazem parte da entrega.

## Baseline

| Item | Registro |
| --- | --- |
| Branch | `joao-dev-v2` |
| HEAD inicial/final | `524d0869785e1603b99d39cd37ab7a5f07deb8b9` |
| Working tree inicial | Limpa; nenhuma mudança preexistente sobrescrita |
| Node | `v22.23.2` |
| MySQL | Local disponível, `9.7.1`; CI usa `8.4.8`: **NOT CI-EQUIVALENT** |
| Banco de teste | Disponível; criados dois schemas exclusivos, sem tocar `traceflow`, produção ou dados preexistentes |
| Git inicial | `status --short`, branch, HEAD e `diff --check` verificados |

Leitura integral anterior à implementação: regras de Planning, FIX-02, modelo histórico, contratos de API e ADRs de Sprint/Marco, além das instruções do repositório. Relatórios antigos foram preservados por comparação SHA-256.

## Frozen Kanban

**Root cause:** a tela filtrava Tasks atuais por `Task.sprintId`; o carry-over retirava as pendências do quadro de origem. A associação histórica e os pontos/status de encerramento já existiam, mas os demais campos visíveis eram mutáveis.

**Snapshot source:** `GET /api/sprints/:id/tasks` fornece uma projeção canônica. Para terminais, consulta participações presentes no encerramento e snapshots persistidos, sem join com a Task atual. A consulta de projeto inteiro continua operacional e não duplica Tasks.

| Momento | A Fazer | Em andamento | Concluído | Pontos de T1/T2/T3 |
| --- | --- | --- | --- | --- |
| S1 antes do close | T1 | T2 | T3 | 3 / 5 / 8 |
| S1 congelada | T1 | T2 | T3 | 3 / 5 / 8 |
| S2 após carry-over | T1 | T2 | — | 3 / 5 / — |
| S2 após trabalho | T2 | — | T1 | 13 / 21 / — |
| S1 após mudanças em S2 | T1 | T2 | T3 | 3 / 5 / 8 |

**Tasks at close:** três. Todas continuam nas três colunas originais; total 3, concluídas 1, pontos 16 e progresso 50%. T1/T2 continuam operacionais em S2; T3 não entra no carry-over.

**Historical card fields:** ID, título, status, pontos, prioridade, ID do responsável, prazo e contagens de rastreabilidade no fechamento. Alterações posteriores de título, esforço, status, prioridade, atribuição, prazo e rastreabilidade não reescrevem S1. Não copiamos nome/e-mail do responsável, descrição ou conteúdo de artefatos. O responsável histórico é identificado pelo ID.

**Historical Task Details:** clique abre “Detalhes no encerramento”, somente leitura. “Abrir tarefa atual” é uma ação explícita e separada, com carregamento/erro próprios. Exclusão posterior da Task conserva o card e retira a disponibilidade da ação atual. DnD e handlers de movimento ficam desativados no quadro congelado.

Sprints congeladas são selecionadas individualmente, com indicação explícita; seleção múltipla de Sprints abertas permanece disponível. Busca/filtros históricos usam somente valores do snapshot. Erro de carregamento não substitui o snapshot por dados atuais.

**Tests:** regressões iniciais em `frozen-red.log` falharam nos dois cenários principais antes da implementação. A suíte `backend/test/integration/planning-frozen-kanban.test.js` cobre mutações futuras, Task excluída, removida antes do close, adição tardia e legado. API e frontend cobrem envelope, colunas, contagens, detalhes, ausência de mutação e retry de leitura sem fallback live.

A fotografia de projeção/evolução/participações de S1 manteve o SHA-256 `e6edec8ffb9b4c9a6130fff499c1a5fcd43a812a8e09b1f13072d2335471f122` após as operações de S2 e ao final do browser (`core-evidence.json`).

## Snapshot Model

**Existing fields reused:** `SprintTask.plannedAtStart`, `pointsAtPlanning`, `pointsAtClose`, `exitStatus`, `completedAtClose`, `closedAt`, `removedAt` e metadados de participação; `Sprint.planningSnapshotAt`, `closedAt` e a projeção existente `historicalSummary`. Planejamento e encerramento continuam conceitos separados.

**New fields:** `SprintTask.closingTaskSnapshot` JSON versionado, nullable; `Sprint.deletedAt/deletedById` e `Milestone.deletedAt/deletedById`.

**Migration:** somente `20260905010000_planning_frozen_cards_soft_delete`. Aplicação incremental em ambos os schemas artificiais: 47 migrations aplicadas, Prisma validate e migration status PASS. Nenhuma migration antiga editada, nenhum reset ou backfill com Task atual.

**Transaction:** captura os campos detalhados junto com os snapshots existentes, antes do carry-over, na transação de encerramento. Mantém locks e revalidação de domínio; não cria status terminal sem fotografia por uma operação separada.

**Schema audit:** cinco colunas novas nullable, quatro índices e duas FKs de ator com `ON DELETE SET NULL`, conferidos no MySQL. Índices compostos `(projectId, deletedAt, status)` atendem consultas atuais. FKs/cascatas preexistentes não foram alteradas; exclusões do domínio não executam DELETE físico de Sprint/Marco. A unicidade existente do nome da Sprint no projeto também não mudou: nomes de tombstones continuam reservados.

**Legacy behavior:** `LEGACY_CLOSING_TASK_SNAPSHOT_UNAVAILABLE` identifica ausência do JSON detalhado. A UI informa a limitação e usa somente campos históricos conhecidos; status desconhecido não é inventado para preencher uma coluna. Não há reconstrução retroativa fictícia. As limitações anteriores de pontos, membership e cutoff permanecem explícitas.

## Sprint Without Milestone

| Operação | Resultado |
| --- | --- |
| Create com `milestoneId` omitido | PASS |
| Create com `milestoneId: null` | PASS |
| Edit attach: sem Marco → Marco | PASS em Sprint aberta |
| Edit detach: Marco → sem Marco | PASS em Sprint aberta |
| Start sem Marco | PASS |
| Close sem Marco | PASS |
| Carry-over sem Marco | PASS |
| Cronograma | Sprint sem Marco continua visível e mantém suas regras temporais |
| Sprint terminal | Continua recusando alteração de associação |

A FK já era nullable; nenhuma migration foi criada para essa opcionalidade. Formulário e contrato removem a exigência; card exibe “Sem marco”. Referência existente a Marco excluído permanece identificável como tombstone e não permite nova associação a ele.

## Sprint Safe Delete

**Model:** exclusão lógica em transação com ator e auditoria. Ordem de bloqueio preservada: Project → Sprint → Tasks atuais. Não conclui, cancela, reabre ou executa carry-over implicitamente.

| Estado | Resultado |
| --- | --- |
| PLANEJADA | PASS: tombstone e Tasks atuais no backlog; participação preservada como saída |
| EM_ANDAMENTO | PASS: mesmo tratamento, sem carry-over |
| CONCLUIDA | PASS: tombstone sem alterar snapshots/participações congelados |
| CANCELADA | PASS: mesma preservação histórica terminal |

**Task handling:** todas as Tasks cujo ponteiro atual ainda é a Sprint excluída vão ao backlog, inclusive concluídas; seus status não mudam. Tasks já transferidas para S2 não são afetadas. TaskHistory registra a mudança de Sprint.

**Historical preservation:** testes consultam diretamente SprintTask e snapshots após a exclusão. Falha de auditoria provoca rollback conjunto de tombstone, ponteiros e histórico. DELETE repetido/concorrente retorna conflito coerente sem repetir efeitos; API concorrente valida `[200,409]`.

**Carry-over exclusion:** tombstone sai de listas, seletores, cronograma e destinos futuros; não ocupa janela ou slot de Sprint ativa. Não há restauração ou hard delete novo.

**Authorization:** política atual preservada: MEMBER+, VIEWER 403, sem sessão 401, recurso de outro projeto 404. `SPRINT_ALREADY_DELETED` é conflito 409. Consulta de autorização pode resolver o projeto de um tombstone antes da resposta de domínio; consultas operacionais não o incluem.

**Tests:** `planning-safe-delete.test.js`, `schedule-contracts.test.js` e regressões de Sprint/Schedule. Antes da implementação, `lifecycle-red.log` registrou 11 falhas e 1 PASS no conjunto de 12 cenários; o conjunto final passa integralmente.

## Milestone Safe Delete

**Model:** `deletedAt/deletedById`, operação transacional auditada e conflito `MILESTONE_ALREADY_DELETED` em repetição.

**Linked Sprints:** pode excluir Marco vazio, com Sprint aberta ou concluída. Sprints e Tasks sobrevivem; a FK de associação permanece, sem detach ou cascade destrutivo.

**Historical behavior:** preserva snapshots, memberships e referência ao Marco. Cards e contexto existente indicam “Excluído”. A conclusão futura de uma Sprint não conclui novamente o Marco tombstoned.

**Selectors:** excluem Marcos deletados para novas associações. Sprint aberta pode manter a referência anterior enquanto edita outro campo, ou desvincular/reassociar a um Marco disponível. Sprint terminal conserva suas restrições.

**Tests:** integração direta, API/authz e corrida criação de Sprint versus exclusão de Marco. Resultado respeita a ordem transacional: associação criada antes é preservada; associação tentada depois é recusada.

## Sprint Card Actions

| Lifecycle | Ação principal | Demais ações |
| --- | --- | --- |
| Planejada | Iniciar sprint | Evolução secundária; bloqueio de início com outra ativa preservado |
| Em andamento | Concluir sprint | Evolução secundária |
| Concluída | Evolução | Consulta histórica e exclusão lógica no menu |
| Cancelada | Evolução | Consulta histórica e exclusão lógica no menu |

**Overflow:** Tarefas/Tarefas congeladas, Editar/Cancelar quando permitido, Kanban e Excluir. VIEWER conserva somente ações de consulta.

Confirmação terminal consulta `GET /api/sprints/:id/impact`, cuja escolha de destino usa a mesma função canônica do encerramento. Informa pendências, próxima Sprint real ou backlog. A transação revalida esse preview; ele não reserva o destino. DELETE informa as Tasks atuais que voltarão ao backlog e a preservação histórica.

Regressões comportamentais também provaram e corrigiram a chegada tardia de um preview após troca de projeto. Respostas antigas não abrem confirmação nem disparam mutação no contexto novo. Mutation concluída continua separada de falha de refresh.

## Business Rules

| Regra | Resultado |
| --- | --- |
| BR-KANBAN-015 | PASS — todas as Tasks presentes no close permanecem no quadro histórico |
| BR-KANBAN-016 | PASS — alterações futuras e carry-over não reescrevem o quadro congelado |
| BR-SPRINT-020 | PASS — Marco opcional |
| BR-SPRINT-015 | PASS — regra alterada por decisão explícita desta tarefa para exclusão lógica segura |
| BR-MILESTONE-013 | PASS — exclusão lógica preserva Sprints/referências |

**Total canonical rules: 111**, antes 107. Quatro regras novas, nenhuma removida; entre as 107 anteriores, somente BR-SPRINT-015 mudou. Comparação de conteúdo por ID registrada em `business-rules-audit.json`.

## Core Regression

| Regra | Resultado e evidência |
| --- | --- |
| BR-SPRINT-006 | PASS — membership capturada no start |
| BR-SPRINT-007 | PASS — remoção antes do start exclui Task do baseline |
| BR-SPRINT-008 | PASS — reentrada posterior é adição |
| BR-SPRINT-009 | PASS — removida depois continua planejada |
| BR-SPRINT-010 | PASS — composição terminal imutável; tombstone não reabre |
| BR-SPRINT-012 | PASS — progresso por pontos preservado, aberto operacional |
| BR-SPRINT-013 | PASS — evolução histórica não usa esforço atual |
| BR-SPRINT-014 | PASS — cutoff, totais e burndown congelados |
| BR-SPRINT-016 | PASS — carry-over automático para próxima Sprint planejada elegível |
| BR-SPRINT-017 | PASS — sem próxima elegível, backlog |
| BR-SPRINT-018 | PASS — concluídas não entram no carry-over |
| BR-SPRINT-019 | PASS — histórico de origem preservado após transferência |
| BR-SCHEDULE-013 | PASS — ponteiro atual da Task continua representando a Sprint atual |

Fontes executadas integralmente: `planning-history.test.js`, `planning-carry-over.test.js`, `rf10-sprint-schedule.test.js`, suites novas e API de Schedule. Incluem cenários A–E de baseline, 5→13/5→1, exclusão de Task, start/overlap concorrentes, rollback do close, double close, Milestones e Kanban. Full frontend também reexecutou ScheduleScreen, SprintProgressPanel, MilestoneSprintsPanel e TaskHistory.

## Browser Smoke

Chrome real controlado, AppShell autenticado com conta/projeto artificiais e backend MySQL separado. Capturas desktop em 1440×1000.

| Cena | Evidência | Resultado |
| --- | --- | --- |
| S1 before close | `s1-before-close-light.png` | Três Tasks, três colunas operacionais |
| S1 frozen | `s1-after-close-{light,dark}.png` | Três Tasks preservadas, sem DnD |
| S2 after carry-over | `s2-received-{light,dark}.png` | Somente T1/T2 |
| S2 after changes | `s2-after-work-{light,dark}.png` | Status e campos atuais alterados |
| S1 after S2 changes | `s1-after-s2-work-{light,dark}.png` | Quadro e métricas originais preservados |
| Detalhes | `frozen-details-*`, `explicit-current-details-*` | Histórico read-only e atual explicitamente separado |
| Marco opcional / cards | `optional-milestone-dialog.png`, `sprint-card-actions.png` | Opcionalidade e ações ativa/terminal renderizadas |
| Exclusão | `sprint-safe-delete-confirmation.png`, `milestone-safe-delete-confirmation.png` | Copy de impacto correto; ambas canceladas no browser |

**Light: PASS. Dark: PASS.** Capturas de S1 em ambos os temas, S2 alterada, detalhes históricos, formulário, cards, confirmações e mobile inspecionadas visualmente. São evidências de smoke controlado, sem promoção no Visual Validation Log.

**Console:** nenhum erro/warning capturado na execução concluída. A primeira automação interrompeu uma navegação no bootstrap de sessão após 12s; a execução retomada concluiu com espera de renderização de 30s e fechamento explícito dos dialogs. O incidente permanece em `browser.log`; não foi escondido como erro de negócio resolvido. A repetição final do preview/cancelamento após o último ajuste também passou (`browser-final-context.json`).

**Geometria mobile**, idêntica em Light/Dark, altura 844:

| Viewport | Document clientWidth / scrollWidth | Board clientWidth / scrollWidth |
| --- | --- | --- |
| 390 | 390 / 390 | 374 / 864 |
| 375 | 375 / 375 | 359 / 864 |
| 320 | 320 / 320 | 304 / 864 |

Nenhum overflow horizontal global; scroll interno do board preservado. `browser-evidence.json` contém 54 verificações PASS, incluindo repetições entre temas e navegações. Não representam 54 cenários distintos nem validação touch.

## Frontend Gates

| Gate, Node 22 | Resultado |
| --- | --- |
| Lint / format check | PASS |
| Focais | PASS: KanbanPage, SprintsScreen, MilestonesScreen e regressões de Planning |
| Full tests | PASS — 711 testes, 67 arquivos |
| Coverage | PASS — relatório completo |
| Build | PASS — aviso existente de chunk acima de 500 kB |
| Architecture / secrets | PASS — scanners compartilhados do repositório |
| Audit | PASS — 0 high, 0 critical, nenhuma exceção necessária |

A rodada final completa do frontend ocorreu após o ajuste de contexto de confirmação. Esse ajuste tem duas regressões inicialmente RED e depois GREEN (`context-red.log`, `context-green.log`). Não foi relaxada nenhuma asserção para aceitar erro inesperado.

## Backend Gates

| Gate, Node 22 | Resultado |
| --- | --- |
| Lint / format check | PASS |
| Unit | PASS — 554 testes |
| Integration/API | PASS — 378 testes; 5 skips canônicos separados |
| Focais de histórico, carry-over, soft delete, Sprint/Marco/Schedule/Kanban | PASS |
| Coverage completo | PASS — cinco rodadas consecutivas |
| Prisma validate / migration status | PASS — 47 migrations, schema atualizado no TEST DB |
| Schema audit | PASS — colunas, índices e FKs conferidos |
| Architecture / secrets | PASS — Route → Controller → Service → Repository → Prisma preservado |
| Audit / supply-chain | PASS — 0 high/critical; 12 testes das políticas de audit/CI em Node 22 |

Scanners compartilhados executados por `node backend/scripts/check-architecture.js` e `node backend/scripts/check-secrets.js`; não existem scripts homônimos no package frontend.

**Skips canônicos:** 1 caso de `e6-backfill.test.js` e 4 de `e11-legacy-responsibility.test.js`, próprios de banco pré-LR.2. Nenhum skip novo, retry artificial ou alteração de paralelismo global.

O preflight inicial de Integration/API identificou uma expectativa antiga do código 404 após exclusão de Marco. Foi atualizada para o contrato exato `MILESTONE_NOT_FOUND`; o log da falha foi preservado. Expectativas antigas de Marco obrigatório/hard delete foram substituídas pelas decisões explícitas deste pedido. As cinco rodadas finais de coverage abaixo não tiveram falhas.

## Coverage

Percentuais na ordem **Statements / Branches / Functions / Lines**.

| Execução | Testes | Percentuais | Report |
| --- | --- | --- | --- |
| Frontend final | 711 PASS | 80.68 / 74.06 / 76.33 / 82.89 | `frontend-coverage/index.html` |
| Backend Run 1 | 932 PASS + 5 skips | 90.31 / 79.21 / 94.09 / 92.82 | `final-backend-coverage-1/index.html` |
| Backend Run 2 | 932 PASS + 5 skips | 90.31 / 79.21 / 94.09 / 92.82 | `final-backend-coverage-2/index.html` |
| Backend Run 3 | 932 PASS + 5 skips | 90.31 / 79.21 / 94.09 / 92.82 | `final-backend-coverage-3/index.html` |
| Backend Run 4 | 932 PASS + 5 skips | 90.31 / 79.21 / 94.09 / 92.82 | `final-backend-coverage-4/index.html` |
| Backend Run 5 | 932 PASS + 5 skips | 90.31 / 79.21 / 94.09 / 92.82 | `final-backend-coverage-5/index.html` |

Cada backend run levou aproximadamente 48–50s e chegou ao report final. Repetibilidade **PASS, 5/5**. JSONs dos gates registram exit code 0 de cada etapa; logs completos e os seis reports HTML foram conferidos.

## Documentation

Atualizados:

- `PLANNING_BUSINESS_RULES.md`: decisões explícitas do pedido, sem reinterpretação das regras históricas.
- `PLANNING_HISTORY.md`: modelo, captura transacional, legado, tombstones, índices/FKs e retenção de nomes.
- `API_CONTRACTS.md`: Marco opcional, projeção de Tasks, preview de impacto, DELETE lógico e erros.
- ADR-010/ADR-011: decisões superadas identificadas e nova decisão registrada.
- `UI_SURFACE_INVENTORY.md`: ações, confirmações e detalhes históricos; nenhuma promoção de homologação visual.
- Inventário de dados pessoais e política de retenção: snapshot mínimo, IDs de responsável/atores e retenção vinculada ao histórico do projeto.
- Este relatório.

`PLANNING_FINAL_INTEGRATED_QA.md`, FIX-01 e FIX-02 preservados por hash. Visual Validation Log e TCC oficial não alterados. O inventário E8 permanece histórico; o inventário atual de Planning está em `PLANNING_HISTORY.md`.

## Git

Branch/HEAD iguais ao baseline. Mudanças locais abrangem schema/migration incremental, módulo de Sprints/Marcos, projeção de Tasks, UI de Planning/Kanban, regressões e documentação listada acima. São 50 arquivos alterados/criados (42 já rastreados e 8 novos). Relação completa dos arquivos em `git-final-name-only.txt`, incluindo novos arquivos, no diretório de evidências.

`git status --short`, `git diff --check`, `git diff --stat` e `git diff --name-only` executados ao final. **Diff check PASS.** Secret scan adicional dos 50 arquivos alterados/criados, incluindo testes, docs e migration: PASS. Nenhum commit, push, merge, rebase, reset ou PR review executado.

## Remaining Issues

- **BR-UX-005 — ENVIRONMENT BLOCKED:** sem dispositivo touch real; emulação de viewport e automação por mouse não homologam DnD mobile.
- **KANBAN KEYBOARD MOVE ACCESSIBILITY GAP:** DnD atual baseado em HTML nativo não possui fluxo de movimentação exclusivamente por teclado. Nenhum fluxo novo ou select de status foi introduzido.
- Legado anterior à migration pode não ter snapshot detalhado; a limitação é exibida, sem reconstrução a partir da Task atual.
- MySQL local 9.7.1 difere do CI 8.4.8. Gates locais não são CI remoto.
- A nova QA integrada/visual continua pendente. O smoke não promove surfaces para aprovação final.

**Cleanup PASS:** encerrados somente os processos artificiais, removido o perfil privado do browser e removidos `traceflow_test_planning_fix_03_20260904` e `traceflow_test_planning_fix_03_core_20260904`. Ausência dos dois schemas confirmada em `information_schema`. Bancos e dados preexistentes preservados. Evidência: `cleanup.json`.

## Recommendation

**READY FOR FINAL PLANNING QA**
