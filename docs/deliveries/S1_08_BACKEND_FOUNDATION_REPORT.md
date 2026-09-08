# TRACEFLOW S1-08 — BACKEND FOUNDATION REPORT

Data: 2026-09-08. Branch: `daniel-dev`.
HEAD de base: `15b718b6d9ae8073b074db335fba13862e779e6f`.
Node: 22.23.2. MySQL local: 9.7.1; CI MySQL 8.4.8 não executado nesta sessão.
Banco mutável exclusivo: `traceflow_s108_41417b9fba_test`.

**S1-08 BACKEND FOUNDATION — PASS (validação automatizada local).**

## A — Baseline e auditoria

Working tree inicialmente limpo; `git diff --check` sem erros. Branch/HEAD
conferidos antes de editar. Hashes dos arquivos rastreados e cópia do schema
anterior preservados em `/private/tmp/traceflow-s108-foundation`.

Auditados: schema Prisma, domínio/repositorios/services de Task e Requirement,
projeções e locks de Task movement, módulo S1-07 completo, autorização e CSRF,
storage de evidências, clientes frontend de TestCase/Task/Requirement e documentos
canônicos de histórico, contratos e RF. Task possui `requirementId` singular
opcional. Movimentação já usa Project → Sprint → Task; adotado Project como
serialização comum para Defect, TestCase e reteste.

## B — Invariante TestCase

Antes, criação/edição aceitavam requisito nulo e conjunto vazio de Tasks.
Agora `resolveLinks` valida o estado resultante e retorna
`TEST_CASE_TRACEABILITY_REQUIRED`, sem alterar vínculos, histórico ou versão.
Requirement-only, Task-only e ambos continuam permitidos. A edição de definição
continua versionada. TestCase create/update/delete e execução adquirem Project
antes de TestCase para evitar inversão com os retestes.

Arquivo principal: `backend/src/modules/testCases/services/test-case.service.js`.
Auditoria read-only no banco de desenvolvimento: **1 TestCase não excluído, 0
órfãos**. Não houve reconciliação artificial nem mudança de dados de desenvolvimento.
A nova invariante de create/update não requer migration de dados legados.

## C — Modelo Defect

Entidades: Defect, DefectTask, DefectRetest, DefectHistoryEntry.
Enums: DefectSeverity, DefectStatus, DefectTaskRelationType.

Defect pertence a Project, referencia passo de detecção e responsável obrigatórios,
Requirement opcional, relações N:N de Tasks, retestes e histórico. ID inteiro com
`DEF-id`, createdAt/updatedAt/deletedAt do servidor, revisão otimista e ciclo
corrente positivo. Não há DefectVersion nem entidade CorrectionTask.

Índices cobrem projeto/exclusão/status, projeto/severidade, projeto/responsável,
projeto/requisito e passo de detecção; DefectTask indexa Task/papel e
Defect/papel/ciclo; reteste tem executionId único e Defect/ciclo/id; histórico
indexa Defect/data/id e Project/data. CHECKs protegem revisão/ciclo e papel/ciclo.
FKs críticas usam RESTRICT; actor histórico usa SET NULL.

## D — Detecção histórica

Somente TestExecutionStep persistido FAIL do mesmo projeto pode originar Defect.
PASS/BLOCKED são rejeitados. Vários defeitos no mesmo passo são permitidos.
Candidato usa TestExecution → TestCaseVersion executada, nunca a definição atual,
e inclui referência, ambiente, passos, resultado observado e evidências seguras.
Herança inicial fornece sugestões históricas de Requirement/Tasks; o cliente
confirma os vínculos próprios. Testes alteram título, requisito e Task atuais e
verificam que o candidato mantém a versão executada.

## E — Cardinalidade Task

**Task → Requirement: 0..1, conforme schema real.**
Múltiplos Requirements por Task: **NOT IMPLEMENTED; NOT REQUIRED**.
Nenhuma tabela N:N Task–Requirement ou mudança nessa cardinalidade foi criada.

## F — Rastreabilidade Defect

Requirement singular opcional, ORIGIN Tasks 0–100 únicas e do mesmo projeto.
Obrigatório Requirement OU ao menos uma ORIGIN Task. PUT valida o estado resultante,
não sincroniza TestCase ou outras entidades. Fonte da detecção é imutável.

## G — Correction Tasks

ORIGIN usa sentinela zero, fora dos ciclos. CORRECTION usa ciclo positivo.
Uma Task não pode ter ambos os papéis no mesmo Defect. Relações de ciclos
anteriores permanecem e a mesma Task pode corrigir vários defeitos.

Task existente ou Task nova são aceitas; Task nova usa validação e persistência
canônicas, criação/vínculo/projeção/auditoria na mesma transação. Requirement
omitido herda o do Defect; null explícito permanece null. Inicia A_FAZER.
Falha injetada após Task create comprova rollback da Task e dos registros novos.

Task list/detail/Kanban recebe `correctionDefectCount` e `correctionDefects`
distintos por Defect, incluindo ciclos/defeitos históricos; consulta compartilhada,
sem N+1 por Task. Nenhuma diferenciação visual foi implementada.

## H — Lifecycle

| Correction state       | Defect                          |
| ---------------------- | ------------------------------- |
| none                   | ABERTO                          |
| all TODO               | ABERTO                          |
| mixed / in progress    | EM_CORRECAO                     |
| all DONE, ao menos uma | AGUARDANDO_RETESTE              |
| retest PASS            | VALIDADO                        |
| retest FAIL            | ABERTO, ciclo + 1               |
| retest BLOCKED         | AGUARDANDO_RETESTE, mesmo ciclo |

Somente correções do ciclo corrente participam. PASS explícito mantém VALIDADO
mesmo após alteração posterior de Task compartilhada; novas correções são
rejeitadas nesse estado. `statusReason` inclui contagens e execução validadora.
Status da Task e projeção/histórico dos defeitos afetados são gravados juntos.
Não existe endpoint manual de status.

## I — Reteste

Contexto explícito `{defectId,correctionCycle,expectedRevision}` no payload de
execução S1-07. Exige mesmo TestCase da detecção, ativo, versão atual e correções
concluídas. Reutiliza execução, passos, evidências e cleanup compensatório.
Uma execução normal PASS não valida Defect. FAIL abre ciclo vazio sem reabrir
Tasks antigas; BLOCKED mantém ciclo mas invalida revisão para evitar duplicação.
Referências priorizam PRs/commits persistidos das correções correntes e depois
outros do Project, sem chamada GitHub.

## J — Concorrência

Revisão/ciclo conferidos após locks. Project serializa Defect/Task movement/reteste;
TestCase e execução comum seguem a mesma ordem. Repository de projeção é folha,
sem ciclo entre TaskService e DefectService.

Cobertura inclui movimentos simultâneos de Tasks distintas, correção compartilhada
por vários defeitos, criação concorrente de correção, duplo reteste PASS/FAIL/BLOCKED,
race Task/reteste sob barreira real de Project e edição de TestCase/reteste.
A barreira espera dois callbacks transacionais iniciados antes de liberar o lock;
não usa sleeps. Primeiro commit de reteste vence; a revisão antiga recebe 409.
Estado de detalhe e filtro/listagem é conferido após a corrida.

## K — Autorização

| Papel ativo | Leitura/candidatos/histórico/evidência | Escrita/correção/reteste |
| ----------- | -------------------------------------- | ------------------------ |
| VIEWER      | Permitido                              | 403                      |
| MEMBER      | Permitido                              | Permitido                |
| MANAGER     | Permitido                              | Permitido                |
| OWNER       | Permitido                              | Permitido                |

Sem sessão: 401. Sem membership ativa ou projeto estrangeiro: 404 opaco.
CSRF obrigatório antes do multipart. Responsável requer membership ativa.
Testes cobrem fonte estrangeira, Requirement/Task/responsável estrangeiros e
contexto de reteste em outro TestCase. Não há privilégio exclusivo do criador.

## L — Migrations

Nova migration: `20260908190000_s108_defect_foundation`.
Cadeia completa de **50 migrations aplicada com sucesso em schema vazio**.
Status: **Database schema is up to date**. Nenhuma migration anterior editada.
Nenhuma migration aplicada no banco de desenvolvimento. SQL executado localmente
em MySQL 9.7.1; execução equivalente ao CI 8.4.8 permanece pendente externamente.

## M — Testes

Focados iniciais: **84 PASS** (S1-07/S1-08 antes dos últimos cenários adicionados).
Código final: **673 unitários PASS**, **463 integração/API PASS + 5 skips**.
Suíte completa: **1.136 PASS + 5 skips**, em 89 arquivos com testes e 2 suítes
legadas puladas. Foram adicionados 55 testes S1-08, sem skips novos.
Coverage final: statements **90.81%**, branches
**80.9%**, functions **94.32%**, lines
**93.25%**. Thresholds canônicos: 85 / 70 / 85 / 87%, inalterados.

Comandos executados com Node 22.23.2 e runner que injeta TEST_DATABASE_URL exclusivo:
`vitest run test/unit`, `vitest run test/integration test/api`,
`vitest run --coverage` (equivalentes aos scripts npm canônicos).

Os cinco skips legados pertencem às suítes de reconciliação pré-LR.2
`e6-backfill.test.js` e `e11-legacy-responsibility.test.js`; dependem de schema
histórico incompatível com o banco atual. Nenhum novo skip S1-08.

## N — Repetibilidade

| Rodada | Resultado            | Duração | Statements | Branches | Functions | Lines  |
| ------ | -------------------- | ------- | ---------- | -------- | --------- | ------ |
| 1      | 1.136 PASS + 5 skips | 59.34s  | 90.81%     | 80.9%    | 94.32%    | 93.25% |
| 2      | 1.136 PASS + 5 skips | 60.27s  | 90.8%      | 80.88%   | 94.32%    | 93.25% |
| 3      | 1.136 PASS + 5 skips | 60.31s  | 90.81%     | 80.9%    | 94.32%    | 93.25% |
| 4      | 1.136 PASS + 5 skips | 60.36s  | 90.81%     | 80.9%    | 94.32%    | 93.25% |
| 5      | 1.136 PASS + 5 skips | 60.63s  | 90.81%     | 80.9%    | 94.32%    | 93.25% |

Cinco rodadas consecutivas sobre o código final. Hashes backend confirmados
inalterados durante o fechamento. Logs: `closure-coverage-1.log` a
`closure-coverage-5.log`, no diretório de evidências. Rodadas exploratórias
anteriores não foram usadas para representar o código final.

## O — Gates

| Gate                      | Resultado                                      |
| ------------------------- | ---------------------------------------------- |
| lint                      | PASS                                           |
| format backend            | PASS                                           |
| unit                      | PASS                                           |
| integration/API           | PASS, 5 skips legados                          |
| coverage                  | PASS, cinco rodadas                            |
| Prisma validate/generate  | PASS                                           |
| migration empty DB/status | PASS, 50 migrations                            |
| architecture              | PASS                                           |
| secrets                   | PASS, 463 arquivos verificados                 |
| supply chain              | NOT APPLICABLE, dependências inalteradas       |
| git diff --check          | PASS                                           |
| CI remoto/MySQL 8.4.8     | NÃO EXECUTADO; evidência local não o substitui |

Dependências/lockfiles não foram alterados; policy de supply chain condicional
não é aplicável nesta alteração. Não houve relaxamento de gates, thresholds,
autorização, limites de upload ou retries artificiais para esconder falhas.

## P — RF Matrix

RF42 mantém entrega S1-07 e ganha invariante backend de rastreabilidade. RF45,
RF46, RF63 e RF64 registram fundação backend parcial; nenhum é promovido a RF
completo por esta entrega. A matriz aponta código, testes e a pendência de UX.
S1-09/rastreabilidade consolidada não foi entregue.

## Q — Frontend

- Defect frontend: **NOT IMPLEMENTED IN THIS PHASE**.
- Correction Task visual differentiation: **NOT IMPLEMENTED IN THIS PHASE**.
- Task → Create TestCase: **NOT IMPLEMENTED IN THIS PHASE**.
- Requirement → Create TestCase: **NOT IMPLEMENTED IN THIS PHASE**.

Nenhum arquivo frontend foi alterado. Não se declara homologação visual.

## R — Git final e preservação

HEAD final igual ao baseline: `15b718b6d9ae8073b074db335fba13862e779e6f`.
Hashes confirmam frontend, workflows CI, manifests/lockfiles e todas as migrations
anteriores intactos. Alterações restritas a backend S1-08, seams de Task/TestCase,
testes e documentos listados abaixo. Working tree preservado para revisão:

```text
 M backend/prisma/schema.prisma
 M backend/src/modules/authorization/authorization.repository.js
 M backend/src/modules/authorization/authorization.service.js
 M backend/src/modules/tasks/repositories/task-movement.repository.js
 M backend/src/modules/tasks/services/task-crud.service.js
 M backend/src/modules/tasks/task.repository.js
 M backend/src/modules/tasks/task.service-support.js
 M backend/src/modules/testCases/repositories/test-case.repository.js
 M backend/src/modules/testCases/repositories/test-execution.repository.js
 M backend/src/modules/testCases/services/test-case.service.js
 M backend/src/modules/testCases/services/test-execution.service.js
 M backend/src/modules/testCases/test-case.schema.js
 M backend/src/routes/index.js
 M backend/test/api/test-cases-s1-07.test.js
 M backend/test/helpers/test-database.js
 M backend/test/integration/test-cases-s1-07.test.js
 M docs/api/API_CONTRACTS.md
 M docs/data/TEST_CASE_HISTORY.md
 M docs/security/AUTHORIZATION_MATRIX.md
 M docs/traceability/RF_TECHNICAL_MATRIX.md
?? backend/prisma/migrations/20260908190000_s108_defect_foundation/
?? backend/src/modules/defects/
?? backend/test/api/defects-s1-08.test.js
?? backend/test/integration/defects-s1-08.test.js
?? backend/test/unit/defects/
?? docs/data/DEFECT_HISTORY.md
?? docs/deliveries/S1_08_BACKEND_FOUNDATION_REPORT.md
```

`git diff --check`: PASS. Schema descartável removido e ausência confirmada;
MySQL observado no encerramento: `9.7.1`.
Somente o schema criado para esta execução foi removido. Logs de evidência locais
foram mantidos; nenhuma credencial é registrada no relatório.

## S — Operações Git

**NO COMMIT · NO PUSH · NO MERGE · NO REBASE · NO RESET.**
Também não houve clean, stash ou alteração de PR. CI remoto não foi executado.

## Evidências e próximo passo

Logs locais e hashes de baseline: `/private/tmp/traceflow-s108-foundation`.
Contratos: [API](../api/API_CONTRACTS.md), [autorização](../security/AUTHORIZATION_MATRIX.md),
[histórico de Defect](../data/DEFECT_HISTORY.md),
[TestCase](../data/TEST_CASE_HISTORY.md), [matriz RF](../traceability/RF_TECHNICAL_MATRIX.md).

Após os gates locais, próximo passo é a integração frontend S1-08 em rodada própria,
com validação visual e CI remoto separados desta evidência backend.
