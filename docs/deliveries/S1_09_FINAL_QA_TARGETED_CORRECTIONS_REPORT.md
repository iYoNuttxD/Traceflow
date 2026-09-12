# TRACEFLOW S1-09 — FINAL QA TARGETED CORRECTIONS REPORT

Date: 2026-09-12  
Branch: `daniel-dev`  
HEAD: `bdc850d7a9e55e45cb0073e4a7338cd38a60c39e`  
Resultado: **S1-09 FINAL QA TARGETED CORRECTIONS — PASS LOCAL**

## A — Baseline

Working tree inicialmente limpo; `git status --short` e `git diff --stat` vazios,
`git diff --check` aprovado. Implementação no checkout operacional
`/Users/daniel/Coding/Traceflow`. Node 22.23.2; frontend com
`NODE_OPTIONS=--no-experimental-webstorage`.

O Final QA original informado para esta rodada permanece **CHANGES REQUIRED**:
0 BLOCKING, 3 IMPORTANT, 1 SUGGESTION. Seu relatório não foi alterado. Este
relatório comprova correções locais e não substitui novo QA/Code Review independente
nem declara aprovação da CI do working tree.

## B — Finding IMPORTANT 01: esforço stale no Inspector

Causa: `GraphEntityDetails.TaskInspection.onSaved` atualizava somente a Task do
Details. O Canvas/Inspector continuava consumindo o nó da projeção inicial.

Correção em `GraphEntityDetails.jsx` e `TraceabilityFlow.jsx`: propagar o esforço
confirmado ao owner do workspace, por ID da Task, e aplicá-lo aos nós exibidos e ao
contrato de leitura do Inspector. Apenas `actualEffort` e `runningTimer` são
atualizados a partir do retorno canônico do Details. Coleção/layout continuam
independentes desse conteúdo: nenhuma chamada ao ELK, reorganização, nova seleção,
centralização ou remount é necessária para confirmar esforço. O resumo de
implementação do Requirement não depende de esforço, portanto não é recalculado.

Regressão em `TraceabilityWorkspace.test.jsx`: GraphEntityDetails,
TaskDetailsPanel, TaskEffortTracker e useTaskEffort reais; somente transporte,
React Flow/ELK e painéis não relacionados são simulados. Antes da correção,
ambas as variantes falharam ao procurar `7h` no Inspector, embora Details já
mostrasse `7h de 5h estimadas`. Depois, confirmam `7h`, `140%`, o dado do nó,
posição manual, grupo de commits expandido e ausência de novas chamadas de
layout/viewport. O mock do React Flow mantém a identidade estável da instância,
como a implementação real, para verificar essas contagens.

Concorrência: após salvar A, selecionar B e concluir uma leitura antiga do grafo,
B continua selecionada com seu próprio esforço; A mantém o dado confirmado,
inclusive após recolher tudo. Uma resposta 503 da paginação conserva o esforço
salvo e apresenta o erro de leitura separadamente. Não há refetch pós-mutation
obrigatório, retry automático ou erro falso de persistência. A chave existente
Project/Requirement delimita a vida do workspace; guards existentes do Details e
do hook de esforço continuam descartando respostas de contextos encerrados.

### Homologação renderizada

Chrome autenticado, aplicação/API locais reais:

- Task 18, fixture sintética aditiva no Project 2 / REQ-4: estimativa 5h,
  realizado inicial 4h; lançamento manual de 3h pela UI; Details **7h/140%**;
  retorno ao Inspector **7h/140%**, mesmo REQ-4 e TASK-18 selecionados.
- Nó arrastado manualmente antes da mutation: `translate(450.889px, 1145px)`.
  Todas as posições permaneceram iguais após voltar.
- Viewport antes/depois idêntico:
  `translate(259.667px, -625.75px) scale(0.75)`; zoom escolhido de 75% preservado.
- A fixture visual não tinha grupos recolhíveis. Preservação de grupo expandido
  foi validada na regressão automatizada com sete commits reais no contrato de teste.
- Também validada a Task 16 preexistente: baseline encontrada de 8h, acréscimo de
  3h, Details e Inspector em **11h/220%**, posições e viewport idênticos.

Dados de QA mantidos para inspeção: Task 18 com duas sessões reais (4h + 3h), e o
lançamento adicional de 3h na Task 16. A criação usou os serviços existentes;
nenhum total foi escrito diretamente. São operações aditivas locais, sem exclusão,
reescrita de eventos ou reset do banco de desenvolvimento. A nova Task elevou o
REQ-4 a cinco tarefas e seu progresso de implementação passou de 25% para 20%,
conforme a fórmula existente. Tema Escuro e viewport padrão restaurados; abas
auxiliares encerradas.

## C — Finding IMPORTANT 02: Requirement aninhado stale

Causa: a movimentação retornava `{task,movement}` antes da reconciliação. O wrapper
sincronizava `result.requirement`, mas não `result.task.requirement`.

`requirement-reconciliation.repository.js` agora identifica o Requirement
relacionado nas duas formas de retorno e relê seu status **após** a reconciliação,
na mesma transação. A autoridade continua sendo o Requirement persistido pelo
motor existente; nenhuma regra de status foi duplicada e não há Prisma no serviço
ou controller. A sincronização do DTO raiz de Requirement foi preservada.

Regressões HTTP em `test/api/s109-traceability.test.js`, sessão e CSRF reais de
teste, MySQL isolado por `configureTestDatabaseEnvironment`:

| Transição | Status aninhado antes do fix | Response/DB/projeção após o fix | Situação/histórico |
|---|---|---|---|
| A_FAZER → EM_ANDAMENTO | PLANEJADO (stale) | EM_IMPLEMENTACAO | EM_DESENVOLVIMENTO |
| EM_ANDAMENTO → A_FAZER | EM_IMPLEMENTACAO (stale) | PLANEJADO | PLANEJADO |

Os dois testes falharam antes do patch exatamente em
`response.body.task.requirement.status`. Depois verificam simultaneamente status
da Task, caminho aninhado, Requirement no banco, projeção corrente e último evento
`TASK_STATUS_CHANGED`. As suítes existentes de reversibilidade, atomicidade,
autorização, projeção e histórico passaram nas três coberturas completas.

## D — Finding IMPORTANT 03: toolbar

Mudança exclusivamente local em `TraceabilityFlow.css`:
`.traceability-flow-actions > .button { min-height: var(--size-touch-target); }`.
As variantes existentes, wrap e controles do React Flow foram preservados.

| Controle | Antes, conforme Final QA | Depois, medido |
|---|---:|---:|
| Organizar automaticamente | 32px | 44px |
| Centralizar fluxo | 32px | 44px |
| Recolher tudo | 32px | 44px |

| Viewport | Light | Dark | Altura útil do canvas sem Inspector |
|---|---|---|---:|
| 1440 × 1000 | 44 / 44 / 44px, PASS | 44 / 44 / 44px, PASS | 576,5px |
| 1280 × 900 | 44 / 44 / 44px, PASS | 44 / 44 / 44px, PASS | 476,5px |
| 768 × 1024 | 44 / 44 / 44px, PASS | 44 / 44 / 44px, PASS | 608px |
| 390 × 844 | 44 / 44 / 44px, PASS | 44 / 44 / 44px, PASS | 359px |

Capturas renderizadas e `getBoundingClientRect()` conferidos. Em 390px a toolbar
ocupa duas linhas de ações, com Recolher na segunda; textos inteiros, sem overlap,
header íntegro e canvas disponível. Tab alcança Centralizar e Recolher; o foco usa
outline sólido de 3px nos dois temas. Enter em Centralizar opera o viewport.
Nenhuma scrollbar adicional foi introduzida pela regra de altura.

## E — Documentação

`docs/data/TASK_EFFORT_HISTORY.md` e `docs/api/API_CONTRACTS.md` agora descrevem a
lista única, eventos CREATED/UPDATED/DELETED separados da origem MANUAL/TIMER,
`kind: EVENT | LEGACY_SNAPSHOT`, snapshot identificado sem CREATED fictício,
IDs, ator, `source`, segundos, campos planos de snapshot, autorização atual,
paginação conjunta e exclusão de snapshots quando há filtro por evento.
Não foram inventados `origin`, campos em minutos ou um objeto `snapshot`.

## F — Roadmap canônico

Arquivo: `TRACEFLOW_ROADMAP_INCREMENTAL.md`, na raiz. Nenhum roadmap duplicado.

| Card | Registro anterior | Registro atual |
|---|---|---|
| S1-07 | Integração local com pendências históricas | CONCLUÍDO, com referências às entregas/homologação |
| S1-08 | Checklist vazio | CONCLUÍDO, com referências às entregas/homologação |
| S1-09 | Incremento backend Etapa 2; frontend futuro | Implementação concluída; correções do Final QA aplicadas; aguardando confirmação final de QA/Code Review |

O histórico segue nos relatórios originais. S1-09 e Sprint 1 não foram encerrados
prematuramente; nenhuma iniciativa de Sprint 2 ou S1-10 foi iniciada.

## G — Testes

| Suite | Resultado local |
|---|---|
| Frontend targeted | 48 PASS, 3 arquivos |
| Frontend critical ×10 | 10/10 consecutivas; 129 PASS por execução, 8 arquivos |
| Frontend full | 1.133 PASS, 92 arquivos |
| Frontend coverage | 1.133 PASS; thresholds aprovados |
| Backend targeted | 30 PASS, API e integração S109 |
| Backend unit | 757 PASS |
| Backend integration/API | 511 PASS; 5 skips legados |
| Backend coverage 1 | 1.268 PASS; 5 skips legados |
| Backend coverage 2 | 1.268 PASS; 5 skips legados |
| Backend coverage 3 | 1.268 PASS; 5 skips legados |

Cobertura frontend: statements 81,72%, branches 76,81%, functions 77,44%, lines
83,85%. Backend: statements 91,42%, branches 82,66–82,68%, functions 94,81%, lines
93,68%. Sem novos skips, retries, sleeps, aumento de timeout ou redução de asserts.
Migrations de teste aplicadas pelo helper existente; schema/migrations não alterados.

Comandos: `npx vitest run` nos arquivos focados; frontend `npm test`,
`npm run test:coverage`; backend `npm run test:unit`, `npm run test:integration`,
`npm run test:coverage` três vezes sequenciais. A suíte crítica inclui Workspace,
TaskGraphParity, TaskEffortTracker, useTaskEffort, ExpandedTraceabilityFlow,
TraceabilityFlow, TraceabilityLayout e TraceabilityPage.

## H — Gates

| Gate | Resultado |
|---|---|
| `npm run lint` | PASS frontend/backend |
| `npm run format:check` | PASS frontend/backend |
| `npm run build` | PASS frontend; aviso de chunk ELK grande já existente |
| `npm run architecture:check` | PASS |
| `npm run security:secrets` | PASS |
| `npm audit --json` + política do repositório | PASS da política: zero high/critical; 6 moderate backend, 3 moderate frontend |
| Supply chain local | PASS: 5 testes da política + dois `check-npm-audit.mjs`; manifests/lockfiles inalterados |
| `git diff --check` | PASS |

Audit consultou o registry com sucesso após liberar a rede do sandbox; JSONs com
metadata válida, sem erro de transporte. Nenhuma exceção aplicada. Instalação limpa
`npm ci` e GitHub Dependency Review não foram reexecutados nesta rodada; a
verificação local de supply chain não equivale à execução remota desses jobs.
Testes MySQL inicialmente bloqueados pelo sandbox foram executados com acesso ao
banco de teste; essas falhas de ambiente não foram usadas como reprodução funcional.

## I — Findings restantes e encerramento local

No escopo desta correção: **0 BLOCKING, 0 IMPORTANT, 0 SUGGESTION**.
Aguardando revalidação final independente e CI da revisão que vier a ser publicada.
O CHANGES REQUIRED anterior permanece evidência histórica.

Diff final limitado a quatro arquivos de produção, dois de regressão, dois
contratos/documentos, roadmap canônico e este relatório. Nenhuma dependência,
migration, regra de lifecycle, layout ELK, API adicional, debug ou refatoração
não relacionada. HEAD/branch mantidos; sem commit, push, merge, rebase, reset ou
stash. Logs, JSONs de audit e script auxiliar produzidos em
`/private/tmp/traceflow-s109-final-corrections` foram revisados e removidos após
transcrever a evidência neste relatório. Dados de homologação aditivos descritos
acima permanecem disponíveis; nenhum arquivo anterior foi removido.
