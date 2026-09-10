# TRACEFLOW S1-09 — BACKEND PROJECTION + SITUATION + HISTORY REPORT

**S1-09 BACKEND TRACEABILITY PROJECTION — PASS LOCAL**

Date: 2026-09-10. Branch: `daniel-dev`. HEAD: `503c7a3ea38fd56b3a7cf37d48b4fe3c120bd000`.
Node: 22.23.2. Database: MySQL 9.7.1, exclusivamente schemas locais descartáveis.

## A — Baseline

`git status --short`, branch, HEAD e `git diff --check` conferidos antes de editar. Os 957 arquivos rastreados estavam limpos. Já existiam, não rastreados, os documentos da Etapa 1: `docs/traceability/S1_09_TRACEABILITY_RULES_BASELINE.md` e `docs/deliveries/S1_09_TRACEABILITY_BASELINE_REPORT.md`. Ambos foram preservados e atualizados: os registros originais completos ficam identificados como históricos, abaixo das decisões humanas vigentes.

Implementação feita no checkout `/Users/daniel/Coding/Traceflow`, sem troca de branch. Não houve acesso GitHub, publicação, CI remoto ou alteração do banco de desenvolvimento/produção.

## B — Human Decisions

| Decision | Final |
|---|---|
| PLANEJADO | Preservado como 11º estado |
| Current TestCase version | Somente currentVersion de caso ATIVO/não excluído |
| Latest current execution | executedAt DESC, id DESC; outra versão não fornece crédito |
| IMPLEMENTADO | Tasks atuais presentes, todas CONCLUIDO, PR/commit confirmado; zero casos relevantes |
| AGUARDANDO_VALIDACAO | Implementação pronta, casos relevantes, nenhuma execução da versão atual |
| EM_VALIDACAO | Implementação pronta e validação iniciada incompleta, sem falha/Defect prioritário |
| VALIDADO | Todos os casos atuais PASS, nenhum Defect pendente e implementação pronta; Requirement não terminal |
| CONCLUIDO | Mesma cadeia + Requirement.status terminal real **CONCLUIDO** |
| Defect precedence | Estágio técnico primeiro; depois COM_FALHA > EM_CORRECAO > AGUARDANDO_RETESTE |

APROVADO não foi inventado como terminal: no domínio real ele pode ser calculado automaticamente quando todas as Tasks estão A_FAZER. O status persistido não foi renomeado nem alterado pela nova policy. Evidência de correção não é condição extra de conclusão.

## C — Legacy Rules Preserved

`getImplementationStage` foi extraído de `getImplementationStatus`; esta última mantém seu override histórico CONCLUIDO. A nova policy reutiliza `buildRequirementMetrics` e o estágio compartilhado, sem duplicar fórmulas.

Progresso permanece DONE/total de Tasks atuais, duas casas, null/hasData=false quando vazio; média antiga é por Requirement, incluindo zero sem Tasks. Evidência continua PR OU TaskCommit, sem exigir merge; Issue isolada não conta. Artefatos preservam contagem de vínculos. SEM_RASTREABILIDADE, PLANEJADO, EM_DESENVOLVIMENTO e fronteira IMPLEMENTADO permanecem. Correction Task vinculada ao Requirement entra no progresso como qualquer Task.

## D — Situation Engine

| Situation | Condition |
|---|---|
| SEM_RASTREABILIDADE | Zero Tasks, independentemente de qualidade |
| PLANEJADO | Tasks ainda não iniciadas e sem evidência técnica |
| EM_DESENVOLVIMENTO | Trabalho/evidência iniciado, sem implementação técnica completa |
| IMPLEMENTADO | Implementação pronta; zero casos relevantes e sem risco prioritário |
| AGUARDANDO_VALIDACAO | Implementação pronta; casos relevantes sem execução atual |
| EM_VALIDACAO | Validação atual iniciada, não integralmente PASS, sem risco prioritário |
| COM_FALHA | Implementação pronta; Defect ABERTO ou failed step atual não representado por Defect ativo |
| EM_CORRECAO | Implementação pronta; Defect EM_CORRECAO e nenhuma falha prioritária |
| AGUARDANDO_RETESTE | Implementação pronta; Defect aguardando reteste, sem falha/correção prioritária |
| VALIDADO | Implementação pronta; todos casos PASS, zero Defects pendentes, status persistido não terminal |
| CONCLUIDO | Mesma aprovação + Requirement.status=CONCLUIDO |

## E — Decision Tree

Owner puro: `requirement-traceability.policy.js`. Estágio técnico incompleto retorna primeiro. Com IMPLEMENTADO: falha/ABERTO → correção → reteste → zero casos → nenhum executado → conjunto não todo PASS → terminal concluído → validado. Todos os contadores acompanham a situação, mesmo quando um estágio anterior tem precedência. Situação pode regredir. Não existe endpoint manual de situação.

## F — TestCase Relevance

União direta requirementId OU TestCaseTask → Task.requirementId atual; mesmo projeto; deduplicação por ID; somente ATIVO/não excluído. Consulta seleciona a última execução de currentVersion por data/id. Teste antigo PASS não valida definição nova; neverExecuted refere-se à versão atual. BLOCKED não é FAIL. Execução contextual de reteste também participa da seleção corrente, sem duplicação.

## G — Defect Relevance

União direta OU ORIGIN Task atual; deduplicada e sem removidos. CORRECTION isolada não determina origem. A cobertura de falha é conferida por cada TestExecutionStep FAIL: detectedExecutionStepId exato em Defect ativo do mesmo projeto. Um passo descoberto mantém COM_FALHA; Defect excluído não mascara a falha. Cobertura do passo e relevância própria do Defect são dimensões separadas. PASS comum nunca valida Defect; lifecycle, revisão, ciclos e reteste explícito S1-08 preservados.

## H — Projection DTO

Exemplo real de forma contratada, com valores ilustrativos coerentes:

```json
{
  "requirement": { "id": 4, "displayId": "REQ-4", "title": "Checkout", "status": "VALIDADO" },
  "progress": { "numerator": 2, "denominator": 2, "percentage": 100, "hasData": true, "tasksTotal": 2, "tasksDone": 2 },
  "implementation": { "legacyStage": "IMPLEMENTADO", "legacyImplementationStatus": "IMPLEMENTADO", "implemented": true, "technicalEvidence": true },
  "artifacts": { "pullRequests": 1, "commits": 0, "issues": 0 },
  "validation": { "testCasesTotal": 1, "neverExecuted": 0, "pass": 1, "fail": 0, "blocked": 0 },
  "defects": { "total": 0, "open": 0, "inCorrection": 0, "waitingRetest": 0, "validated": 0 },
  "evidence": { "implementation": true, "validation": true, "correction": "NOT_APPLICABLE" },
  "hasUntreatedFailure": false,
  "situation": "VALIDADO"
}
```

## I — Evidence Dimensions

Implementation é o booleano herdado; validation indica ao menos uma execução corrente, qualquer resultado. Correction: NOT_APPLICABLE se nenhum Defect atualmente relevante; PRESENT se cada um tem Task de correção com PR/commit e reteste no ciclo atual; MISSING caso contrário. Não equivale a PASS, não promete referência exata do artefato retestado nem afirma que nunca houve Defect excluído. Flags não governam a situação como autoridade paralela.

## J — History Persistence

`RequirementTraceabilityState` guarda somente currentSituation/updatedAt e requirementId único. `RequirementTraceabilityHistoryEntry` guarda from/to, reason, source identity, occurredAt e rulesVersion=1. Transição e State são atômicos; no-op não escreve nem altera updatedAt. Primeira observação usa BASELINE_INITIALIZED/from=null. Nenhum histórico anterior foi reconstruído.

History conserva requirementId/sourceEntityId como identidades históricas sem FK a recursos removíveis; FK Project CASCADE define retenção funcional pelo projeto. DELETE de Requirement remove só seu State; transições sobrevivem. GET de Requirement removido retorna 404. Sem PII nova ou alteração de snapshots Planning. Razões posteriores incluem REQUIREMENT_STATUS_CHANGED, TASK_STATUS_CHANGED, TASK_REQUIREMENT_CHANGED, TECHNICAL_EVIDENCE_CHANGED, TESTCASE_UPDATED, TEST_EXECUTION_RECORDED, DEFECT_CORRECTION_CHANGED e DEFECT_RETEST_RECORDED.

## K — Reconciliation Hooks

| Domain event | Requirements reconciled |
|---|---|
| Requirement create/update/status/confirm/delete | Próprio e dependências de Tasks afetadas |
| Requirement replaceTasks | Origem/destino e qualidade compartilhada, antes/depois |
| Task create/update/status/delete/reassign | Requirements antigo/novo e dependências de casos/Defects ligados |
| PR/commit/issue link/unlink | Requirements da Task e caminhos compartilhados |
| RF41 confirmação de sugestão | Requirements da Task que recebeu TaskCommit |
| GitHub sync | Não muda vínculos de Task nem predicados de evidência; sem reconciliação desnecessária de projeto |
| TestCase create/update/version/status/delete | União dos Requirements alcançados antes/depois |
| TestExecution | Requirements atuais do caso |
| Defect create/update/relink/delete/correction | Vínculos antigos/novos, detecção e Tasks de correção |
| Retest | Requirements do caso/Defect, após lifecycle canônico PASS/FAIL/BLOCKED |

Fronteira única de repositório, sem service circular ou event bus. A mutação e sua reconciliação compartilham commit; falha comprovada na escrita do histórico desfaz também Task/State. Não há reinterpretação de uma mutação já confirmada como fracasso de refresh.

## L — Concurrency

Lock de Project primeiro, coerente com S1-08/Planning; isolamento ReadCommitted na escrita e na reconciliação aplicável. Teste com promises controladas e lock real bloqueia a primeira transação enquanto a segunda inicia. Duas reconciliações produzem um único baseline; duas reconciliações de transição produzem uma única alteração de State/History. Sem sleep, retry, aumento de timeout, skip novo ou relaxamento de assertions.

## M — Performance

Consulta em grupos por domínio; Prisma busca relações em batch e SQL seleciona somente a última execução da versão atual, apoiada em índice novo. Teste DB com qualidade: **1 Requirement = 11 queries; 20 Requirements = 11 queries**. Não há N+1 por Requirement/TestCase/Defect. A seleção não carrega todo o histórico de execuções/evidências.

Limite explícito: a lista calcula o agregado completo do projeto em snapshot RepeatableRead e aplica filtros/paginação em memória no servidor, preservando uma policy única e summary consistente. O volume de dados cresce com Tasks/casos/vínculos/correções; este resultado não é um benchmark de projeto ilimitado nem paginação SQL da cadeia inteira. Histórico é paginado no banco.

## N — Backward Compatibility

`requirements-matrix`, summary antigo, campos antigos e grafos não foram substituídos. Endpoints novos separam a semântica ampliada do contrato consumido atualmente. O gap conhecido de métricas do grafo de Requirement sobre a página não foi alterado nem propagado à nova projeção. S1-07 latestExecution histórico e S1-08 lifecycle preservados. Regressão frontend existente: 8/8 PASS; nenhum arquivo frontend alterado.

## O — API

GET `/api/projects/:projectId/traceability/requirements`: items, summary global, filteredSummary, pagination; page=1/limit=20/máx.100; ordem id DESC. Filtros search, situation, requirementStatus, hasTests, hasOpenDefects, hasTechnicalEvidence; avaliados no servidor antes de paginar. Summary por todas as onze situações; withDefect soma falha/correção/reteste.

GET `.../requirements/:requirementId/current`: DTO completo. GET `.../requirements/:requirementId/history`: items/nextCursor, occurredAt DESC/id DESC, limite 30/máx.100. Cursor scoped; inválido/alheio 400. Todos VIEWER+; sem sessão 401; recurso/projeto alheio 404. Leituras não escrevem State/History. API sem escrita manual de situation.

## P — Migration

Nova migration `20260910120000_s109_requirement_traceability`: duas tabelas e índice de execução corrente. Migrations anteriores intactas. Cadeia final completa aplicada em schema vazio: PASS, migration status PASS, tabelas vazias e índice verificado.

Upgrade representativo: cadeia do HEAD anterior em outro schema descartável; seed de Requirement, Task, PR, TestCase, TestCaseVersion, TestExecution FAIL e Defect; depois migration nova. Registros antes/depois idênticos; zero State/History criados pelo SQL. Dry-run calculou COM_FALHA sem escrever; apply criou um baseline e reexecução zero transições. Migration status e índice PASS. Schemas de validação removidos ao final. O schema exclusivo das suítes, `traceflow_test_s109_1789078703528`, também foi removido após as cinco rodadas.

A migration e o script operacional **não foram aplicados ao banco de desenvolvimento/produção**. Script de adoção: `node scripts/reconcile-requirement-traceability.js --project-id=<id> --dry-run` / `--apply`; padrão dry-run, sem reset e sem backfill fictício.

## Q — Tests

| Scope | Result |
|---|---|
| Focados novos | 52 PASS: 34 policy/CLI, 11 integração, 7 API |
| Unit backend | 712 PASS, 61 arquivos |
| Integração/API backend | 483 PASS; 5 skips legados, 33 arquivos passaram / 2 suites legadas skipped |
| Coverage completo | 1.195 PASS + 5 skips por execução, 94 arquivos passaram / 2 suites legadas skipped |
| Frontend atual | TraceabilityPage + TraceabilityFlow: 8 PASS |

Skips preservados: `e6-backfill.test.js` (1) e `e11-legacy-responsibility.test.js` (4). Nenhum skip S1-09. Cobertura de cenários: onze situações, prioridades, currentVersion, múltiplos passos, dedup, limites de implementação, terminal real, relinks, soft delete, regressão após conclusão, source deletion, rollback, concorrência, paginação, auth/IDOR e queries. Falhas iniciais de parâmetros opcionais e default de página foram corrigidas antes dos gates completos.

## R — Repeatability

Mesma implementação em cinco execuções consecutivas, todas com 1.195 PASS e 5 skips legados:

| Run | Result | Duration | Statements / branches / functions / lines |
|---|---|---|---|
| 1 | PASS | 65,68 s | 91,09 / 81,65 / 94,55 / 93,47% |
| 2 | PASS | 69,71 s | 91,10 / 81,68 / 94,55 / 93,47% |
| 3 | PASS | 67,47 s | 91,09 / 81,65 / 94,55 / 93,47% |
| 4 | PASS | 69,55 s | 91,10 / 81,68 / 94,55 / 93,47% |
| 5 | PASS | 66,81 s | 91,10 / 81,68 / 94,55 / 93,47% |

## S — Gates

| Gate | Result |
|---|---|
| unit | PASS, 712 |
| integration | PASS, 483 + 5 skips legados |
| coverage | PASS, cinco rodadas acima dos thresholds existentes |
| lint | PASS |
| format:check | PASS |
| architecture:check | PASS, sem ciclos novos |
| security:secrets | PASS |
| prisma validate / generate | PASS |
| empty migration | PASS |
| populated upgrade | PASS, dados preservados |
| migration status | PASS nos schemas descartáveis |
| supply chain | package.json/lockfiles intactos; zero dependências novas |
| frontend regression | PASS, 8 testes existentes |
| git diff --check | PASS |

Evidência bruta local: `/private/tmp/traceflow-s109e2/` contém logs focados, unit, integration, coverage-1..5, migration/status, empty-chain, populated-before/upgrade/status e populated-proof.json. Não contém credenciais. CI remoto e homologação visual não foram executados nem declarados como PASS.

## T — Documentation

- [Baseline e decisões resolvidas](../traceability/S1_09_TRACEABILITY_RULES_BASELINE.md).
- [Relatório da Etapa 1 com resolução e registro original preservado](S1_09_TRACEABILITY_BASELINE_REPORT.md).
- [Contrato funcional de projeção/histórico](../data/REQUIREMENT_TRACEABILITY_HISTORY.md).
- [API contracts](../api/API_CONTRACTS.md).
- [Authorization matrix](../security/AUTHORIZATION_MATRIX.md).
- [RF technical matrix](../traceability/RF_TECHNICAL_MATRIX.md): backend implementado / frontend pendente, sem declarar RFs completos.
- [Roadmap incremental](../../TRACEFLOW_ROADMAP_INCREMENTAL.md): S1-09 permanece aberta.
- Este relatório A–W.

## U — Frontend

Requirement Cards: **NOT IMPLEMENTED**. New Summary: **NOT IMPLEMENTED**. New Filters: **NOT IMPLEMENTED**. Situation History UI: **NOT IMPLEMENTED**. Expanded React Flow: **NOT IMPLEMENTED**. Nenhum arquivo frontend alterado. Etapa 3 não iniciada.

## V — Git final

Branch `daniel-dev`, HEAD `503c7a3ea38fd56b3a7cf37d48b4fe3c120bd000` preservados. Working tree final: 19 arquivos rastreados modificados e 13 não rastreados (incluindo os dois documentos prévios); somente implementação backend, migration incremental, testes focados e documentos desta entrega; os dois documentos anteriores permanecem presentes com seu registro original integral. Preservação SHA-256 verificada: 938 dos 957 arquivos rastreados permanecem idênticos, assim como o conteúdo original integral dos dois documentos anteriores dentro dos registros históricos. Nenhuma alteração em dependências, frontend ou migrations anteriores. `git diff --check` PASS; arquivos novos também verificados quanto a whitespace.

## W — Git operations

**NO COMMIT / NO PUSH / NO MERGE / NO REBASE / NO RESET.** Sem force-push, clean, stash automático ou descarte de trabalho pré-existente. Entrega encerrada na Etapa 2; nenhum incremento frontend iniciado.
