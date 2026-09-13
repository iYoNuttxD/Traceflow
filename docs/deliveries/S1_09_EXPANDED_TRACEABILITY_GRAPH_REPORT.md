# TRACEFLOW S1-09 — EXPANDED TRACEABILITY GRAPH REPORT

Date: 2026-09-10 (America/Sao_Paulo)  
Branch: `daniel-dev`  
HEAD: `44e479e86dceb485fd30e3a2661a10477c128e7b`  
Node: `22.23.2`  
Browser: Google Chrome `152.0.7977.84`, macOS, sessão local autenticada  
Database tests: MySQL `9.7.1`, schema exclusivo descartável

**S1-09 EXPANDED TRACEABILITY GRAPH — PASS LOCAL**

A Etapa 4 amplia exclusivamente o fluxo de rastreabilidade e seu read model. Os oito tipos reais,
as relações de qualidade, a expansão progressiva e os Details existentes estão integrados.
O veredito é local; não representa CI remoto, QA integrado do S1-09 ou validação em produção.

## A — Baseline

Antes das edições: `git status --short` vazio, branch `daniel-dev`, HEAD acima e
`git diff --check` sem erros. Não havia alterações preexistentes a conciliar.
Checkout: `/Users/daniel/Coding/Traceflow`. Foram registrados hashes de 64 arquivos protegidos,
incluindo engine, reconciliação, schema/migrations, tokens e componentes da Etapa 3.
A comparação final identificou **zero alterações** nesses arquivos.

## B — Legacy Graph

A auditoria inicial encontrou cinco tipos: Requirement, Task, Pull Request, Commit e Issue.
IDs: `requirement:N`, `task:N`, `pull-request:N`, `commit:N`, `issue:N`.
Edges: `TYPE:source:target`, com `REQUIREMENT_TASK`, `TASK_PULL_REQUEST`, `TASK_COMMIT`, `TASK_ISSUE`.
O layout anterior usava três níveis, espaçamento vertical fixo de 410 e horizontal de 460;
a expansão de metadata ficava em `expanded[]`, reiniciada ao trocar perspectiva. A seleção
vinha de TraceabilityScreen e o endpoint de Requirement paginava Tasks, com cortes internos de
links por tarefa. A adaptação atual mantém os IDs/relações e a alternância de informações,
substituindo apenas layout/apresentação e optando explicitamente pelo novo DTO.

Os endpoints/perspectivas legados continuam disponíveis. O endpoint sem `expanded=true` preserva
seu comportamento. Task→PR, Task→Commit e Task→Issue continuam vínculos reais, sem inferência por
mensagem, branch ou título. Links externos permanecem ações explícitas.

## C — New Graph Model

O backend oferece `expanded=true` no GET de rastreabilidade de Requirement. A projeção usa relações
já persistidas, não cria domínio de grafo e não modifica situação, status, progresso ou histórico.

Tipos reais: `REQUIREMENT`, `TASK`, `PULL_REQUEST`, `COMMIT`, `ISSUE`, `TEST_CASE`,
`TEST_EXECUTION`, `DEFECT`. Relações semânticas estão na seção I.
Grupos `GROUP` são exclusivamente elementos visuais para coleções de Tasks, PRs, Commits, Issues,
TestCases, Defects e execuções históricas. Sua conexão `COLLECTION` tem `presentation: true` e
não conta como relação de domínio. O summary vem integralmente da projeção da Etapa 2.

## D — Node Identity

Maps por ID deduplicam nodes e edges no mapper e na acumulação de páginas. A chave mantém tipo e
ID real; o hash abreviado de Commit é apenas label. Novos prefixos: `testCase:N`, `execution:N`,
`defect:N`. Correction Task mantém `task:N`; reteste mantém `execution:N`.
Edges de correção/reteste incluem o ciclo para preservar múltiplos ciclos entre as mesmas entidades.
O fixture com Task compartilhada e TestCase direto/via Task confirma uma entidade e múltiplos vínculos.

## E — TestCase

Card compacto: tipo, TC-ID, título, status canônico e resultado da última execução da versão atual.
Sem execução da versão atual, apresenta Nunca executado; PASS antigo não vira validação atual.
Expandido: responsável, versão, Requirement direto, Tasks (lista compacta com total excedente),
última execução atual, quantidade de execuções e defeitos. O botão abre o TestCase Details existente.

O backend emite Req→TC somente para vínculo direto e Task→TC somente para o join real. Execuções
antigas ficam em grupo; a atual e as necessárias à detecção/reteste permanecem visíveis.
TestCase excluído não reaparece como entidade atual. Execuções históricas exigidas por Defect
continuam com TC-ID/versão imutáveis, sem fabricar um node atual para o caso excluído.

## F — Execution

EXEC-ID, resultado textual PASS/FAIL/BLOCKED, ambiente e TC/versão identificam a execução.
O contexto `RETESTE · DEF-N` vem de DefectRetest, sem novo tipo de entidade.
Metadata: executor, data, ambiente, caso/versão, referência testada, contagem de passos por resultado
e evidências. O conteúdo é limitado com rolagem interna; o botão Abrir execução permanece acessível.
A inspeção completa reutiliza os Details de execução e o visualizador de evidências existentes.

## G — Defect

Card com DEF-ID, título, severity/status via `DefectBadge`. Metadata mostra responsável, execução
de detecção e Passo N, ciclo atual, total de Tasks de correção do ciclo e último resultado de reteste.
A contagem não é derivada da lista compacta de links. Detecção, origem, correção e retestes são
edges explícitas; múltiplos defeitos/ciclos preservam sua proveniência. Reteste FAIL/BLOCKED nunca
recebe label “validado por”. O Details reutilizado permite inspecionar o histórico canônico.

## H — Correction Task

Same Task entity: **YES**. Duplicate node: **NO**.
O mesmo card de Task usa o marker canônico de bug + CORREÇÃO, já presente no Kanban. Não há code
icon nem entidade CorrectionTask. Tasks de origem sem CORRECTION não recebem o marker. Ciclos
anteriores continuam disponíveis nas relações e no Details; não são removidos da cadeia.

## I — Edge Semantics

| From | Relation | To |
|---|---|---|
| Requirement | IMPLEMENTA | Task vinculada |
| Requirement direto / Task vinculada | VERIFICADO_POR | TestCase |
| Task | IMPLEMENTADO_EM | Pull Request / Commit |
| Task | RELACIONADO_A | Issue |
| TestCase | EXECUTADO_EM | TestExecution |
| TestExecution | DETECTOU · Passo N | Defect |
| Defect | ORIGINADO_EM | Origin Task |
| Defect | CORRIGIDO_POR · Ciclo N | Correction Task |
| Defect | RETESTADO_POR · Ciclo N | TestExecution |
| Requirement direto | AFETADO_POR | Defect |

O backend é owner da semântica. O cliente adapta IDs/labels e só desenha edges cujos dois endpoints
estão visíveis. Labels de relações adjacentes aparecem ao expandir metadata; nomes acessíveis
preservam origem, relação, destino, passo e ciclo. Loops legítimos não duplicam nodes.

## J — Progressive Disclosure

Thresholds centralizados em `model/graph.js`:

| Coleção | Agrupa quando |
|---|---|
| Task | > 8 |
| Commit | > 5 |
| Issue | > 3 |
| Pull Request | > 3 |
| TestCase | > 8 |
| Defect | > 5 |
| Execuções não essenciais | > 0 |

A detecção, a última execução da versão atual e o último reteste necessário ficam fora do grupo
histórico. Execuções agrupam pelo TestCase realmente conectado; demais coleções agrupam no
Requirement selecionado para evitar duplicar artefatos compartilhados. O owner é mostrado por ID.

Metadata compacta é carregada por página; abrir/recolher um grupo já carregado é local, sem HTTP.
`Carregar mais relações` busca a próxima página consolidada. Grupos contam a coleção já carregada;
o botão de paginação permanece enquanto houver páginas. Não há corte silencioso permanente.
Clique no card alterna informações; o botão do grupo alterna coleção. `Recolher tudo` cancela append,
restaura a primeira página, fecha metadata/grupos e volta à posição inicial. Nenhuma expansão grava dados.

## K — Layout

Layout determinístico por bandas: Requirement; Tasks; artefatos técnicos; TestCases; execuções;
Defects; Tasks de correção; retestes. Ordenação por ID e desempate estável; até três cards por linha,
largura de 288 unidades, passo horizontal de 388. Linhas expandidas reservam altura adicional.
Não há coordenadas por fixture. Arestas longas/de retorno contornam os cards por faixas laterais.

O zoom inicial/foco é 0,85; metadata usa a tipografia/tokens existentes. Pan permanece dentro do
canvas. `Centralizar fluxo` inclui todos os nodes visíveis; o zoom mínimo de 0,02 permite enquadrar
as 85 entidades, servindo como visão geral. A leitura individual usa pan, zoom ou foco por teclado,
que recentraliza o card em escala legível. Controles de 44px ficam horizontais para não cobrir o
footer expandido em 390px. Não foi reduzida progressivamente a tipografia para esconder problemas.

## L — Performance

Fixture persistido exclusivamente no schema de teste:
1 Requirement, 12 Tasks (4 de correção), 5 PRs, 20 Commits, 4 Issues, 6 TestCases,
32 TestExecutions (incluindo 8 execuções de reteste históricas) e 5 Defects.

| Medida | Resultado |
|---|---|
| Entidades únicas no DTO | 85 |
| Relações semânticas | 123 |
| Default renderizado | 22 entidades + 10 grupos; 30 edges semânticas visíveis |
| Expansão total | 85 entidades + 10 grupos = 95 cards DOM |
| Duplicações / sobreposições entre cards | 0 / 0 na inspeção do fixture |
| HTTP para carregar o grafo deste fixture | 1; nenhum request por node |
| HTTP para expandir grupos carregados | 0 |
| SQL observado na projeção | 31 comandos, conjunto fixo de consultas por coleção |
| DTO completo medido no teste final | 53.133 bytes |
| Paginação exercitada | 20 nodes / até 80 edges por página, até completar a cadeia |

O repositório seleciona metadata compacta e agrega Steps por resultado; não carrega conteúdo de
Steps, blobs, comentários ou histórico inteiro para desenhar o grafo. O DTO é limitado por página:
até 100 nodes e 400 edges no cliente atual. Consultas são em lote, sem N+1.

**Limites:** o número de consultas e a resposta são limitados; o número de linhas intermediárias
e o trabalho de montagem em memória crescem com a cadeia completa do Requirement. Cada nova página
reconsulta a projeção; páginas não compartilham snapshot de revisão. O cenário representativo passou,
mas isto não é benchmark de requisitos com milhares de entidades nem garantia de memória constante.
A expansão total é deliberada e requer navegação; fit de um grafo muito grande é visão geral.

## M — Async

A seleção de Requirement preserva o controle de concorrência existente na página. O canvas reinicia
por chave project/perspective. Append usa token de escopo e AbortController; respostas após troca
ou `Recolher tudo` são ignoradas, inclusive quando o transporte resolve após cancelamento.
Uma nova carga pode completar depois do cancelamento anterior. Falha de append mantém o grafo
carregado e oferece retry contextual. Grupos carregados não fazem requests e permanecem recolhidos
quando apenas a resposta de outra página chega. Details usam o mesmo isolamento por entidade/projeto.

## N — Details Reuse

| Ação do grafo | Componente existente reutilizado |
|---|---|
| Abrir tarefa | TaskDetailsPanel |
| Abrir caso de teste | TestCaseDialogContent / TestCaseDetails |
| Abrir execução | TestCaseDialogContent / Execution Details |
| Abrir defeito | DefectFlow / Defect Details |

Barrels públicos expõem apenas as primitives necessárias. O host do grafo resolve carregamento,
erro, escopo, portal e retorno de foco; não replica o conteúdo dos Details. Os quatro fluxos foram
abertos na sessão real local, com dados atuais, e fechados preservando Requirement/metadata do grafo.
Nenhuma edição ou comentário foi enviado na homologação. Links de evidências usam o viewer existente.

## O — Visual Matrix

Inspeção real no Chrome por capturas do canvas/cards e medidas DOM, com larguras efetivamente
confirmadas. Rota principal: `/projects/2/traceability`, dados locais existentes; nenhum dado de
desenvolvimento foi criado/alterado nesta homologação. REQ-2 exercitou vazio; REQ-1, Task/PR/Commit;
REQ-3, testes PASS/FAIL, detecção, DEF-1 validado, DEF-2 aberto, TASK-12 de correção, reteste PASS e
histórico BLOCKED/FAIL. O fixture grande foi renderizado pelo componente real em preview temporário
explicitamente identificado como artificial, alimentado pelo DTO gerado no teste de persistência.

| Cenário | Light 1440 | Dark 1440 | Light 1280 | Dark 1280 | Light 768 | Dark 768 | Light 390 | Dark 390 |
|---|---|---|---|---|---|---|---|---|
| Requirement sem relações | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Legacy Task / PR | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| TestCase PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| TestCase FAIL / detecção / Defect | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Correction Task | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Retest PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Large grouped (fixture isolado) | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Metadata expandida | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Grupo expandido | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |

As capturas foram inspecionadas durante a execução interativa; não há pacote PNG versionado.
A matriz não é certificação WCAG completa nem execução de todos os Details em cada viewport.
Os oito tipos foram inspecionados; Commit real e Issue do fixture também tiveram metadata aberta.
Em 390px, o card em foco cabe no canvas, os controles não cobrem seu footer e não há overflow
horizontal da página. Outros nodes podem ficar fora do recorte e são alcançados por pan/foco.
No fixture totalmente expandido, o DOM confirmou 85 IDs reais únicos, 95 cards sem sobreposição;
fit incluiu todos os cards após ajuste do limite de zoom. Teclado, nomes, aria-expanded, foco visível,
resultados textuais e retorno dos Details foram verificados. Não houve operação externa no GitHub.

## P — Tests

Frontend, após as últimas correções:

- Focados: `ExpandedTraceabilityFlow`, `TraceabilityFlow`, `TraceabilityPage`: **64 PASS**.
- Repetibilidade: **64 × 10 rodadas consecutivas, sem retry, todas PASS**.
- Full: **83 arquivos, 1.035 PASS**, sem skips novos.
- Coverage: **80,78% statements / 75,64% branches / 76,47% functions / 82,78% lines**, gates PASS.

Cobertura focada: identidade global, ciclos e semântica, via Task sem vínculo direto fictício,
grupo histórico e fallback de caso excluído, expand/collapse/reset, paginação, erro contextual,
resposta tardia, troca de Requirement, Details e preservação de contexto, marker correto e contagens
reais com metadata compactada. Os testes de host usam mock do dialog; a integração dos quatro
Details reais foi complementada pela inspeção no navegador, não atribuída ao mock.

Backend, exclusivamente no schema descartável:

- Focados de projeção/autorização/integração: **3 arquivos, 59 PASS**.
- Unit: **61 arquivos, 712 PASS**.
- Integration/API: **33 arquivos PASS, 490 testes PASS**; 2 arquivos/5 testes com skips preexistentes.
- Coverage full: **94 arquivos PASS, 1.202 testes PASS**, mesmos 5 skips preexistentes.
- Coverage: **91,23% statements / 81,85% branches / 94,66% functions / 93,56% lines**, gates PASS.

Nenhum skip S1-09 novo. VIEWER/MEMBER/MANAGER/OWNER, isolamento de projeto, 401/404, query inválida,
compatibilidade legada, execução histórica, versão atual, dedup, relações múltiplas, paginação e
número de queries foram exercitados. GET não gravou histórico. Uma asserção textual ambígua passou
a selecionar o botão do Requirement após os grupos ganharem o ID do owner; as dez rodadas finais
foram realizadas depois desse ajuste, sem repetir automaticamente testes falhos.

## Q — Gates

| Gate | Resultado |
|---|---|
| Frontend focused | PASS — 64 |
| Frontend 10x | PASS — 640 execuções |
| Frontend full | PASS — 1.035 |
| Frontend coverage | PASS |
| Frontend lint | PASS |
| Frontend format:check | PASS |
| Frontend build | PASS |
| Backend affected | PASS — 59 focados; full/coverage descritos acima |
| Backend lint / format:check / architecture:check | PASS |
| git diff --check | PASS |

Runtime frontend: Node 22.23.2 e `NODE_OPTIONS=--no-experimental-webstorage`. Comandos executados:
`npx vitest run` (três arquivos focados), `npm test`, `npm run test:coverage`, `npm run lint`,
`npm run format:check`, `npm run build`. Backend: `npx vitest run` focado, `npm run test:unit`,
`npm run test:integration`, `npm run test:coverage`, lint, format e architecture.
Logs locais de execução: `/private/tmp/traceflow-s109e4/`; são evidência temporária, não artefatos de CI.

## R — Situation Engine

Changed: **NO**. Onze situações, progresso, evidências, agregados, status e histórico mantêm a
implementação da Etapa 2. O grafo consome a projeção, sem recalcular sua autoridade no frontend.
Os arquivos protegidos foram comparados por SHA-256. Visão geral, filtros, Requirement Cards e
histórico da Etapa 3 também permaneceram byte a byte preservados.

## S — Schema/Migration

Schema: **UNCHANGED**. New migration: **NONE**.
As migrations existentes foram aplicadas somente ao schema exclusivo
`traceflow_test_s109_1789085298605`, validado como distinto do banco de desenvolvimento antes das
importações Prisma/testes. Esse schema foi removido ao encerrar. Nenhuma migration/schema de
produção ou desenvolvimento foi modificada; nenhum reset foi executado.

## T — Documentation

- `docs/deliveries/S1_09_EXPANDED_TRACEABILITY_GRAPH_REPORT.md` — este relatório.
- `docs/api/API_CONTRACTS.md` — opt-in, DTO, relações, paginação e limites.
- `docs/architecture/SYSTEM_ARCHITECTURE.md` — read projection e fronteiras das features.
- `docs/traceability/S1_09_TRACEABILITY_RULES_BASELINE.md` — registro de implementação, sem alterar engine.
- `docs/design/UI_SURFACE_INVENTORY.md` — apenas atualização da surface do canvas.
- `docs/design/validation/VISUAL_VALIDATION_LOG.md` — validação observada e distinção do fixture isolado.

## U — Git final

Branch e HEAD permanecem os do baseline. `git status --short`, `git diff --check` e
`git rev-parse HEAD` foram executados no encerramento. Working tree contém somente as alterações
locais desta etapa listadas abaixo; nenhum arquivo foi staged. Os três arquivos do preview temporário
foram removidos, a aba de preview foi fechada e a preferência Sistema/tamanho original do Chrome
foram restaurados. O banco descartável foi removido.

```text
 M backend/src/modules/traceability/traceability.routes.js
 M backend/src/modules/traceability/traceability.service.js
 M backend/src/modules/traceability/traceability.validation.js
 M backend/test/api/s109-traceability.test.js
 M backend/test/integration/s109-traceability.test.js
 M docs/api/API_CONTRACTS.md
 M docs/architecture/SYSTEM_ARCHITECTURE.md
 M docs/design/UI_SURFACE_INVENTORY.md
 M docs/design/validation/VISUAL_VALIDATION_LOG.md
 M docs/traceability/S1_09_TRACEABILITY_RULES_BASELINE.md
 M frontend/src/features/tasks/index.js
 M frontend/src/features/testCases/index.js
 M frontend/src/features/traceability/components/TraceabilityFlow.css
 M frontend/src/features/traceability/components/TraceabilityFlow.jsx
 M frontend/src/features/traceability/pages/TraceabilityScreen.jsx
 M frontend/test/pages/TraceabilityPage.test.jsx
 M frontend/test/styles/dark-legacy-compatibility.test.js
?? backend/src/modules/traceability/expanded-graph.mapper.js
?? backend/src/modules/traceability/expanded-graph.repository.js
?? docs/deliveries/S1_09_EXPANDED_TRACEABILITY_GRAPH_REPORT.md
?? frontend/src/features/traceability/components/GraphEdge.jsx
?? frontend/src/features/traceability/components/GraphEntityDetails.jsx
?? frontend/src/features/traceability/components/GraphNode.jsx
?? frontend/src/features/traceability/model/graph.js
?? frontend/test/components/ExpandedTraceabilityFlow.test.jsx
```

## V — Operations

NO COMMIT. NO PUSH. NO MERGE. NO REBASE. NO RESET. NO FORCE-PUSH. NO CLEAN. NO STASH.
Não houve alteração em produção, schema de desenvolvimento, dados reais da homologação ou tokens.
Não foram iniciados Etapa 5, outra feature ou S1-09 Final Integrated QA.

**S1-09 EXPANDED TRACEABILITY GRAPH — PASS LOCAL**
