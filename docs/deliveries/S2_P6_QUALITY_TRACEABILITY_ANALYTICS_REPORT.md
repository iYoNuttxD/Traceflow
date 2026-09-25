# S2 P6 — Quality + Traceability Analytics

## 1. Baseline

Branch `daniel-dev`, HEAD inicial `0b0aeb13922a1c93e83d6fb9ba2b26fb16df5302`, working tree limpo no início. Node 22.23.3 para os gates; schema de teste `localhost/traceflow_test`, distinto de `localhost/traceflow`, validado antes de qualquer teste mutável.

## 2. Scope

Backend e contrato de I48–I67, agrupados em dois endpoints. Sem frontend, painel, cache, migration, commit, push ou implementação de I68.

## 3. Canonical owners reused

`normalizeIndicatorPeriod`, `indicatorResult`, `githubFreshness` e a projeção agregada S1-09 (`readProjectionMetrics`, `projectRequirementSummary`, `buildMatrixSummary`) permanecem autoridades. A leitura de Requirements ocorre em lotes de 200 sob `RepeatableRead` e é reutilizada uma vez por requisição, em vez de sete cálculos independentes.

## 4. Test execution analytics

I48 agrupa `TestExecution.result` pelo `executedAt`, uma linha por execução. I49–I51 usam o mesmo agregado PASS/FAIL/BLOCKED e devolvem `NO_DATA` com valor nulo no denominador zero.

## 5. Current TestCase health

I52 seleciona TestCases `ATIVO`/não excluídos e a última execução da `currentVersion`, ordenada por `executedAt DESC,id DESC`; versão anterior não valida a atual. Inclui `NEVER_EXECUTED`.

## 6. Defect current-state analytics

I53 e I54 contam Defects não excluídos por status e severidade. I53 expõe subtotal ativo de ABERTO, EM_CORRECAO e AGUARDANDO_RETESTE.

## 7. Defect period analytics

I55 usa `Defect.createdAt`. I56 conta `DISTINCT defectId` em `DefectHistoryEntry.action=VALIDATED`, pelo `occurredAt`; não usa `updatedAt` nem status atual como relógio. Exclusão lógica oculta o Defect conforme `DEFECT_HISTORY.md` e reduz cobertura histórica com `PARTIAL` e `excludedCount`.

## 8. Correction time

I57 mede a mediana em dias de `createdAt` até o primeiro `VALIDATED`, selecionando pelo relógio dessa primeira validação. Revalidações posteriores não aumentam a duração. Status legado `VALIDADO` sem evento permanece fora da amostra com contagem/limitação; nenhum timestamp é inferido.

## 9. Retest analytics

I58 usa exclusivamente `DefectRetest→TestExecution`, uma tentativa por registro, relógio `executedAt`. PASS/(PASS+FAIL+BLOCKED), com distribuição de BLOCKED. Retestes de Defects excluídos não reaparecem no valor e reduzem cobertura.

## 10. Defect concentration

I59 reutiliza `defect_links` S1-09, com `UNION` de vínculo direto e via Task ORIGIN, deduplicado por Defect/Requirement. Um Defect pode aparecer em mais de um Requirement; as barras não constituem total global. I60 usa somente Task ORIGIN, `COUNT DISTINCT`, top 10; CORRECTION não é origem.

## 11. Requirement coverage

I61, I63 e I64 medem, respectivamente, Requirements com Tasks, TestCase ativo relevante e Defect ativo direto/via ORIGIN. Os últimos dois seguem as mesmas relações deduplicadas da projeção S1-09.

## 12. Technical evidence

I62 usa o agregado técnico S1-09 de PR/commit vinculado via Task. Issue isolada não constitui evidência técnica.

## 13. Validation

I65 conta apenas situação atual `CONCLUIDO` derivada pela policy S1-09. Status legado do Requirement e validação passada de Defect não substituem a projeção atual.

## 14. Implementation coverage

I66 conta `implementation.implemented` da policy S1-09, separado da qualidade atual. Um Requirement tecnicamente implementado com TestCase FAIL e Defect ABERTO conta em I66, mas não em I65.

## 15. Requirement average progress

I67 usa `buildMatrixSummary.averageProgress`: média de percentual por Requirement, com zero para cada Requirement sem Task; não é RF15.

## 16. Freshness

I62/I65/I66 propagam `STALE` e metadados de sincronização quando a fonte GitHub está defasada. I61/I63/I64/I67 usam fatos locais e preservam `AVAILABLE` conforme seus dados.

## 17. Authorization/privacy

Rotas sob autorização VIEWER+ existente. Sem sessão: 401; projeto alheio/excluído: 404. Queries estritas, dados project-scoped. Payloads de concentração contêm Requirement/Task e contagem, sem pessoa, e-mail ou identidade GitHub.

## 18. Performance/query plans

Leituras sob demanda e `RepeatableRead`, com uma agregação para I48–I51 e outra projeção canônica compartilhada para I59/I61–I67. `EXPLAIN` no banco de teste pequeno usou range em `TestExecution(projectId,executedAt)`; I52 fez lookup de TestCase por `(projectId,deletedAt,status)` e busca indexada por `testCaseId` para a execução atual; Defect criado usou lookup por `projectId` e filtro `createdAt`; validação usou `(defectId,occurredAt,id)`; `DefectTask` usou índice e sort para top 10. A primeira validação agregou eventos por Defect antes do filtro da coorte. O plano pequeno não demonstra custo em volume de produção. `Defect(projectId,createdAt)` e a busca da última execução são pontos para medir com volume representativo; nenhum índice/migration foi criado por intuição.

## 19. Tests

Testes P6 persistidos cobrem acesso, queries, versão atual, coorte de execuções, validação distinta, primeira validação, retestes, exclusão lógica, legado sem evento, deduplicação e implementação separada de validação. Regressão S1-09 e testes completos são registrados na seção de gates.

## 20. Gates

Node 22.23.3: backend unit 823/823; integração/API 596 aprovados e 5 skips preexistentes; cobertura backend 1.419 aprovados e 5 skips preexistentes, 91,49% statements, 83,72% branches, 94,96% functions, 94,06% lines. Backend lint/format, Prisma validate/generate, architecture, CI policy, audit policy, secret scan e dependency audit backend/frontend passaram; 0 high/critical no audit. Frontend full e cobertura isolada 1.231/1.231 cada; cobertura frontend 83,87% statements, 78,41% branches, 79,05% functions, 86,30% lines. Frontend lint/format/build passaram. `git diff --check` passou. Testes backend no sandbox falharam por `listen EPERM` e migração de teste inacessível; com loopback autorizado, passaram. A primeira tentativa **concorrente** de coberturas backend/frontend sofreu timeouts dispersos por contenção; ambas passaram ao repetir isoladamente, sem relaxar testes. CI remota não foi executada nesta rodada local.

## 21. Documentation

`API_CONTRACTS.md`, `S2_INDICATOR_CATALOG.md`, `S2_DATA_READINESS_AUDIT.md` e `RF_TECHNICAL_MATRIX.md` atualizados para o backend P6. I68 preserva `NOT_RECOMMENDED`; RF54 não foi redefinido.

## 22. Remaining limitations

Legado sem evento temporal e Defects logicamente excluídos podem tornar I55–I58 `PARTIAL`/`UNAVAILABLE`; `excludedCount` legado é global porque sua coorte de período não é verificável. O período ainda aberto sinaliza `PERIOD_NOT_COMPLETE`. P7 (API consolidada/RF56), P8 (painel/RF55), P9 e P10 continuam pendentes; S2-04/S2-05 não são declarados concluídos.
