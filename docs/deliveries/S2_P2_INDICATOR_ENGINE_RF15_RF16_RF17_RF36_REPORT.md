# S2 P2 — Indicator Engine e RF15/RF16/RF17/RF36

## 1. Baseline

P2 começou em `daniel-dev`, HEAD `a355b615fb6cd752dd333e6ed200c200bb92da24`, working tree limpa e `git diff --check` vazio. Shell padrão Node 26.9.0; implementação e gates usam Node 22.23.3. Prisma `6.12.0`. O P0/P1 já estava versionado. Nenhum commit, push, merge, rebase, reset, clean ou stash faz parte desta rodada.

## 2. Arquitetura

O módulo `backend/src/modules/indicators/` segue Route → Controller → Service → Repository → Prisma/MySQL. Repository lê fatos em transações read-only `RepeatableRead`; calculators são puros; service aplica período, estados e composição; mapper monta `IndicatorResult`. A função `traceability.calculator.buildMetric` foi auditada: ela serve a DTOs de Traceability/Sprint e carrega `percentage/hasData` próprios. P2 usa cálculo puro independente para não acoplar Indicators a Traceability nem mudar contratos antigos. Não há schema, migration, cache ou frontend novo.

## 3. Contrato de resultado

Metadata central I01/I02/I03/I05, `definitionVersion:1`, RF, categoria, título, descrição, unidade, tipo temporal, relógio e filtros. Todo `IndicatorResult` contém valor numérico ou vetor, N/D quando aplicáveis, período/escopo, `asOf`, fonte, fórmula, estado e limitações. Os endpoints e exemplos estão em [API Contracts](../api/API_CONTRACTS.md). Não há score nem ranking de pessoas.

## 4. RF15 / I01

`GET /api/projects/:projectId/indicators/progress` agrega `Task.status` atual do projeto em uma consulta `groupBy`; numerador é `CONCLUIDO`, denominador é total de Tasks. Sem Tasks: `value:null`, `denominator:0`, `NO_DATA`. Com Tasks e zero concluídas: `value:0`, `AVAILABLE`. Percentual é número arredondado a duas casas. `period:null`; `Task.createdAt/updatedAt` não são usados como histórico.

## 5. RF16 / I02

`GET /api/projects/:projectId/indicators/activity` conta `DISTINCT Commit.id` com `Commit.date` no período e `CommitBranch.lastObservedGeneration` igual à fotografia confirmada de `GitBranch.name='main'`. `isDefault` não substitui `main`. Autoria por `Commit.authorGithubUserId = GitHubIdentity.githubUserId` e membership atual ativa; nenhum nome, e-mail ou login é usado para associar. Sem `main`/generation confirmada: `UNAVAILABLE` e valor `null`. Autores não resolvidos entram no total e no grupo `unassociated`; distribuição parcial não é ocultada. Login renomeado não altera a associação por ID estável.

## 6. RF17 / I03

A consulta SQL seleciona conclusões `TaskMovement.toStatus='CONCLUIDO'` dentro do período e exclui cada candidata se houver movimento posterior da mesma Task antes do corte `endExclusive` (desempate por ID). Isso entrega uma Task no máximo uma vez, pela última conclusão ainda vigente no corte D03. A pessoa é o `responsibleUserIdSnapshot` do evento, jamais `Task.responsibleUserId` atual. Snapshot legado nulo e pessoa não resolvível são contabilizados como não associados e causam `PARTIAL`. Hard delete anterior remove movimentos pela política existente e não pode ser reconstruído.

## 7. RF36 / I05

O resultado combina I02 e I03 num vetor `{completedTasks,commits}` por pessoa com fatos, mais contagens não associadas por dimensão. Só usa membership atual; não afirma quem era membro “ativo no período”. Se a `main` está indisponível, `commits:null` também nas linhas de pessoa. Os estados e limitações de cada componente ficam explícitos. Nenhuma soma heterogênea, score ou ranking é criada. Volume de atividade não é avaliação humana.

## 8. Período e timezone

`startDate`/`endDate` são dias civis inclusivos com `timeZone` IANA explícito obrigatório. Uma busca pela primeira fração de milissegundo de cada dia no fuso converte para instantes UTC `[startInclusive,endExclusive)`; ela cobre dias de 23 e 25 horas, inclusive mudança à meia-noite. RF16 usa `Commit.date`; RF17 usa `TaskMovement.movedAt`. A validação rejeita data inexistente, intervalo invertido e timezone inválido com 400. Não há timezone implícito do servidor.

## 9. Estados dos dados

`AVAILABLE`: fonte suficiente, inclusive contagem zero medida. `NO_DATA`: universo da razão vazio (I01 0/0). `PARTIAL`: valor conhecido com identidade/responsável incompleto ou agregado com uma dimensão indisponível. `STALE`: última fotografia GitHub calculável com sync falho, integração desconectada ou head divergente; limitações preservam lacunas adicionais. `UNAVAILABLE`: não há `main` observável ou fotografia P1 confirmada. I03 permanece local mesmo quando GitHub falha.

## 10. Freshness

I02/I05 expõem `sourceUpdatedAt` (`lastSyncAt`), `sourceSyncStatus` e limitações da integração/branch. Nenhum limiar de horas foi inventado. A última fotografia é preservada quando o sync falha; não há fallback para branch default nem dados inferidos.

## 11. Autorização e privacidade

Middleware existente exige sessão, membership ativa e projeto não excluído. `VIEWER` pode ler; projeto alheio ou soft-deleted recebe 404 opaco; sem sessão recebe 401. A resposta pública usa `userId` e `displayName` apenas para pessoas resolvíveis, sem e-mail, GitHub user ID ou login. Unlink/anonimização não recriam identidade via nome. P2 não persiste nova categoria de dado pessoal; o inventário P1 continua aplicável.

## 12. Performance

O repository faz duas consultas de dados para I01 (Project e `Task.groupBy`) e até quatro para I02/I03/I05 juntos (Project, branch, agregação de commits e agregação de movimentos), independentemente do número de pessoas, Tasks ou Commits. RF16 usa `COUNT(DISTINCT c.id)` no banco; RF17 usa anti-join indexável por Task, sem consulta por Task. `EXPLAIN` read-only no projeto local 2 mostrou `CommitBranch_branchId_idx` e lookup de Commit por PRIMARY; para RF17, scan de 31 movimentos na tabela pequena e `TaskMovement_taskId_movedAt_idx` no anti-join. Membership usa `(projectId,userId)`; Users usam PRIMARY. Leitura local aproximada: I01 2,1 ms; activity 3,0 ms, neste último caso sem generation da main confirmada e portanto sem executar o SELECT de commits. Amostra pequena não justifica índice/migration. Reavaliar com volume real.

## 13. Testes

Testes puros cobrem 0/0, zero medido, arredondamento, DST, associação e frescor. API persistida cobre dois projetos 40%/100%, atualização de estado, main literal com default develop, generation, DISTINCT e período, autoria por ID, desconhecidos, conclusão vigente/reabertura/snapshot, bordas UTC, RF36 com duas pessoas e grupos desconhecidos, cinco estados, VIEWER, 401/404 e validação 400.

| Gate | Resultado local |
|---|---|
| Focado P2 | 11 testes PASS. |
| Backend unit | 796 PASS. |
| Backend integração/API | 568 PASS; 5 skips preexistentes. |
| Backend full com coverage | 1.364 PASS; 5 skips preexistentes; 91,06% statements, 93,64% lines. |
| Backend lint/format, Prisma validate/generate, arquitetura | PASS. |
| Frontend full com coverage | 1.231 PASS; 83,84% statements, 86,27% lines. |
| Frontend lint/format/build | PASS; build com avisos preexistentes de IIFE/chunk. |
| CI validation e `git diff --check` | PASS. |

Uma tentativa de `test:unit` no sandbox falhou em 28 casos HTTP por `listen EPERM 127.0.0.1`; a reexecução fora dele passou integralmente. Os gates de banco usam somente `traceflow_test`, separado do desenvolvimento. A medição `EXPLAIN` no schema local de desenvolvimento fez apenas leituras; nenhuma escrita de P2 foi aplicada a ele.

## 14. Documentação

[Catálogo](../indicators/S2_INDICATOR_CATALOG.md) atualizado somente para I01/I02/I03/I05; [matriz RF](../traceability/RF_TECHNICAL_MATRIX.md) marca a capacidade backend como implementada e o fluxo completo como parcial até visualização. [API Contracts](../api/API_CONTRACTS.md) descreve endpoints, DTO, estados e período. S2-04 e S2-05 continuam abertos.

## 15. Lacunas

Não há RF18/RF54, analytics de Flow/Sprint/Quality, filtros de Sprint, Dashboard, gráficos, relatórios nem PDF. Membership histórica “ativo no período” não é reconstruída. Dados legados sem snapshot e Tasks fisicamente excluídas limitam RF17. Main sem sync P1 completo limita RF16. Validação GitHub externa e medição com volume representativo seguem pendentes.

**Resultado: S2 P2 INDICATOR ENGINE + RF15/RF16/RF17/RF36 — PASS LOCAL.** A capacidade backend está implementada e testada; a matriz RF mantém os fluxos completos como parciais até a visualização. S2-04 e S2-05 continuam abertos.

Mensagem de commit sugerida: `feat: add indicator engine and core project metrics`.
