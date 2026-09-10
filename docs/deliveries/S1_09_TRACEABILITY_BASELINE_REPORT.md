# S1-09 — Baseline report: decisões resolvidas

**RESOLVED HUMAN DECISIONS — 2026-09-10.** O pedido humano da Etapa 2 resolveu OD-01 a OD-04 e autorizou a implementação do backend. O relatório original da auditoria está preservado abaixo; seus resultados/gates continuam sendo evidência exclusivamente da Etapa 1.

| Decisão | Resultado vigente |
|---|---|
| PLANEJADO | Preservar como 11º estado |
| TestCases | União direta/Task atual, ativos não excluídos, deduplicada e restrita ao projeto |
| Execução corrente | Última da currentVersion, executedAt DESC/id DESC; sem crédito de PASS antigo |
| Fronteiras | Implementação pronta antes de qualidade; sem casos → IMPLEMENTADO; sem execução atual → AGUARDANDO_VALIDACAO; parcial/BLOCKED → EM_VALIDACAO |
| VALIDADO | Todos os casos atuais PASS, nenhum Defect pendente, implementação pronta, status de Requirement não terminal |
| CONCLUIDO | Mesmas condições + Requirement.status terminal real CONCLUIDO; APROVADO não é o terminal desse domínio |
| Prioridade | Estágio técnico primeiro; depois COM_FALHA > EM_CORRECAO > AGUARDANDO_RETESTE |
| Evidência de correção | Informativa; não é condição extra de conclusão |
| Histórico | State mínimo + transições atômicas, BASELINE_INITIALIZED sem passado inventado, no-op sem escrita |

O [baseline atualizado](../traceability/S1_09_TRACEABILITY_RULES_BASELINE.md) é a autoridade das decisões; o [relatório da Etapa 2](S1_09_BACKEND_PROJECTION_SITUATION_HISTORY_REPORT.md) contém a implementação e os gates atuais. Não é necessário solicitar novamente o fechamento das quatro decisões. A Etapa 3 e a expansão do grafo permanecem futuras.

<details>
<summary>Relatório original da Etapa 1 — propostas e evidência histórica, substituídas somente pelas resoluções acima</summary>

# TRACEFLOW S1-09 — TRACEABILITY BASELINE REPORT

Date: 2026-09-10

Branch: `daniel-dev`

HEAD: `503c7a3ea38fd56b3a7cf37d48b4fe3c120bd000`

**S1-09 TRACEABILITY BASELINE — OPEN DECISIONS**

Auditoria e especificação documental produzidas. Há quatro decisões semânticas novas que não podem ser inferidas do domínio existente; estão detalhadas na seção J e na seção 26 do [baseline canônico](../traceability/S1_09_TRACEABILITY_RULES_BASELINE.md). Os cenários têm resultados propostos determinísticos, condicionados a essas decisões. Não se declara PASS de regras ainda não aprovadas.

Working tree inicial limpo; `git diff --check` inicial PASS. Escopo efetivo: dois documentos novos. Nenhuma alteração em runtime, schema, migration, banco, dependências, testes versionados ou UI. A atualização Nodemailer anterior já integra o HEAD observado; esta auditoria não presume nem reutiliza o HEAD da tarefa anterior.

## A — Existing Implementation

### Backend files

| Arquivo/grupo real | Papel |
|---|---|
| `backend/prisma/schema.prisma` | Requirement, Task, vínculos GitHub, TestCase/Version/Task, TestExecution/Step/Evidence, Defect/Task/Retest/HistoryEntry, AuditEvent, SprintTask |
| `backend/src/modules/traceability/traceability.{routes,controller,validation,service,repository,calculator,mapper}.js` | Rotas, projeção de matriz e grafos, fórmulas, contadores e DTOs |
| `backend/src/modules/traceability/commit-suggestion.{service,repository,parser}.js` | Sugestão específica RF41, cuja confirmação cria TaskCommit |
| `backend/src/modules/requirements/requirement.{schema,repository,service,controller,routes,validation}.js` e `services/requirement-{crud,status,task}.service.js` | Status persistido, vínculos, cardinalidade e exclusão |
| `backend/src/modules/tasks/services/task-{crud,requirement,pull-request,commit,issue,kanban}.service.js` | Trabalho de implementação e vínculos técnicos |
| `backend/src/modules/tasks/task.repository.js`, `repositories/task-{link,movement,history}.repository.js` | Escrita/recálculo e histórico de Tasks |
| `backend/src/modules/testCases/` | `test-case.schema`, presenter, routes/controller; services de definição/execução e repositories correspondentes |
| `backend/src/modules/defects/` | Schema/service/presenter/routes/controller, `defect-retest.service`, repositories de leitura e projeção |
| `backend/src/modules/audit/audit.{service,repository}.js` | Trilha técnica minimizada; não é histórico funcional de situação |
| `backend/src/shared/maintenance/privacy-retention.js`, `backend/src/middlewares/auth/project-authorization.middleware.js`, `backend/src/app.js` | Retenção, autorização e composição das rotas |

Não existe estrutura persistente de situação de Requirement. Correção é papel de Task, ciclo é número, reteste é DefectRetest ligado a TestExecution. Não existe `CorrectionCycle`, `CorrectionTask`, `RequirementHistory` ou `TraceLink` como model atual.

### Frontend files

- `frontend/src/app/routes/AppRoutes.jsx`, `pages/TraceabilityPage.jsx`, `features/traceability/index.js`.
- `features/traceability/pages/TraceabilityScreen.{jsx,css}`, `api/traceability.api.js`, `components/TraceabilityFlow.{jsx,css}`.
- `shared/hooks/useAbortableRequest.js`, `styles/global.css`: requests e apresentação existente; não há model/frontend calculator de situação.
- `features/tasks/components/TaskQuality.jsx`, `TaskTraceability.jsx`, `TaskDetailsLayout.jsx`: detalhe contextual de implementação/qualidade.
- `features/testCases/model/test-cases.js`, `components/TestCaseDetails.jsx`, `ExecutionSummary.jsx`, `TestExecutionWizard.jsx`: definição atual, versão executada, resultado e referência.
- `features/defects/model/defects.js`, `components/DefectDetails.jsx`, `DefectFlow.jsx`, `DefectHistory.jsx`: leitura do lifecycle, correções e reteste contextual, sem cálculo de situação de Requirement.

A tela atual possui os cinco cards Total de requisitos / Com tarefas / Com evidência técnica / Implementados / Progresso médio. A matriz tem Requisito / Status / Progresso / Tarefas / Issues / PRs / Commits / Evidência / Situação. Clique seleciona Requirement e busca seu grafo; expansão de node usa conteúdo já recebido. Não há request por Requirement ao carregar a matriz nem request por node ao expandir.

A matriz pagina 20 requisitos; o grafo recebe por padrão somente 20 Tasks e não tem paginação exposta no Screen. As APIs de perspectivas Task/artefato existem, mas o Screen não oferece navegação para elas. O canvas atual tem cinco tipos de entidade; as cores são categóricas, não badges de situação. Somente a coluna Evidência possui badge success/neutral; Situação é texto.

### Docs e testes de referência

Autoridade e evidência cruzadas: `TRACEFLOW_CONTEXTO_ARQUITETURA.md`, roadmap S1-09, ADR-006/ADR-008, E0 baseline/matriz, E10, API_CONTRACTS, RF_TECHNICAL_MATRIX, TEST_CASE_HISTORY, DEFECT_HISTORY, PLANNING_HISTORY, AUTHORIZATION_MATRIX, DATA_RETENTION_POLICY, DESIGN_SYSTEM, UI_SURFACE_INVENTORY, QA/correções S1-07 e relatórios backend/frontend S1-08.

Testes existentes inspecionados: `backend/test/unit/traceability.calculator.test.js`, blocos de requisitos/matriz/grafos de `backend/test/api/mvp-contracts.test.js`, cenários de `backend/test/integration/test-cases-s1-07.test.js` e `defects-s1-08.test.js`, `frontend/test/pages/TraceabilityPage.test.jsx` e `components/TraceabilityFlow.test.jsx`. A suíte unitária caracteriza expressamente PLANEJADO, Issue sem evidência e CONCLUIDO mesmo com zero Tasks. A suíte HTTP caracteriza summary global e perspectivas tipadas. Inspeção não equivale a nova execução desses testes.

## B — Existing Rules

| Rule | Current behavior | Owner |
|---|---|---|
| Progress | `count(status=CONCLUIDO)/Tasks atuais de R × 100`, duas casas; d=0 → null/hasData=false; escalar legado 0 | `calculateProgress`/`buildMetric`, repository define conjunto |
| Technical evidence | Ao menos uma PR ou relação TaskCommit; Issue isolada não conta; sem exigência de merge | `buildRequirementMetrics` |
| Implemented | Todas Tasks DONE, T não vazio, evidência; status persistido CONCLUIDO tem override anterior | `getImplementationStatus` |
| Situation | CONCLUIDO → SEM_RASTREABILIDADE → IMPLEMENTADO → EM_DESENVOLVIMENTO → PLANEJADO, por predicados ordenados | Calculator backend; frontend traduz |
| Average progress | Média aritmética dos percentuais individuais, incluindo requisitos sem Tasks como 0; N=0 → null | `buildMatrixSummary`, global e independente da página |
| Requirement status | Persistido; auto recálculo CADASTRADO/APROVADO/EM_IMPLEMENTACAO/VALIDADO pelas Tasks, preservando CONCLUIDO/CANCELADO; atualização explícita aceita estados permitidos | Requirement services e repositories de escrita de Task |
| Artifact counts | Contam vínculos; um artefato em duas Tasks pode contar 2 e ter só um node | Calculator/mapper |

Exemplos executados nas funções puras atuais: zero Tasks→null, TODO→0%, IN_PROGRESS→0%, DONE→100%, 1/4→25%, 3/4→75%, 4/4→100%; média 100% + requisito sem Task → 50%. Execução sem banco/rede, sem escrever cálculo novo.

Divergência reproduzida do grafo: 21 Tasks, 20 DONE, evidência presente; matriz calcula 95,24% e EM_DESENVOLVIMENTO, enquanto grafo com página de 20 DONE calcula 100% e IMPLEMENTADO, ainda anunciando tasksCount=21. Este problema foi documentado, não corrigido.

## C — Preserved MVP Rules

Preservar fórmula e média, vazio versus zero, Task atual como universo, cardinalidades Requirement–Task e Task–PR, joins específicos, evidência PR/commit, Issue como contexto, RF41 com confirmação humana, status persistido, métricas/estados derivados legados e identidade única de nodes/edges.

Progresso não inclui resultados de teste, defeitos ou retestes. Correction Task vinculada a Requirement já é trabalho de implementação e entra no denominador como qualquer Task. Adicionar trabalho pode reduzir o percentual; não excluir correções para impedir esse efeito. Task de ciclo anterior não desaparece do progresso por ser histórica no Defect. Snapshot Planning nunca substitui a Task atual na fórmula.

Status persistido VALIDADO não prova TestExecution PASS; CONCLUIDO antigo não prova cadeia de qualidade completa. A nova situação deve ser outro campo, sem reescrever essas regras ou usar conclusão persistida para mascarar falhas.

## D — New Domain Inputs

| Input | Estado atual / contribuição futura |
|---|---|
| TestCase | ATIVO/INATIVO, soft delete, responsável ativo, Requirement OU Task; união transitiva de pertinência ainda não agregada pela API |
| TestCaseVersion | Snapshot de definição/vínculos; alterações de definição geram versão, status/responsável não |
| TestExecution / Step | Registro completo e imutável de versão, referência XOR PR/commit, resultado FAIL > BLOCKED > PASS; não há execução parcial RUNNING persistida |
| Defect | Detecção explícita em passo FAIL, vínculos próprios Requirement/ORIGIN, status de ciclo/revisão, severidade e soft delete |
| Correction Task | Task normal; ORIGIN ciclo 0 não participa; CORRECTION do ciclo atual determina ABERTO/EM_CORRECAO/AGUARDANDO_RETESTE |
| Retest | Relação explícita com execução do mesmo TestCase, versão atual e contexto revisado; PASS valida, FAIL abre ciclo vazio, BLOCKED mantém ciclo |

Execução comum PASS não fecha Defect. Defect VALIDADO permanece assim após reabrir Task compartilhada; projeção do Requirement pode mudar, sem violar o lifecycle do defeito. Exclusão lógica não apaga execução, evidência, ciclo ou reteste. O DTO de execução contém `detectedDefects` atuais para navegação, separado dos resultados congelados.

## E — Proposed Situation Model

Todas as condições dependem da precedência e das decisões OD-01 a OD-04; não são regras implementadas.

| Situation | Meaning | Trigger/condition |
|---|---|---|
| SEM_RASTREABILIDADE | Sem cadeia de implementação disponível | Zero Tasks, sem execução relevante nem risco prioritário; casos definidos ainda pendentes são explicitados |
| EM_DESENVOLVIMENTO | Trabalho incompleto ou evidência faltante | Tasks parciais, ou todas DONE sem evidência e sem condição prioritária de qualidade |
| IMPLEMENTADO | Implementação técnica pronta | T não vazio/todas DONE + evidência, zero casos relevantes |
| AGUARDANDO_VALIDACAO | Testes definidos, validação ainda não iniciada | Implementação pronta, casos relevantes sem execução corrente |
| EM_VALIDACAO | Conjunto iniciado, ainda não aprovado | Alguma execução corrente com pendências/BLOCKED, após avaliar riscos e trabalho parcial |
| COM_FALHA | Falha corrente não tratada | Defect ABERTO ou FAIL não absorvido por correção/reteste relevante |
| EM_CORRECAO | Correção em andamento | Algum Defect relevante EM_CORRECAO |
| AGUARDANDO_RETESTE | Correções aguardam confirmação | Algum AGUARDANDO_RETESTE, nenhum EM_CORRECAO |
| VALIDADO | Qualidade aprovada, cadeia incompleta | Q não vazio/todos PASS, nenhum Defect pendente; falta evidência de implementação/correção; Tasks parciais continuam prioritárias |
| CONCLUIDO | Cadeia completa | Implementação pronta + Q não vazio/todos PASS + nenhum Defect pendente + correções comprovadas/N/A |

Recomendação adicional OD-01: manter PLANEJADO como 11º estado para trabalho todo TODO, sem evidência, execução ou Defect. Isso preserva uma distinção atual em vez de suprimi-la ao adotar a lista candidata.

## F — Precedence

Algoritmo proposto sobre estado consolidado, sem “última coisa que aconteceu”:

1. Algum Defect EM_CORRECAO → EM_CORRECAO.
2. Algum AGUARDANDO_RETESTE → AGUARDANDO_RETESTE.
3. Algum ABERTO ou FAIL corrente não absorvido → COM_FALHA.
4. Tasks presentes e não todas DONE → PLANEJADO na exceção proposta; senão EM_DESENVOLVIMENTO.
5. Validação aprovada → CONCLUIDO se cadeia técnica/correção completas; senão VALIDADO.
6. Execução corrente existente sem aprovação integral → EM_VALIDACAO.
7. Implementação pronta + casos pendentes sem execução → AGUARDANDO_VALIDACAO.
8. Implementação pronta + nenhum caso relevante → IMPLEMENTADO.
9. Tasks existentes sem evidência → EM_DESENVOLVIMENTO.
10. Restante → SEM_RASTREABILIDADE, com razões/contadores disponíveis.

FAIL é examinado por passo da execução selecionada: Defect em outro passo não o absorve. Defect ABERTO, Task TODO ou simples cadastro de Defect não equivalem a correção iniciada. Múltiplas pendências permanecem em `activeReasons` mesmo quando outra situação vence. A prioridade entre falha não tratada, correção e reteste é OD-04.

## G — Scenario Matrix

Simulação semântica documental; não existe novo motor executado.

| ID | Cenário obrigatório | Resultado proposto |
|---|---|---|
| S01 | Zero Tasks/Tests/Defects | SEM_RASTREABILIDADE |
| S02 | Duas Tasks, DONE + IN_PROGRESS | EM_DESENVOLVIMENTO; 50% |
| S03 | Todas DONE + evidência, zero testes executados | IMPLEMENTADO se nenhum relevante; AGUARDANDO_VALIDACAO se casos relevantes pendentes |
| S04 | Todas DONE, PASS + nunca executado | EM_VALIDACAO |
| S05 | Todas DONE, latest relevante FAIL, sem Defect | COM_FALHA |
| S06 | FAIL, Defect ABERTO, zero Correction Tasks | COM_FALHA |
| S07 | Defect EM_CORRECAO | EM_CORRECAO |
| S08 | AGUARDANDO_RETESTE, nenhum EM_CORRECAO | AGUARDANDO_RETESTE |
| S09 | Defect VALIDADO + todos casos atuais PASS | CONCLUIDO somente com cadeia completa; VALIDADO se falta evidência; EM_DESENVOLVIMENTO se Tasks parciais |
| S10 | Implementação/evidência/validação completas e defeitos validados | CONCLUIDO, exigindo correção comprovada/N/A |
| S11 | A VALIDADO + B EM_CORRECAO | EM_CORRECAO |
| S12 | PASS + BLOCKED + nunca executado | EM_VALIDACAO se não há condição prioritária de desenvolvimento/Defect |

| Conflito adicional | Resultado proposto |
|---|---|
| EM_CORRECAO + Task original IN_PROGRESS | EM_CORRECAO; progresso da Task preservado |
| AGUARDANDO_RETESTE + EM_CORRECAO | EM_CORRECAO; reteste continua motivo ativo |
| Um PASS + outro nunca executado | EM_VALIDACAO, se não há condição prioritária |
| VALIDADO + ABERTO | COM_FALHA |
| Requirement APROVADO + FAIL | Status APROVADO e situação COM_FALHA |
| PASS + BLOCKED / todos BLOCKED | EM_VALIDACAO, se não há condição prioritária |
| PASS + FAIL | COM_FALHA, salvo correção/reteste prioritário |
| PASS comum + Defect ABERTO | COM_FALHA; nenhum reteste implícito |
| PASS de v1, definição v2 sem execução | Pendente na nova projeção recomendada; PASS histórico intacto |
| Reteste FAIL / BLOCKED | COM_FALHA no ciclo novo / AGUARDANDO_RETESTE no mesmo ciclo |
| TestCase excluído + Defect pendente | Defect continua pendente; exclusão não valida |

A tabela completa do baseline acrescenta duplicação por caminhos, reatribuição, ciclos antigos, falta de evidência e ausência de Tasks. Nos cenários incompletos S03/S09, informar alternativas evita inventar pré-condições.

## H — History

| Aspecto | Resultado |
|---|---|
| Existing capability | AuditEvent técnico, históricos próprios de Task/TestCase/Defect, versões/execuções e snapshots de Sprint; nenhum histórico de situação do Requirement |
| Reuse possible | Padrões de transação, autoria, cursor, snapshot e histórico funcional de Defect; AuditEvent apenas como trilha minimizada adicional |
| New persistence required | Sim, proposta de histórico funcional específico de situação; sem mudança de DB nesta fase |

AuditEvent tem expurgo e leitura de projeto OWNER; seu minimizador não aceita os campos necessários de transição. Reutilizá-lo diretamente perderia from/to e não garantiria a retenção funcional. TaskHistory também pode ser removido na exclusão da Task. Não há material para timeline retrospectiva completa.

Proposta: primeira observação datada como BASELINE_OBSERVED, sem backdating; depois transições e snapshots mínimos persistidos junto da mutação, com rulesVersion/sequence/eventKey. Requirement excluído precisa continuar identificável sem cascade destrutivo do novo histórico e sem bloquear silenciosamente o DELETE atual. Nenhum backfill de eventos antigos; captura começa quando o suporte futuro entrar em operação. Mudança de regra não recalcula registros históricos.

## I — Read Model

Próxima etapa precisa de identidade, status persistido, situação ampliada/razões, progresso herdado, contagens total/done de Task, links e artefatos distintos, TestCases relacionados/relevantes/inativos, execuções correntes por versão, PASS/FAIL/BLOCKED/pendências, Defects por status, ciclos/ret-PASS e três dimensões de evidência.

A relevância proposta de TestCase une vínculo direto e Task.requirementId atual, deduplicando por id; Defect une vínculo direto e ORIGIN Task, sem usar CORRECTION como origem. Execuções históricas, versões e referências continuam identificadas; não reutilizar latestExecution de qualquer versão como confirmação corrente sem a OD-02.

Usar o módulo traceability e um read repository com consultas agregadas/batch; agregados sobre conjunto completo, apresentação paginada. O summary atual não tem N+1 explícito por Requirement, mas carrega todo o conjunto resumido em memória e duplica leitura de parte dele para a página. Não foi executado benchmark/EXPLAIN. API atual não possui união transitiva de qualidade por Requirement; fazer N fetches no frontend seria incorreto e custoso.

Nodes previstos: Requirement, Task (também Correction Task), PR, Commit, Issue, TestCase, Version opcional, TestExecution, Step, Defect, DefectRetest. Preservar uma identidade por objeto; mesmo teste de reteste não vira uma segunda execução. Labels como IMPLEMENTA/VERIFICADO_POR/IMPLEMENTADO_EM/DETECTOU/CORRIGIDO_POR/RETESTADO_POR pertencem à visualização, não a um domínio genérico de relações.

## J — Gaps e OPEN DECISIONS

| Classificação | Achado |
|---|---|
| DOMAIN GAP | PLANEJADO ausente da lista candidata; validade de execução para qualidade ampliada; fronteiras/precedência dos novos estados |
| DOMAIN GAP | Status persistido não é aprovação pura: recálculo e override de conclusão são regras atuais a preservar |
| API GAP | Métricas do grafo dependem da página; contagem de vínculo difere de artefato distinto; falta agregado transitivo de qualidade |
| PERSISTENCE GAP | Falta histórico de situação; snapshot Planning não traz contexto completo de correção; pertinência histórica indireta de TestCase não pode ser reconstruída |
| UI GAP | Falta ampliação da tela/nodes, paginação de Tasks no grafo e navegação explícita Task/artefato nesta tela; risco estático de contexto na troca de projeto |
| DOCUMENTATION GAP | DOCUMENTATION/CODE DIVERGENCE: texto E10 de fallback de auditoria individual difere do task-link.repository transacional atual; introdução DEFECT_HISTORY ainda diz UI pendente, embora integrada |

Decisões humanas necessárias, com opções/impactos completos na seção 26 do baseline:

1. **OD-01 — PLANEJADO:** manter o 11º estado (recomendado) ou fundir explicitamente com EM_DESENVOLVIMENTO, preservando subestado/valor legado.
2. **OD-02 — Validação relevante:** adotar ativos não excluídos, versão atual e última execução por data/id (recomendado), ou manter latest histórico, ou exigir contexto de código/ambiente/reassociação mais forte. A política atual não decide essa validade para Requirement.
3. **OD-03 — Fronteiras de conclusão:** aprovar o conjunto proposto de IMPLEMENTADO/AGUARDANDO_VALIDACAO/VALIDADO/CONCLUIDO, sem aprovação vacuamente verdadeira e com evidência de correção; decidir se correspondência da referência de reteste e aceite explícito são necessários. Recomendação: correspondência informativa, conclusão automática da cadeia comprovada, sem mudar status persistido.
4. **OD-04 — Prioridade entre riscos:** correção → reteste → falha, com todos os motivos visíveis (recomendado), ou falha não tratada acima de correção/reteste.

Nenhuma das quatro está marcada como aprovada. Identificação de gaps de implementação não autoriza sua correção nesta etapa.

## K — Next Increment

**Próximo prompt imediato recomendado:**

> TRACEFLOW — S1-09 ETAPA 1.1 — Fechar OD-01 a OD-04. Revisar as recomendações e registrar decisões explícitas em S1_09_TRACEABILITY_RULES_BASELINE.md e S1_09_TRACEABILITY_BASELINE_REPORT.md. Reconciliar lista, predicados, precedência, cenários e semântica de evidência/validação. Manter runtime, banco, migrations e frontend inalterados. Não iniciar a Etapa 2; sem commit/push/merge/rebase/reset.

Após o fechamento, o incremento técnico recomendado é exatamente **S1-09 ETAPA 2 — Backend Traceability Projection + Situation Engine + History**. Escopo do prompt subsequente:

> Implementar apenas o backend aprovado no baseline: projeção agregada, motor determinístico e histórico funcional transacional. Preservar progress, Requirement.status, implementationStatus e relações legadas; incorporar qualidade com campos aditivos. Resolver agregação independente da página, deduplicação e todas as mutações que afetam pertinência/estado, inclusive reatribuição e exclusão. Se autorizado nessa etapa, criar apenas a persistência mínima do histórico com migration incremental e observação inicial honesta; sem timeline reconstruída. Validar cenários, concorrência, mesmo projeto, versões, reteste explícito e soft delete. Não implementar frontend/React Flow nem domínio genérico de relações. Não alterar o lifecycle S1-07/S1-08 nem executar operações Git proibidas.

**Nenhum desses incrementos foi iniciado.**

## L — Verificação e Git final

| Verificação | Resultado desta etapa |
|---|---|
| Baseline git status/branch/HEAD | Confirmado ao vivo; árvore inicial limpa |
| Funções puras atuais de progresso/média/evidência/situação | PASS nas simulações descritas; sem banco/rede |
| Reprodutor puro de paginação do grafo | Gap confirmado: matriz 95,24% contra detalhe 100% |
| Cenários novos | Revisão semântica documental; condicionada às OPEN DECISIONS, sem motor implementado |
| Gate documental do repositório | Não encontrado em package.json/scripts/workflows; format:check existente cobre JS/JSX e package.json, não estes Markdown |
| `git diff --check` | PASS |
| Whitespace dos dois arquivos novos | PASS; verificação também por `git diff --no-index --check /dev/null <arquivo>` |
| Estrutura e referências documentais | 26 seções do baseline, A–K do relatório, 12 cenários e 4 decisões presentes; links locais e âncoras conferidos |
| Preservação do checkout | SHA-256 dos 957 arquivos rastreados idêntico ao baseline; somente os dois documentos novos não rastreados |
| Integração, coverage, visual, CI | Não executados nesta etapa documental; resultados históricos não foram promovidos |
| Runtime/schema/migrations/banco | UNCHANGED; nenhum banco acessado |
| Arquivos entregues | Somente este relatório e `docs/traceability/S1_09_TRACEABILITY_RULES_BASELINE.md` |

Confirmações: **NO RUNTIME CODE CHANGES / NO MIGRATION / NO DB CHANGE / NO COMMIT / NO PUSH / NO MERGE / NO REBASE / NO RESET.**

## M — Tabela final de decisões

| Decisão | Resultado |
|---|---|
| Progress semantics | PRESERVAR: Tasks atuais DONE/total, duas casas; sem peso de qualidade; média por Requirement |
| Technical evidence semantics | PRESERVAR: PR OU TaskCommit; Issue não conta; sem exigir merge |
| Implemented semantics | PRESERVAR: todas Tasks DONE + evidência; override CONCLUIDO registrado no campo herdado; prontidão nova calculada separadamente |
| Requirement status semantics | PRESERVAR: status persistido com recálculo herdado; não equivale a resultado de teste nem aprovação puramente humana |
| Traceability situation semantics | PROPOSTA: novo campo derivado do estado consolidado, independente do status persistido |
| Relevant TestCase rule | PROPOSTA P-TC/OD-02: direto OU Task atual, mesmo projeto, único por id; ativos não excluídos e versão atual |
| Relevant Defect rule | PROPOSTA P-DEF: direto OU ORIGIN Task atual; deduplicado, não excluído; CORRECTION não cria origem |
| Situation list | Dez estados candidatos formalizados; OD-01 recomenda PLANEJADO adicional |
| Situation precedence | PROPOSTA P-SIT/OD-04: correção > reteste > falha, depois trabalho/validação/conclusão; todos os motivos preservados |
| Validation definition | PROPOSTA/OD-02: Q não vazio, todos PASS da projeção elegível e nenhum Defect pendente; executed não equivale a aprovado |
| Conclusion definition | PROPOSTA/OD-03: implementationReady + validação + correção comprovada/N/A; não deriva de status persistido CONCLUIDO |
| History strategy | Observação inicial honesta e transições futuras persistidas na mutação, versionadas e imutáveis; AuditEvent só complementar |
| Need DB change next phase? | SIM, histórico funcional específico; nenhuma relação genérica ou mudança de banco nesta etapa |
| Need API/read model next phase? | SIM, agregado completo e aditivo de qualidade/situação/evidências, grafo e histórico paginados; sem N requests por Requirement |

</details>
