# TRACEFLOW S1-09 — TRACEABILITY GRAPH WORKSPACE UX REPORT

**Resultado: S1-09 TRACEABILITY GRAPH WORKSPACE UX — PASS LOCAL**

- Data: 2026-09-11.
- Branch: `daniel-dev`.
- HEAD inicial/final: `cf4a646b8bc9dcf4b301282d9e87bd5935acf2a4`.
- React Flow: `@xyflow/react 12.11.0`; ELK: `elkjs 0.12.0`, já presentes no baseline.
- Runtime: Node 22.23.2; navegador: Chrome/macOS, sessão local autenticada.
- Escopo: encerramento da Etapa 5 e suas targeted corrections. Não constitui o S1-09 Final Integrated QA nem aprovação de CI remoto.

## A — Baseline

Working tree inicialmente limpa. O HEAD já continha o workspace, Inspector, layout ELK, Details no mesmo diálogo e a correção do footer “Ver rastreabilidade”. Esta rodada preserva essas decisões e corrige a consistência da situação, a apresentação e os findings de teclado/responsividade reproduzidos na homologação. Nenhuma alteração preexistente foi descartada.

## B — Documentação técnica consultada

| Referência oficial | Decisão aplicada |
|---|---|
| [React Flow: layout](https://reactflow.dev/learn/layouting/layouting), [ELK](https://reactflow.dev/examples/layout/elkjs) | ELK layered, direção RIGHT, roteamento ortogonal; organização explícita |
| [ELK com múltiplos handles](https://reactflow.dev/examples/layout/elkjs-multiple-handles), [Handles](https://reactflow.dev/learn/customization/handles) | Portas por relação, identificadores estáveis, ordem fixa e atualização dos internals |
| [Drag handle](https://reactflow.dev/examples/nodes/drag-handle) | Separar arraste do card das ações `nodrag` |
| [Viewport instance](https://reactflow.dev/api-reference/types/react-flow-instance) | Centralização legível independente do mínimo manual |
| [Custom edges](https://reactflow.dev/learn/customization/custom-edges) | Caminhos ortogonais, hierarquia e labels sob demanda |
| [Acessibilidade](https://reactflow.dev/learn/advanced-use/accessibility) | Teclado, nomes acessíveis, foco e preservação da ativação nativa dos botões |
| [Controls](https://reactflow.dev/api-reference/components/controls), [MiniMap](https://reactflow.dev/api-reference/components/minimap) | Zoom/pan nativos e orientação no desktop |
| [ELK partitions](https://eclipse.dev/elk/reference/options/org-eclipse-elk-partitioning-activate.html), [Fixed alignment](https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-nodePlacement-bk-fixedAlignment.html) | Camadas semânticas e alinhamento determinístico; ciclos/retornos continuam relações reais |

## C — Problemas reproduzidos e targeted findings

| Finding | Root cause | Fix | Validation |
|---|---|---|---|
| Redundant Requirement status | Status cadastral competia com fase/situação | Removido somente do card; domínio e Inspector preservados | Todas as situações no teste de card; Chrome |
| Phase evolution absent | Somente label da fase corrente | Trail compartilhado com cinco fases | Atual/anterior/futura, regressão e conclusão sem correção |
| Situation precedence | Early return do estágio técnico antes da qualidade | Owner canônico `deriveSituation` prioriza falha/correção/reteste | Red: 5 regressões; focused e coverage backend verdes |
| Summary mismatch | Mesma policy incorreta alimentava projeções e contadores | Correção no backend, sem segunda policy no Summary | Fixture 4/2/1, invariante de contagem e sessão real |
| Tooltip spacing | Ícone centralizado em área larga | Alinhamento junto ao label, primitive compartilhada | Light/Dark; ajuda por teclado/Escape |
| Progress alignment | Linha sem alinhamento vertical explícito | Label/percentual alinhados, barra e suporte abaixo | 25%, 75%, 0%, Sem dados no Chrome |
| Min zoom | Mínimo manual 0.75 | Mínimo 0.20, centralização 0.90 | Transform real 0.20 → 0.90, grafo de 85 artefatos |
| Workspace context | Metadados soltos | Context strip com divisores, progresso e trail | Quatro larguras; correção da margem em 768 |
| Flow help | Texto corrido com pouca hierarquia | Quatro cadeias, legenda e instrução curta | Recolhido por padrão, aberto e rolável em mobile |
| Requirement Card hierarchy | Contagens em parágrafos | Seções, ícones, pares label/valor e evidências compactas | Cards com qualidade e sem relações |
| Defect Card hierarchy | Metadados pouco estruturados | Detection/correction/Requirement em definition rows | Severidade, responsável, status, footer e permissões preservados |
| Overview descriptions | Heading sem orientação breve | Descrição nas três superfícies, usando `sprints-summary__heading` | Resumos reais e testes de integração frontend |
| Back-to-project link | Contexto duplicado na página | Removido só da rota de rastreabilidade | Navegação pelo shell e projeto preservada |
| Focus regression revalidation | Último fix posterior aos gates anteriores; canvas interceptava Enter/Espaço dos botões | Handler agora intercepta apenas o wrapper do nó | Red/green específico, 10 rodadas e expansão real por teclado |

O layout inicial da Etapa 4 criava sensação estática, expansão alterava geometria e o enquadramento total reduzia a leitura. O baseline da Etapa 5 já havia substituído isso por cards fixos, Inspector, arraste e zoom legível. Nesta rodada o grafo grande confirmou a solução por exploração da cadeia, sem exigir todos os seus 85 artefatos simultaneamente legíveis na tela.

## D — Workspace

Um `SprintDialog` é o owner modal. Desktop: viewport menos 32px de cada lado a partir de 901px; tablet até 900px: margem de 16px em cada lado; mobile até 600px: tela inteira. Em 768×1024 o retângulo final medido foi x=16, y=16, largura=736, altura=992. Contexto e controles ficam separados do canvas. A subview de Details preserva o canvas montado e o contexto selecionado.

## E — Phase UX

| Situações autoritativas | Fase visual |
|---|---|
| SEM_RASTREABILIDADE / PLANEJADO | Planejamento |
| EM_DESENVOLVIMENTO / IMPLEMENTADO | Implementação |
| AGUARDANDO_VALIDACAO / EM_VALIDACAO / VALIDADO | Validação |
| COM_FALHA / EM_CORRECAO / AGUARDANDO_RETESTE | Correção |
| CONCLUIDO | Conclusão |

Trail: Planejamento → Implementação → Validação ↔ Correção → Conclusão. `✓` indica etapa anterior no percurso representado pela situação corrente; `●` é a atual (`aria-current=step`); `○` indica etapa ainda não alcançada nesse percurso. Anterior não significa 100% concluída. Não se infere um ciclo de correção em uma cadeia concluída sem Defects relevantes.

É apresentação, não um segundo histórico nem um campo persistido. Ao regredir de CONCLUIDO para AGUARDANDO_VALIDACAO, a fase atual volta à validação e a conclusão deixa de ser corrente. O histórico imutável continua sendo a autoridade sobre eventos realmente registrados.

## F — Progresso e consistência de projeções

Fórmula preservada: Tasks CONCLUIDO / Tasks atuais; arredondamento a duas casas; denominador zero = Sem dados. Testes e Defects alteram situação, não esse percentual. O mesmo mapper formata Card e Workspace; Inspector e nó raiz consomem a projeção do DTO.

Fixture local, projeto 2, após reconciliação:

| Requisito | Progresso | Situação | Fase | Evidência observada |
|---|---|---|---|---|
| REQ-4 | 25% (1/4) | EM_CORRECAO | Correção | TC-4/TC-5 FAIL; DEF-3 em correção, DEF-4 aguardando reteste |
| REQ-3 | 75% (3/4) | COM_FALHA | Correção | Um Defect aberto e outro validado; PASS e FAIL atuais |
| REQ-1 | 0% (0/1) | EM_DESENVOLVIMENTO | Implementação | Trabalho incompleto, sem qualidade prioritária |
| REQ-2 | Sem dados | SEM_RASTREABILIDADE | Planejamento | Sem Tasks ou qualidade prioritária |

Summary real: **4 requisitos, 1 em desenvolvimento, 0 em validação, 2 com defeito, 0 concluídos**. `projectionSummary` agrega a mesma policy; `withDefect` corresponde à quantidade de projeções em COM_FALHA/EM_CORRECAO/AGUARDANDO_RETESTE. REQ-4 foi observado com a mesma situação/progresso no Card, Workspace, nó raiz e Inspector; DEF-3/DEF-4 estavam presentes na cadeia. Nenhuma recomputação de domínio foi adicionada ao frontend.

## G — Layout

ELK layered RIGHT/ORTHOGONAL, seed=1, partições semânticas, ports FIXED_ORDER e alinhamento LEFTUP. Cards 280×208 mantêm tamanho ao selecionar. Task de correção ocupa a camada de correção; reteste ocupa a camada posterior. Retornos e relações de contexto não são apagados para simplificar o desenho.

O grafo grande tem extensão vertical relevante; o produto usa grupos e exploração por seleção/pan. Não aplica um fit global microscópico ao abrir ou reorganizar.

## H — Arraste

Posições são efêmeras por sessão de workspace. Seleção, Inspector e Details não reorganizam automaticamente. Expansão depois de arraste posiciona somente os novos nós; “Organizar automaticamente” redefine o layout explicitamente. Chrome: DEF-222 mudou de (2056, 8116.6) para (1939.33, 8077.71), e permaneceu nessa posição após selecionar o reteste. Testes cobrem seleção, expansão e retorno de Details.

## I — Handles / ports

Cada relação possui source/target handle próprios. Portas WEST/EAST têm ordem estável e internals atualizados. As relações mantêm identidade e sentido; após arraste manual usa-se o caminho de fallback do React Flow até nova organização explícita.

## J — Edges, leitura e zoom

Cadeia principal em linha contínua; relações de contexto discretas/tracejadas. Hover/seleção destacam a vizinhança e reduzem o ruído dos demais nós. Labels aparecem na relação focada/hover ou em vizinhanças pequenas; todas as relações permanecem textuais no Inspector e nos nomes acessíveis.

Zoom manual mínimo **0.20**, máximo **1.50**; abertura/centralização **0.90**. O mínimo manual serve à orientação geral, sem prometer leitura textual nessa escala. O Chrome confirmou o mínimo no transform do viewport e o retorno a 0.90 ao centralizar. Organização também preservou 0.90. Pan continua necessário para percorrer o grafo expandido.

## K — Inspector

Explica identidade, estado, metadados, papel e relações do artefato selecionado. Sem requests por nó: usa o DTO. A troca por uma relação foca o heading do novo Inspector. Na fixture grande foi percorrido TC-276 → EXEC-0407 FAIL → DEF-222 → EXEC-0409 PASS, com ciclo 2 explícito e reteste anterior separado. Na sessão real, REQ-4 expôs progress 25%, dois FAIL, correção e reteste consistentes.

## L — Details strategy

Task, TestCase, Execution e Defect reutilizam conteúdo canônico no mesmo diálogo; não criam pilha modal. “Voltar para o fluxo” retoma a seleção. Abertura real de TC-4 confirmou um único `[role=dialog]` e foco no retorno. Escape fecha o owner e devolve foco ao botão original do card; a ajuda contextual consome Escape antes do owner. Demais variantes de Details/async/foco são cobertas pela suíte crítica, sem invocar mutações na homologação visual.

## M — Progressive disclosure

Dados do backend permanecem completos; grupos são apresentação. Fixture de 85 entidades/123 relações: início com 22 entidades + 10 grupos; expansão com 85 entidades + 10 grupos (95 nós renderizados), identidade única. Expansão dos dez grupos foi acionada por teclado após o fix. Paginação, limites e carregamento incremental do contrato foram preservados.

## N — Performance

Fixture gerada pelo teste de persistência no schema exclusivo `traceflow_test`, exportada para preview temporário somente durante QA. DTO: 85 entidades, 123 relações, 53.650 bytes; 31 statements SQL na medição do teste. A projeção manteve 11 queries tanto para 1 quanto para 20 requisitos.

Medições observadas do ELK no Chrome (`data-layout-ms`): 250.1ms agrupado; 577.1ms na expansão; 893.9ms na organização explícita; 426.9ms em outra expansão no tema escuro. São amostras locais, não benchmark/SLA. ELK usa worker lazy no navegador; operações não dispararam requests por seleção. A build mantém aviso de chunk ELK >500kB, sem ocultá-lo ou alterar limite.

## O — Async

Preservados guards de projeto/perspectiva, resultados obsoletos e sequência de layout. Seleção não dispara layout; arraste invalida resultado pendente. Loading/error/retry, troca de projeto, paginação e saída de Details estão cobertos pelos testes focados e full. Não se adicionou reload global, timeout de domínio ou retry para mascarar falhas.

## P — Foco e acessibilidade

Revalidação após o último fix: abertura por Enter → foco no fechamento do diálogo; ajuda por botão → Escape fecha somente a ajuda, mantém owner e foco no trigger; relação do Inspector → heading do novo artefato; Details → retorno focado; fechamento → “Ver rastreabilidade”. Foco visível, semântica de fase e labels textuais inspecionados.

Encontrado no browser: o onKeyDown do canvas prevenia a ativação nativa de Enter/Espaço em botões internos. Teste reproduziu a falha; fix limita essa interceptação ao wrapper do nó, permitindo ativação nativa dos botões. O caso passou no Chrome e em 10 rodadas consecutivas. Esta verificação não é certificação WCAG completa.

## Q — Visual QA e Card UX

Inspeção renderizada no Chrome, com tamanho confirmado no DOM. Capturas foram observadas na sessão interativa; não há pacote de PNGs versionado. Matriz do workspace/grafo grande, contexto, trail e Inspector:

| Viewport | Light | Dark | Observação |
|---|---|---|---|
| 1440×1000 | PASS | PASS | Fluxo expandido, contraste, seleção e cadeias |
| 1280×900 | PASS | PASS | Inspector lateral, guia e centralização |
| 768×1024 | PASS | PASS | Margens corrigidas, Inspector lateral e pan |
| 390×844 | PASS | PASS | Tela inteira, Inspector inferior, guia rolável, nós legíveis ao centralizar |

Cobertura visual complementar, distinta da matriz do grafo:

| Superfície | Evidência renderizada |
|---|---|
| Requirement Overview/Card | Claro: 1280, 768 e 390; escuro: 1440, 1280, 768 e 390. REQ-4 em correção, REQ-3 com falha, REQ-2 sem rastreabilidade, REQ-1 com progresso zero; footer completo e sem overflow |
| Requirement aguardando reteste | Fixture sintética gerada por `projectRequirement`, 50%, 1/2 Tasks e Defect aguardando reteste; card Light/Dark em 390. Inspeção visual isolada, não criação de cenário persistido no projeto 2 |
| Defect Overview/Card | Light: 1280 e 768 (overview), 1280 e 390 (cards); Dark: 1440 e 390 (overview/cards). Estados aberto, correção, reteste, validado; severidade/responsável e ações preservados |
| TestCase Overview/Card | Light: 1440 e 390; Dark: 1440, 768 e 390. Descrição, metadados e footer da família canônica |
| Task Card como referência | Kanban real em Dark 1440: identidade/prioridade, responsável, rastreabilidade e ação de histórico; sem mudança no Kanban |
| Histórico | REQ-4 real: baseline anterior + nova transição de policy, copy específica, sem reescrita |

A comparação da família conferiu identidade no header, título destacado, badges semânticos, rows de entidade, divisores e footer. Requirement conserva os quatro blocos próprios de sua compressão de cadeia; Defect reutiliza a estrutura `sprint-card tc-card`, sem mudança de lifecycle. As três descrições usam a estrutura existente de overview; não foi criada uma regra global nova no Design System.

## R — Testes

| Execução final | Resultado |
|---|---|
| Backend focused: policy + S1-08 deletion + S1-09 integration/API | 89 PASS, 4 arquivos |
| Backend full coverage | 1.246 PASS; 5 skips preexistentes; 99 arquivos passaram e 2 já estavam skipped |
| Backend coverage S/B/F/L | 91.37% / 82.51% / 94.83% / 93.70% |
| Frontend focused final | 299 PASS, 16 arquivos |
| Frontend repeatability | 299 × 10 rodadas consecutivas, sem retry, todas exit 0 |
| Frontend full + coverage | 1.110 PASS, 90 arquivos, exit 0 |
| Frontend coverage S/B/F/L | 81.33% / 76.29% / 76.95% / 83.35% |

Comandos: backend `npm test -- test/unit/requirement-traceability.test.js test/integration/defects-s1-08.test.js test/integration/s109-traceability.test.js test/api/s109-traceability.test.js`; backend `npm run test:coverage`. Frontend focused: `npm test -- test/components/TraceabilityWorkspace.test.jsx test/components/TraceabilityLayout.test.js test/pages/TraceabilityPage.test.jsx test/defects test/testCases`; full: `npm run test:coverage`. Executados com Node 22; frontend com `NODE_OPTIONS=--no-experimental-webstorage`.

Regressões intermediárias foram investigadas: precedência (red esperado); teste S1-08 de exclusão de Task precisava conservar COM_FALHA enquanto sua execução FAIL continuava atual; expectations antigas de apresentação foram alinhadas aos novos labels; teclado de grupos teve red/green específico. Nenhum skip novo, retry ou redução de threshold foi introduzido.

## S — Gates e dependências

| Gate | Resultado |
|---|---|
| Backend/frontend lint | PASS |
| Backend/frontend format:check | PASS |
| Frontend build | PASS, aviso existente do chunk ELK registrado |
| Backend build | Não aplicável: pacote executado diretamente em Node, sem script build |
| Backend architecture:check | PASS |
| security:secrets | PASS |
| Testes do wrapper check-npm-audit | PASS |
| Audit backend/frontend | PASS, 0 high, 0 critical, nenhuma exceção utilizada |
| git diff --check | PASS |
| Manifests/lockfiles | UNCHANGED, hashes conferidos |
| Schema/migrations e estilos globais | UNCHANGED, hashes conferidos |

## T — Situation policy e impacto no backend

Decision tree final: Defect ABERTO ou FAIL corrente não tratado → COM_FALHA; senão Defect EM_CORRECAO → EM_CORRECAO; senão AGUARDANDO_RETESTE → AGUARDANDO_RETESTE; senão estágio legado incompleto; com implementação pronta, zero casos → IMPLEMENTADO, todos sem execução atual → AGUARDANDO_VALIDACAO, validação incompleta → EM_VALIDACAO; todos PASS e sem Defects pendentes → VALIDADO ou CONCLUIDO quando o Requirement já tem status terminal CONCLUIDO.

Relevância, currentVersion, imutabilidade das execuções, lifecycle de Defect/ciclos, reteste explícito, soft delete e autorização/IDOR não foram alterados. Progresso e APIs antigas conservados. A revisão da policy foi explicitamente autorizada pelas targeted corrections e substitui a restrição de não alterar engine do pedido original da Etapa 5.

Reconciliação: nova razão `TRACEABILITY_POLICY_RECONCILIATION`, `rulesVersion: 2` nas novas entradas. Histórico anterior preservado; estado e nova entrada na mesma transação. GET sem escrita. CLI mantém dry-run por padrão e escopo obrigatório. Projeto local 2: dry-run mostrou duas diferenças; apply acrescentou REQ-3 EM_DESENVOLVIMENTO → COM_FALHA e REQ-4 EM_DESENVOLVIMENTO → EM_CORRECAO; segundo apply retornou **zero mudanças**. O browser confirmou baseline de 10/09 e nova transição de 11/09 em REQ-4. Nenhuma reconciliação de produção foi executada.

## U — Documentação

Atualizados o inventário de superfícies, log de validação visual, baseline de regras e especificação de projeção/histórico. Este relatório reúne o resultado completo da Etapa 5; os registros anteriores permanecem históricos. Reutilização de overview não exige nova primitive/regra transversal.

## V — Git final e limpeza

Diff revisado por arquivo: policy/reconciliação, testes afetados, superfícies solicitadas, foco do canvas, documentação e remoção dos três previews temporários. Removidos explicitamente `frontend/s109-workspace-qa.html`, `.jsx` e `.json`, inclusive por já estarem rastreados no baseline. Nenhum `git clean`; nenhum debug/fixture de QA novo permaneceu no produto. Logs de execução ficaram fora do repositório, em diretório temporário local.

HEAD e branch preservados; sem alteração em package manifests/lockfiles, schema/migrations ou estilos globais. Working tree contém somente o diff desta rodada para revisão.

## W — Operações e encerramento

Sem commit, push, merge, rebase, reset, force-push, clean ou stash. A homologação visual foi de leitura; a única escrita funcional fora dos testes foi a reconciliação local explicitamente autorizada. Preview e abas auxiliares de QA encerrados, viewport restaurado e tema Escuro preservado ao final.

**S1-09 TRACEABILITY GRAPH WORKSPACE UX — PASS LOCAL.** A Etapa 5 está encerrada localmente. A próxima atividade depende de novo pedido para o Final Integrated QA; não foi iniciada nesta execução.

## FINAL TARGETED CORRECTIONS

**2026-09-12 — S1-09 TRACEABILITY GRAPH WORKSPACE UX — PASS LOCAL.**
Esta seção registra a rodada posterior de lifecycle, esforço e refinamentos
finais. Substitui as afirmações anteriores de conclusão manual, schema inalterado
e cobertura visual parcial; as seções anteriores permanecem como registro da
revisão de 11/09. Não inicia Etapa 6 nem o Final Integrated QA.

### Baseline e alcance

Checkout operacional `/Users/daniel/Coding/Traceflow`, branch `daniel-dev`, HEAD
`566fc1a33e2282a302e1176b96e3d12911b74ce3`. Working tree inicial limpa e
`git diff --check` inicial sem erro. Branch/HEAD preservados ao fechamento.
Alterações limitadas aos owners de lifecycle/reconciliação, esforço, DTOs
necessários ao Inspector/cards, superfícies solicitadas, testes e documentação.

### Lifecycle único, automático e reversível

Antes, calculadores por Tasks escreviam APROVADO/VALIDADO independentemente da
qualidade, e a policy exigia status terminal prévio para concluir. Isso permitia
macro APROVADO junto de situação EM_CORRECAO e conclusão circular/manual.

Agora `projectRequirement` deriva a situação da cadeia atual e
`deriveRequirementLifecycleStatus` produz o macro. Calculadores paralelos foram
removidos; `Requirement.status` continua persistido, como String (não enum Prisma),
com default PLANEJADO. As onze situações mapeiam para cinco macros conforme a
[tabela canônica](../traceability/S1_09_TRACEABILITY_RULES_BASELINE.md#autoridade-única-e-mapa-canônico).
Status macro principal: Planejado, Em implementação, Em validação, Em correção,
Concluído. Situação detalhada continua explicando a cadeia.

Implementação técnica satisfeita, casos relevantes ativos não vazios, todos PASS
na currentVersion e nenhum Defect pendente produzem CONCLUIDO sem aceite manual.
Preservadas a precedência de falhas/correção/reteste, relevância, cobertura por
passo, evidência técnica e a exigência de reteste contextual para validar Defect.
VALIDADO permanece reconhecido no histórico/mapa; aprovação completa atual vai
diretamente a CONCLUIDO. PASS de versão antiga não valida a nova.

| Nova informação após conclusão | Situação / macro sem condição de maior prioridade |
|---|---|
| Task A_FAZER ou EM_ANDAMENTO | EM_DESENVOLVIMENTO / EM_IMPLEMENTACAO |
| Novo TestCase ativo sem execução corrente | AGUARDANDO_VALIDACAO / EM_VALIDACAO |
| Nova versão sem execução | AGUARDANDO_VALIDACAO / EM_VALIDACAO |
| FAIL atual não tratado ou Defect ABERTO | COM_FALHA / EM_CORRECAO |
| Correção / espera de reteste | EM_CORRECAO ou AGUARDANDO_RETESTE / EM_CORRECAO |
| Todas as pendências satisfeitas novamente | CONCLUIDO / CONCLUIDO |

Mutação original, macro, State e histórico compartilham a transação. Os retornos
de Requirement e Task com requisito relacionado refletem o macro reconciliado.
Novas transições usam rulesVersion 3; eventos antigos não são reescritos.
Reparação apenas do macro aparece em `statusChanges`, sem inventar transição em
`changes`. GET não grava. Endpoints legados de status/confirm-completion mantêm
autorização/validação e rejeitam com `409 REQUIREMENT_STATUS_DERIVED`; a ação de
conclusão foi retirada da UI e status não é aceito no CRUD manual.

### Auditoria APROVADO e dependências de status

| Uso | Categoria | Ação |
|---|---|---|
| calculateRequirementStatus e recálculos em Task/Requirement/Defect | A — lifecycle operacional antigo | Removidos; reconciliação pela policy única |
| Exigência de status terminal na situation | A — lifecycle operacional antigo | Removida; conclusão pelos fatos atuais |
| Botão Confirmar conclusão / handler RequirementsScreen | A — lifecycle operacional antigo | Removidos |
| Aprovação independente da especificação | B — aprovação real | Nenhum fluxo independente identificado; não se presume que APROVADO antigo provava aceite |
| TestCaseList, TestExecutionWizard, Parts, TaskQuality: label Aprovado para PASS | Semântica de resultado de teste, fora do lifecycle de Requirement | Preservada |
| requirement.validation / traceability.validation: tokens legados | C — compatibilidade API | Reconhecidos; endpoint manual bloqueado e filtro antigo sem remapeamento implícito |
| RequirementsScreen e kanban-display: labels legados | C — compatibilidade de leitura | Fallback preservado; rastreabilidade principal apresenta somente os cinco macros |
| Migrations aplicadas, registros anteriores, relatórios históricos e fixtures legadas | C — compatibilidade histórica | Preservados; nenhum rewrite destrutivo |
| requirements.api.confirmRequirementCompletion e reexport sem caller na UI | D — helper legado sem fluxo operacional | Mantido como ponte compatível; servidor rejeita escrita manual |
| recalculateRequirementStatus do service | Ponte legada | Delega ao repository canônico; não calcula outro lifecycle |

Status participa de DTOs/CRUD/relatórios e filtros. O filtro de rastreabilidade
opera sobre a projeção completa antes da paginação; agora Status é principal e
Situação detalhada fica em Detalhamento opcional. Autorização continua baseada
em membership/papel e contexto, sem converter macro em permissão. Clientes
externos não foram executados; a mudança de escrita manual para 409 está no
[contrato de API](../api/API_CONTRACTS.md).

### Esforço persistido e auditável

`TaskEffortHistoryEntry` registra CREATED, UPDATED e DELETED independentemente de
TIMER/MANUAL. Identifica projeto, Task, sessão, ator autenticado, horário servidor,
duração anterior/nova e início/fim físicos. Manual e encerramento de timer geram
CREATED; iniciar timer ainda não é esforço realizado. Ajuste mantém os timestamps
físicos e registra a duração nova explicitamente. No-op não gera evento.

`PATCH /tasks/:id/time-entries/:entryId` exige horas e expectedUpdatedAt. Lock
Project → Task, releitura, versão otimista monotônica, escrita da sessão, total
e histórico na mesma transação. Concorrência retorna um sucesso e um conflito;
falha injetada no append desfaz toda a mudança. Permissões continuam autor
MEMBER+ ou moderação MANAGER/OWNER. SSE de edição é publicado após commit.

Excluir retira a duração do total atual, preservando DELETED e todos os eventos
anteriores. Sem FK à sessão/Task removível; retenção acompanha Project, e remoção
do ator neutraliza a FK. Não há endpoint para editar eventos. GET de Task
inexistente permanece 404, mesmo com histórico armazenado.

`GET /tasks/:id/time-entries/history` pagina no banco e combina data UTC do evento,
origem e evento. DTO expõe snapshot e currentEntry separado, com autorização
atual. Dialog inicia em Histórico de eventos e oferece Sessões atuais pelo GET
antigo, inclusive sessões anteriores à adoção. Datas desta segunda visão filtram
encerramento; Evento fica desabilitado. Sem backfill de eventos inventados.
Detalhes: [histórico de esforço](../data/TASK_EFFORT_HISTORY.md).

### Migration e adoção local

Migration nova `20260912010000_s109_lifecycle_effort_history`: tabela/índices/FKs de
histórico e default PLANEJADO. Nenhuma migration aplicada foi editada.
`validate-s109-lifecycle-migration.js` validou cadeia completa vazia e upgrade
populado com APROVADO legado, Task e sessão manual. Comparação antes/depois
preservou os registros integralmente; histórico iniciou vazio e status ficou
atualizado. Somente os dois schemas descartáveis criados pelo validador foram
removidos no cleanup. Nenhum reset/truncate de banco existente.

Ambiente conferido: NODE_ENV development, MySQL local `traceflow`; teste local
separado `traceflow_test`. Após conferir o fluxo normal de desenvolvimento,
`prisma migrate deploy` aplicou a migration local. `migrate status`: 55 migrations,
up to date no desenvolvimento e no teste. Nenhuma alteração em produção.

Reconciliação dos 12 projetos locais: projeto 2 tinha quatro reparações de macro,
zero transições detalhadas; demais projetos sem requisitos a reconciliar.
REQ-4/REQ-3 passaram de EM_IMPLEMENTACAO a EM_CORRECAO; REQ-2 de CADASTRADO a
PLANEJADO; REQ-1 de APROVADO a EM_IMPLEMENTACAO. Histórico anterior comparado e
preservado. Segundo apply: zero statusChanges e zero changes em todos os projetos.

### Navegação, cards e Inspector

Ordem final: Visão geral → Requisitos → Sprints → Marcos → Cronograma → Tarefas →
Kanban → Casos de teste → Defeitos → Repositório → Rastreabilidade. URLs mantidas.
Barra com overflow-x auto/overflow-y hidden, altura mínima e indicador interno;
ResizeObserver revela a aba ativa alterando somente scrollLeft. Foco/teclado e
aria-current preservados. Correção local evita colapso da barra no layout legado.

Overviews usam descrição curta como irmão do bloco de título, família Kanban.
Defect conserva shell TestCase, badges/permissões/footer e acrescenta trail
Detecção → Correção → Reteste → Validado, seção Rastreabilidade e Correção/Reteste
dinâmico. Latest retest vem do backend em batch, sem consulta por card ou PASS
presumido. A comparação com Task/TestCase verificou header, metadata, divisores,
geometria, seções e ações.

Inspector organiza identidade, badges, Informações, Rastreabilidade, Relações e
ação final. Task exibe estimado/realizado/% pelos mesmos helpers canônicos:
5h/7h = 140%/Tempo estourado; sem estimativa não há percentual e zero é 0h.
PR mostra branches/datas reais; Commit/Issue preservam informação disponível e
relações. GitHub reutiliza GithubExternalAction sem underline, inclusive suas
regras canônicas de estados de link. Nenhuma dependência ou CSS global novo.

### Matriz visual real

Chrome/macOS, sessão autenticada no projeto local 2; larguras verificadas no DOM.
Cada célula refere-se à inspeção renderizada, não inferida de testes DOM.

| Superfície | L1440 | D1440 | L1280 | D1280 | L768 | D768 | L390 | D390 |
|---|---|---|---|---|---|---|---|---|
| Project Tabs | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| TestCases Overview | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Defects Overview | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Traceability Overview | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Traceability filters / Requirement Cards | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Defect ABERTO | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Defect EM_CORRECAO | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Defect AGUARDANDO_RETESTE | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Defect VALIDADO | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Traceability Workspace / Task Inspector | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| PR Inspector | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Effort History dialog integrado | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Effort History com CREATED/UPDATED/DELETED persistidos em teste | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |

Dados reais: REQ-4 Em correção/25%, REQ-3 Com falha/75%, REQ-2 Sem rastreabilidade,
REQ-1 Em desenvolvimento/0%. DEF-4 aguardando reteste, DEF-3 em correção, DEF-2
aberto, DEF-1 validado com PASS real EXEC-5/ciclo 2. Task Card de referência foi
comparado no Kanban Light/Dark desktop; não se atribui ao Kanban uma nova matriz
completa independente.

Task 16 inicialmente mostrou 5h/7h/140%; depois, os dados atualizados da sessão
mostraram exclusão de 3h, sessão atual de 4h e total 4h/5h/80% coerente entre
Task Details, Kanban e Inspector. A exclusão já estava persistida ao ser lida;
não foi ação executada nesta homologação. Histórico integrado exibiu ator/data e
DELETED, com Manual + Excluído aplicado. Preview separado usou DTOs retornados
pelos testes de persistência 3h → 4h → exclusão, sem simular consulta integrada.

Mobile manteve seções e footer acessíveis por scroll interno/teclado. DOM final
confirmou aba ativa visível, sem overflow horizontal da página nem vertical das
tabs nas quatro larguras. Foco em relações e link GitHub sem underline computado
foram observados; pseudo-estados usam CSS canônico, sem alegar navegação externa
ou teste manual individual de todos eles. Datas combinadas, sem estimativa/zero,
IDOR, permissões e concorrência têm evidência automatizada. Capturas foram
observadas na execução, sem pacote PNG versionado. Não certifica dispositivos
físicos/WCAG integral nem substitui QA integrado final/CI remoto.

### Regressões e gates finais

Red inicial reproduziu quatro falhas da policy e PATCH de esforço inexistente
(404). Regressões passaram após corrigir os owners canônicos. Testes cobrem mapa
11→5, conclusão/reabertura/retorno, versão antiga, FAIL/Defect, reparação de macro,
imutabilidade e rollback; esforço manual/timer, filtros combinados, ator, edição,
exclusão, autorização, conflito e total atual. Query-count e limites de grafo
permaneceram verdes. A espera de foco no teste frontend acompanha o foco real do
dialog, sem sleep, retry ou aumento de timeout. Nenhum skip novo.

| Gate final | Resultado |
|---|---|
| Backend focused policy/calculators/API/integration | 134 PASS, 6 arquivos; effort API final 11 PASS |
| Backend unit | 757 PASS, 65 arquivos |
| Backend integration/API | 508 PASS, 34 arquivos; 5 skips legados em 2 arquivos |
| Backend full coverage ×3 consecutivas | 1.265 PASS por rodada, 99 arquivos; mesmos 5 skips legados |
| Backend coverage S/B/F/L, nas três rodadas | 91.40% / 82.66% / 94.79% / 93.67% |
| Frontend focused ×10 consecutivas | 328 PASS, 20 arquivos por rodada; todas exit 0 |
| Frontend full | 1.121 PASS, 91 arquivos |
| Frontend coverage | 1.121 PASS; S/B/F/L 81.43% / 76.60% / 77.12% / 83.55% |
| Backend/frontend lint e format:check | PASS |
| Frontend build | PASS; aviso existente de chunk ELK maior que 500kB, 1.433,73kB |
| Backend architecture:check / security:secrets | PASS |
| Prisma validate / generate | PASS |
| Migration vazia / upgrade populado / status | PASS |
| Testes do wrapper npm-audit | 5 PASS |
| Audit real backend/frontend | PASS, zero high/critical e zero exceções utilizadas |
| Manifests/lockfiles/supply chain | Sem alterações ou dependências novas |
| git diff --check | PASS |

Node 22; frontend com `NODE_OPTIONS=--no-experimental-webstorage`. Backend:
`npm run test:unit`, `npm run test:integration`, `npm run test:coverage` (três vezes).
Frontend `npm test`, `npm run test:coverage`, lint/format/build. Focused repetido:

```bash
npm test -- test/components/S109FinalCorrections.test.jsx test/components/TraceabilityWorkspace.test.jsx test/components/TraceabilityLayout.test.js test/pages/TraceabilityPage.test.jsx test/components/TaskEffortTracker.test.jsx test/features/useTaskEffort.test.jsx test/defects test/testCases test/pages/RequirementsPage.test.jsx
```

Audit: `node --test scripts/check-npm-audit.test.mjs` e wrapper real
`node scripts/check-npm-audit.mjs <backend|frontend> docs/security/npm-audit-exceptions.json`.
Logs locais fora do repositório em `/private/tmp/traceflow-s109-lifecycle/`:
`final-backend-*` e `closure-frontend-*` identificam as rodadas finais; logs red e
intermediários não substituem os resultados da tabela.

### Documentação, limpeza e encerramento

Depois dos gates funcionais: baseline/regras, contratos, especificações de
histórico, Design System, inventário de superfícies e log visual atualizados.
Diff completo revisado, incluindo arquivos novos e testes. Sem código fora do
escopo, migration antiga editada, dependência acidental, debug ou lifecycle
duplicado. Arquivos `frontend/s109-effort-qa.html`, `.jsx` e `.json` criados para
esta QA removidos explicitamente; abas auxiliares fechadas, viewport restaurado,
tema Escuro e aba principal preservados. Logs de evidência temporários ficaram
fora do produto. Fixtures permanentes de regressão permanecem nos testes.

Sem commit, push, merge, rebase, reset, force-push, clean ou stash. Migração e
reconciliação ocorreram somente no desenvolvimento local conferido; navegação
visual foi de leitura. Nenhuma conclusão sobre CI remoto ou produção.

**S1-09 TRACEABILITY GRAPH WORKSPACE UX — PASS LOCAL.** Trabalho encerrado nesta
rodada. Final Integrated QA não iniciado.
