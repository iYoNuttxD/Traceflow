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
