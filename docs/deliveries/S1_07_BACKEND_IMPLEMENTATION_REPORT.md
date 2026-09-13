# TRACEFLOW S1-07 — BACKEND IMPLEMENTATION REPORT

Entrega local em 07/09/2026: backend persistido de casos de teste, versionamento,
execução e evidências privadas. **RF42: BACKEND COMPLETE / FRONTEND PENDING.**
Não houve integração do frontend, início de S1-08/S1-09 ou publicação Git.

## A. Git baseline

- Branch: `daniel-dev`.
- HEAD: `b5732ca41cf66b1520e46edbb07c9d4c2d59ed16`.
- Working tree inicial: frontend/protótipo já modificado e arquivos novos de protótipo.
  Nenhum arquivo backend modificado na chegada.
- Baseline de 854 caminhos capturada em `/tmp/traceflow-s107-backend-baseline`:
  HEAD, status, diff binário e SHA-256 dos arquivos, incluindo ausências/deleções.

## B. Estado da base

PR #19 consultada ao vivo: OPEN, base `main`, head `gt-dev`, SHA
`6df854eaefb153a448c62635084036688a69e3e1`, sem mergedAt. S1-06 não foi integrado.
Task continua com `estimatedEffort Int?` e `actualEffort Int?`, sem TaskTimeEntry.
Nenhum checkout/cherry-pick/merge da PR foi realizado.

O frontend do protótipo, sua extração de SearchCombobox e os documentos históricos
em `docs/design/prototypes` foram preservados byte a byte. Conferência de hashes:
380 caminhos de frontend/protótipo/migrações anteriores, zero divergências.
As demais mudanças desta entrega pertencem ao backend, configuração e documentos técnicos.

## C. Schema

Sete enums: TestCaseStatus, TestResult, TestEnvironment, TestedReferenceType,
TestEvidenceScope, TestEvidenceKind e TestCaseHistoryAction.

Oito modelos: TestCase, TestCaseStep, TestCaseTask, TestCaseVersion,
TestCaseHistoryEntry, TestExecution, TestExecutionStep e TestEvidence.

Relações: Project obrigatório; responsável User; Requirement opcional singular;
Tasks N:N por join tipado; versões, histórico, execução/passos e evidências com FKs.
Execução referencia uma versão e exatamente um PR ou Commit importado; autoria
canônica por User, com nomes capturados para exibição histórica. IDs de autor
histórico suportam SET NULL, sem eliminar registros. Responsável permanece ligado
à conta pseudonimizada. Não foram criados vínculos genéricos ou modelos de defeito.

Índices: TestCase por projeto/deletedAt/status, responsável, requisito e createdAt;
passos únicos por caso/posição; join único caso/Task e índice Task; versão única
caso/número e índice de criação; execução por caso/horário/id, projeto/horário,
caso/resultado e FKs de PR/Commit; passo de execução único execução/posição;
evidência por execução/passo/projeto e storageKey único; histórico por
caso/occurredAt/id e projeto/occurredAt.

CHECKs físicos: referência principal XOR com discriminator, e scope da evidência
compatível com presença/ausência de executionStepId. Service garante projeto e
pertencimento do passo à execução. A política de deleção impede cascade destrutivo
do caso sobre versões/execuções/evidências.

## D. Migration

`backend/prisma/migrations/20260907120000_s1_07_test_cases/migration.sql`.
Migração aditiva, sem alterar tabelas históricas existentes; FKs reversas no schema
não acrescentam colunas a Task/Requirement/Project/User.

Validações locais:

- Cadeia anterior de 48 migrações em schema exclusivo vazio.
- Registro sentinela anterior: Task com estimatedEffort=8 e actualEffort=3.
- Aplicação incremental S1-07, preservando valores e registro sentinela.
- Cadeia completa de 49 migrações em outro schema temporário vazio, removido pelo
  validador após confirmação.
- Status final: 49 migrações, schema atualizado.

MySQL observado: **9.7.1 local**. SQL usa recursos compatíveis com a linha MySQL 8.4,
mas não houve execução em **MySQL 8.4.8 da CI**: essa equivalência permanece pendente.
Schema principal `traceflow` e banco compartilhado `traceflow_test` não receberam a
migração nem cleanup; os testes usaram `traceflow_s107_20260907_test` exclusivo.

**NO RESET. NO OLD MIGRATION EDIT.** Migrações anteriores preservadas por hash.

## E. TestCase domain

ATIVO/INATIVO, ambos reversíveis; inativo continua editável e consultável, sem executar.
Responsável obrigatório segue a política canônica de membership ativa de Task.
Passos obrigatórios, ordenados, posições calculadas pelo backend. Limites centralizados:
título 200, descrição 10.000, pré-condições/resultado geral 20.000, ação/resultado por
passo 10.000; 1–100 passos e 0–100 Tasks únicas do mesmo projeto.
Requirement opcional do mesmo projeto; combinação inválida reverte toda a criação.
Exclusão lógica preserva filhos e retira o caso das rotas operacionais.

## F. Versioning

currentVersion inicia em 1; snapshotVersion/schemaVersion = 1.
Snapshot autocontido inclui definição textual, requisito id/título, Tasks id/título
e passos com posição/ação/resultado esperado. Não depende de lookups atuais.

Mudanças de definição criam versão. Ordem de passos importa, ordem do conjunto de
Task IDs não; no-op normalizado, status e responsável não criam versão.
PUT parcial e PATCH status exigem expectedVersion, comparado sob lock da linha.
Conflito: `409 TEST_CASE_VERSION_CONFLICT`. Não há substituição de versão antiga.

## G. Execution

Executor vem da sessão, não precisa ser o responsável; MEMBER/MANAGER/OWNER podem
executar. Timestamp é do banco. Ambiente LOCAL/DESENVOLVIMENTO/HOMOLOGACAO.
PR XOR Commit importado do mesmo projeto, FK real e snapshot minimizado sem e-mail.
Todos os passos da versão exatamente uma vez; FAIL/BLOCKED exigem observação.
Resultado agregado deriva de FAIL > BLOCKED > PASS.

O cenário auditável completo foi exercitado no banco de teste: versão 3, executor
“Daniel”, ambiente HOMOLOGACAO, PR #91, cinco passos PASS, PNG no passo 3, MP4 real no
passo 5 e response.json geral. Após mudar caso para v4, estado do PR, títulos de
Task/Requirement e nome do usuário, o DTO histórico permaneceu idêntico.
Os IDs são gerados pelo banco; os exemplos TC-15/EXEC-0038 do briefing não foram
forçados. Fixtures são descartáveis e limpas após cada teste.

## H. Evidence

Adapter específico TestEvidenceStorage / LocalTestEvidenceStorage; sem Prisma no
storage e sem filesystem no controller. Diretório privado configurável, absoluto
obrigatório em produção, sem fallback público. Desenvolvimento em caminho ignorado.
UUID privado, modos 0700/0600, proteção contra traversal/symlink, SHA-256 dos bytes.

Passo: PNG/JPG/JPEG/WEBP/MP4/WEBM/MOV. Geral também PDF/TXT/LOG/JSON.
Validação de extensão + assinatura real; MIME recebido é ignorado. JSON parseável,
texto UTF-8 sem controles binários. Não constitui antivírus/decodificação completa.

Limites inclusivos: não vídeo 10 MiB, vídeo 50 MiB, 3 por passo, 5 gerais, 20 totais,
100 MiB agregados; configuração pode reduzir os tetos. Parser limita campos/partes
e payload; contador limita bytes durante streaming. Teste aceita exatamente 20
arquivos e recusa o 21º sem persistência parcial.

Staging/validação/hash/promoção precedem o lock; transação persiste execução, passos,
metadata e AuditEvent. Falha conhecida compensa arquivos daquela tentativa. Queda
abrupta pode deixar órfãos; não há atomicidade distribuída nem coletor automático.
Download privado autoriza VIEWER+ e envia attachment, Content-Length, MIME validado
e nosniff; DTO/header não expõe storageKey/caminho. Sem Range de vídeo.

Dependências adicionadas, fixadas e verificadas com Node 22: Multer 2.3.0 e file-type
22.0.2. A escolha de Multer considera o [aviso oficial de agosto de 2026](https://expressjs.com/en/blog/2026-08-31-security-releases/).
Nenhuma entrada de dependência preexistente no lockfile foi alterada. A fixture MP4
vem do repositório file-type v22.0.2, com origem/licença junto ao arquivo.

## I. API

| Method | Endpoint (prefixo `/api`)           | Purpose                                      |
| ------ | ----------------------------------- | -------------------------------------------- |
| GET    | `/projects/:projectId/test-cases`   | lista paginada, filtros e summary do projeto |
| POST   | `/projects/:projectId/test-cases`   | cria caso e v1                               |
| GET    | `/test-cases/:id`                   | detalhe corrente e capabilities              |
| PUT    | `/test-cases/:id`                   | edição parcial com expectedVersion           |
| DELETE | `/test-cases/:id`                   | soft delete, 204                             |
| PATCH  | `/test-cases/:id/status`            | status com expectedVersion                   |
| GET    | `/test-cases/:id/versions`          | versões paginadas e snapshots                |
| GET    | `/test-cases/:id/history`           | histórico funcional com cursor               |
| GET    | `/test-cases/:id/executions`        | execuções com cursor                         |
| POST   | `/test-cases/:id/executions`        | execução multipart atômica                   |
| GET    | `/test-cases/:id/tested-references` | candidatos importados, relacionados primeiro |
| GET    | `/test-executions/:id`              | detalhe histórico autocontido                |
| GET    | `/test-evidence/:id/content`        | download privado autorizado                  |

Contrato completo e exemplos em [API_CONTRACTS.md](../api/API_CONTRACTS.md).
Listas/cards limitam consultas e agregam no banco: último resultado por
executedAt/id; summary independente dos filtros. Referências usam consultas limitadas,
sem N+1 de artefatos nem varredura de todos os commits relacionados.

## J. Authorization

| Operation | VIEWER   | MEMBER          | MANAGER         | OWNER           |
| --------- | -------- | --------------- | --------------- | --------------- |
| List      | sim      | sim             | sim             | sim             |
| Details   | sim      | sim             | sim             | sim             |
| Create    | 403      | sim             | sim             | sim             |
| Update    | 403      | sim             | sim             | sim             |
| Status    | 403      | sim             | sim             | sim             |
| Delete    | 403      | sim             | sim             | sim             |
| Execute   | 403      | sim             | sim             | sim             |
| History   | sim      | sim             | sim             | sim             |
| Evidence  | download | upload/download | upload/download | upload/download |

Anônimo 401; membership ausente/inativa ou recurso alheio 404 opaco. CSRF em toda
mutation, antes do parser. IDs de caso/execução/evidência resolvem Project antes de
autorizar. Service revalida membership; autor e horário do cliente são recusados.

## K. Concurrency

Sete cenários determinísticos com transação MySQL e barreiras de promises, sem sleeps:

| Corrida                      | Resultado                                |
| ---------------------------- | ---------------------------------------- |
| duas edições v1              | uma v2 confirmada, outra 409             |
| update antes de execução     | execução stale 409, nenhuma linha criada |
| execução antes de update     | execução v1 preservada, definição avança |
| delete antes de execução     | execução 404, nenhuma linha criada       |
| execução antes de delete     | execução histórica preservada            |
| inativação antes de execução | execução 409                             |
| execução antes de inativação | execução confirmada preservada           |

As mutações compartilham o lock do caso; upload/hashing não o retêm.

## L. History

TestCaseHistoryEntry registra eventos funcionais mínimos. TestCaseVersion preserva
definição. TestExecution registra ocorrência e referência técnica. AuditEvent mantém
trilha transversal minimizada e retenção própria, pelo adapter canônico.
Excluir caso não elimina essas trilhas nem os resultados/evidências.

## M. Privacy

Inventário atualizado para responsável, criador/ator, executor, nome capturado,
uploader, conteúdo e metadata dos arquivos. Retenção técnica pelo ciclo do projeto,
sem expurgo automático novo e sem conclusão jurídica.

Exportação ZIP acrescenta arquivos JSON próprios de responsabilidade, execução e
metadata de upload, somente em projetos com membership ativa. Não exporta bytes,
paths, storageKey ou detalhes desnecessários de terceiros.

Anonimização neutraliza nome capturado do executor e nomes de mudanças de responsável
com ID conhecido, mantendo conta pseudonimizada e histórico técnico. Conteúdo livre,
nomes de arquivos e identidade externa de Commit podem exigir revisão humana; não
há promessa de eliminação universal de PII. Política documenta essa exceção à
imutabilidade de nomes, impacto em backup e reconciliação de órfãos.

## N. Tests

- Unit: **634 PASS**.
- Integration/API: **434 PASS + 5 skips legados**.
- Focados S1-07: **120 PASS** (80 unit, 29 integração, 11 API).
- Suíte completa: **1.068 PASS + 5 skips**, 87 arquivos (85 executados e 2 legados).
- Novo skip: **zero**.

Skips anteriores preservados: quatro testes em
`test/integration/e11-legacy-responsibility.test.js` (reconciliação pré-LR.2), um em
`test/integration/e6-backfill.test.js` (backfill pré-LR.2). Nenhum foi convertido em PASS.

Tentativas diagnósticas: um teste novo inicialmente dependia do env de storage
herdado; a fixture de configuração ausente foi corrigida para representar ausência
explícita. Uma tentativa completa posterior teve `Error: aborted` num teste legado
de Settings (`DELETE /settings/security/sessions/not-a-uuid`); todos os 120 testes
S1-07 passaram nela. A suíte Settings isolada passou com 21 testes, sem alteração de
código legado. A sequência final de cobertura foi reiniciada; ver tabela abaixo.

## O. Coverage repeatability

| Run | Resultado                          | Statements | Branches | Functions |  Lines |
| --- | ---------------------------------- | ---------: | -------: | --------: | -----: |
| 1   | PASS — 1068 pass + 5 skips legados |     90.71% |   80.43% |    94.49% | 93.15% |
| 2   | PASS — 1068 pass + 5 skips legados |     90.71% |   80.43% |    94.49% | 93.15% |
| 3   | PASS — 1068 pass + 5 skips legados |     90.71% |   80.43% |    94.49% | 93.15% |
| 4   | PASS — 1068 pass + 5 skips legados |     90.69% |   80.41% |    94.49% | 93.15% |
| 5   | PASS — 1068 pass + 5 skips legados |     90.71% |   80.43% |    94.49% | 93.15% |

Limites exigidos: statements 85%, branches 70%, functions 85%, lines 87%.
Todas as cinco rodadas ultrapassaram os quatro limites. Node 22.23.2.

Logs locais: `/tmp/traceflow-s107-coverage-{1..5}.log`; resultados JSON:
`/tmp/traceflow-s107-suite-{1..5}.json`; resumos de cobertura preservados por rodada.
Tentativa interrompida preservada separadamente em
`/tmp/traceflow-s107-coverage-aborted.log`, sem contar como rodada aprovada.

## P. Gates

| Gate               | Resultado                                                         |
| ------------------ | ----------------------------------------------------------------- |
| lint               | PASS — npm run lint                                               |
| format             | PASS — npm run format:check (backend)                             |
| Prisma format      | PASS — prisma format                                              |
| Prisma validate    | PASS                                                              |
| Prisma generate    | PASS — Prisma Client 6.12.0                                       |
| migration empty DB | PASS — cadeia completa 49 migrations                              |
| migration status   | PASS — 49, schema atualizado                                      |
| unit               | PASS — npm run test:unit: 634                                     |
| integration/API    | PASS — npm run test:integration: 434 + 5 skips legados            |
| coverage           | PASS — cinco rodadas consecutivas, 1068 + 5 skips em cada         |
| architecture       | PASS — nenhuma violação                                           |
| secrets            | PASS — 445 arquivos                                               |
| npm audit policy   | PASS — 0 high/critical, sem exceções novas; teste da política 5/5 |
| git diff --check   | PASS                                                              |

A política npm passou sem exceções novas: zero high/critical. O relatório npm
observou três ocorrências moderate na cadeia preexistente Express/body-parser/qs;
nenhuma foi introduzida pelas dependências novas nem coberta por exceção automática.
Gates são locais. Não houve push nem nova execução de CI remota.

## Q. Documentation

- `docs/api/API_CONTRACTS.md`
- `docs/security/AUTHORIZATION_MATRIX.md`
- `docs/security/ASVS_BASELINE.md`
- `docs/privacy/PERSONAL_DATA_INVENTORY.md`
- `docs/privacy/DATA_RETENTION_POLICY.md`
- `docs/architecture/SYSTEM_ARCHITECTURE.md`
- `docs/traceability/RF_TECHNICAL_MATRIX.md`
- `TRACEFLOW_ROADMAP_INCREMENTAL.md` (somente checklist/estado técnico S1-07)
- `docs/data/TEST_CASE_HISTORY.md` (novo)
- este relatório, configuração `.env.example` e origem/licença da fixture MP4.

Documentos oficiais do TCC não foram alterados.

## R. RF status

- **RF42: BACKEND COMPLETE / FRONTEND PENDING**; estado global PARCIAL.
- **RF43 e RF62: PARCIAL**; relações tipadas backend implementadas, integração e fluxo
  final pendentes. Não são declarados RFs completos.
- **RF44: NÃO IMPLEMENTADO** como rastreabilidade consolidada. Tested references e
  snapshot de execução não equivalem ao RF.
- Card S1-07 permanece aberto até frontend integrado e sua validação.

## S. Frontend impact

**Frontend implementation: UNCHANGED.** Hashes dos arquivos preexistentes preservados,
inclusive protótipo não integrado e mudanças anteriores em Schedule/SearchCombobox.
Nenhuma chamada HTTP nova foi adicionada ao frontend.

## T. Defects

**S1-08: NOT IMPLEMENTED.** FAIL não cria defeito. Sem Bug/Defect, ciclo de reteste,
CRUD, severity ou ligação de defeitos.

## U. Global traceability

**S1-09: NOT IMPLEMENTED.** Sem expansão de matriz, grafo global ou vínculos genéricos.

## V. Git final

`git rev-parse HEAD`: `b5732ca41cf66b1520e46edbb07c9d4c2d59ed16`. Branch `daniel-dev`.
`git diff --check`: PASS (sem saída).

`git status --short`:

```text
 M .gitignore
 M TRACEFLOW_ROADMAP_INCREMENTAL.md
 M backend/.env.example
 M backend/package-lock.json
 M backend/package.json
 M backend/prisma/schema.prisma
 M backend/src/modules/audit/audit.service.js
 M backend/src/modules/authorization/authorization.repository.js
 M backend/src/modules/authorization/authorization.service.js
 M backend/src/modules/privacy/privacy.repository.js
 M backend/src/modules/settings/settings.repository.js
 M backend/src/modules/settings/settings.service.js
 M backend/src/routes/index.js
 M backend/src/shared/security/body.js
 M backend/test/helpers/test-database.js
 M docs/api/API_CONTRACTS.md
 M docs/architecture/SYSTEM_ARCHITECTURE.md
 M docs/privacy/DATA_RETENTION_POLICY.md
 M docs/privacy/PERSONAL_DATA_INVENTORY.md
 M docs/security/ASVS_BASELINE.md
 M docs/security/AUTHORIZATION_MATRIX.md
 M docs/traceability/RF_TECHNICAL_MATRIX.md
 M frontend/src/app/routes/AppRoutes.jsx
 M frontend/src/features/projects/components/ProjectSectionNav.jsx
 M frontend/src/features/schedule/components/MilestoneFilters.jsx
 M frontend/src/features/schedule/components/MilestoneSprintSelector.jsx
 D frontend/src/features/schedule/components/SearchCombobox.jsx
 M frontend/src/features/schedule/components/SprintActionsMenu.jsx
 M frontend/src/features/schedule/components/SprintFilters.jsx
 M frontend/src/features/schedule/components/SprintForm.jsx
 M frontend/src/features/schedule/components/SprintTaskSelector.jsx
 M frontend/src/features/schedule/index.js
 M frontend/src/features/schedule/pages/MilestonesScreen.css
 M frontend/src/features/schedule/pages/SprintsScreen.css
 M frontend/src/shared/index.js
 M frontend/test/components/SearchCombobox.test.jsx
 M frontend/test/pages/ProjectDetailsPage.test.jsx
?? backend/prisma/migrations/20260907120000_s1_07_test_cases/
?? backend/src/modules/testCases/
?? backend/test/api/test-cases-s1-07.test.js
?? backend/test/fixtures/test-evidence/
?? backend/test/integration/test-cases-s1-07.test.js
?? backend/test/unit/test-cases/
?? docs/data/TEST_CASE_HISTORY.md
?? docs/deliveries/S1_07_BACKEND_IMPLEMENTATION_REPORT.md
?? docs/design/prototypes/
?? frontend/src/features/test-cases-prototype/
?? frontend/src/pages/TestCasesPrototypePage.jsx
?? frontend/src/shared/components/SearchCombobox.css
?? frontend/src/shared/components/SearchCombobox.jsx
?? frontend/test/test-cases-prototype/
```

Os caminhos frontend e docs/design/prototypes acima já estavam presentes no baseline;
não representam alterações feitas nesta implementação backend.

**NO COMMIT · NO PUSH · NO MERGE · NO REBASE · NO RESET.**
Também não houve force-push, clean ou stash. Alterações permanecem locais para revisão.
