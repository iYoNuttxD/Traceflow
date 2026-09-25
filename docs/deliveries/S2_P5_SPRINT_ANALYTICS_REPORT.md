# S2 P5 — Sprint Analytics — relatório local

## 1. Baseline

Início em `daniel-dev`, HEAD `5d3973a231d61c03e18725507ee2c2ee3afc929b`, working tree limpa, `git diff --check` e `git diff --stat` vazios. Node 22.23.3 e Prisma 6.12.0. Sem commit, push, merge, rebase, reset, clean ou stash.

## 2. Scope

Backend I36–I47/I71–I72 em `GET /api/projects/:projectId/indicators/sprints`. Não houve frontend, gráfico, painel, cache, migration ou alteração de schema. I46 tem contrato e resultado indisponível honesto. S2-04/S2-05 permanecem abertos; P6–P10 não foram iniciados.

## 3. Canonical Sprint owners reused

O Indicator Engine reutiliza `sprintProgressService.getSprintIndicatorFacts`, que executa os owners existentes `buildSprintProgress`, `buildSprintEffort`, `buildSprintBurndown` e `buildSprintHistoricalSummary` uma vez para a Sprint selecionada. O endpoint `/sprints/:id/progress` continua retornando o mesmo bloco canônico. `buildSprintAnalyticsFacts` apenas adapta fatos de pontos/participações dentro do domínio de Sprint. Velocity chama `buildSprintHistoricalSummary` por Sprint sobre dados obtidos em lote, sem consulta por Sprint.

## 4. Current vs frozen semantics

`PLANEJADA`/`EM_ANDAMENTO` usam dados operacionais quando a ficha permite. `CONCLUIDA`/`CANCELADA` usam `SprintTask` e snapshots de fechamento para pontos, status, esforço e burndown. `Task.status`, `estimatedEffort`, `actualEffort` e `sprintId` vivos não são autoridade terminal. Sem `sprintId`, seleciona-se apenas a única Sprint `EM_ANDAMENTO`; ausência retorna `NO_DATA` e múltiplas ativas retornam `UNAVAILABLE`, sem escolha arbitrária.

## 5. I36–I40

I36/I39 usam `plannedAtStart`/`pointsAtPlanning` e o marcador `planningSnapshotAt`; sem baseline, não há plano inferido. I37 usa escopo operacional atual ou `historicalSummary.totalPoints` terminal. I38 usa pontos concluídos no estado aberto ou `historicalSummary.completedPoints` terminal. I40 usa o numerador canônico de progresso aberto ou `historicalSummary.completedTasks` terminal. “Pontos” públicos são horas de estimativa, não story points.

## 6. Scope change I41/I42

I41/I42 reutilizam exatamente `progress.scopeChange.added/removed`: participações atuais adicionadas depois do início e participações planejadas removidas. I71 apresenta as duas contagens e `changed`, sem score. O modelo reativa a mesma linha de participação e pode colapsar eventos intermediários; `SCOPE_REENTRY_EVENTS_COLLAPSED` acompanha o contrato. Baseline legado ausente gera `PARTIAL` nos números aproximados e `UNAVAILABLE` em I36/I39.

## 7. Carry-over I43/I72

I43 devolve `{incoming,outgoing}` e itens mínimos com origem/destino da transferência. A origem terminal não é reescrita. I72 conta apenas participações correntes herdadas de outra Sprint; terminal recebe `NO_DATA` por ser fotografia atual. Reentradas antigas podem ter colapsado parte da história de carry-over, explicitada em `limitations`.

## 8. Effort I44

I44 adapta `progress.effort` de S1-06: horas estimadas, realizadas, diferença, cobertura, `status`, percentuais e `incomplete`. A Sprint terminal lê `closingTaskSnapshot` do owner; sessões não são somadas novamente. Snapshot antigo sem estimativa/realizado conhecido permanece `PARTIAL`, não zero conclusivo.

## 9. Burndown I45

I45 publica os mesmos pontos `{date,ideal,remaining}` do owner `sprint.burndown.calculator.js`, com eixo UTC e teto canônico de 180 dias. O adapter P5 marca `PARTIAL`/`BURNDOWN_MAX_180_DAYS` e `coverage.truncated` quando o teto corta a janela. Não há segunda fórmula. Sprint ainda não iniciada não publica burndown real. Teste persistido compara a série com `/sprints/:id/progress` e verifica estabilidade terminal após mutar Task viva.

## 10. Burnup I46

I46 retorna `UNAVAILABLE`, `kind:SERIES`, `points:[]` e limitações. `SprintTask` possui baseline e fechamento, mas não garante revisões intermediárias de pontos; reentrada reutiliza uma participação e pode apagar a cronologia de saída/entrada. Subtrair burndown do total final fabricaria o histórico de escopo. I46 permanece `NEEDS_HISTORY`, sem série falsa.

## 11. Velocity I47

I47 usa Sprints `CONCLUIDA` do projeto e somente `historicalSummary.completedPoints` com snapshot terminal íntegro. `CANCELADA`, planejada, ativa e concluída incompleta não viram pontos. Resultado em horas de estimativa por Sprint, sem ranking humano. Padrão: últimas 20; `limit` permite 1–50. `eligibleCount`, `excludedCount`, `truncatedCount` e `VELOCITY_LIMIT_APPLIED` evitam corte silencioso. O `scope` é do projeto, mesmo com `sprintId` selecionado.

## 12. Historical limitations

`LEGACY_PLANNING_SNAPSHOT_UNAVAILABLE`, `LEGACY_CLOSING_POINTS_UNAVAILABLE`, `LEGACY_CLOSING_STATUS_UNAVAILABLE` e `LEGACY_CLOSING_CUTOFF_UNAVAILABLE` vêm do owner de Sprint e não são apagados pela adaptação. I46 continua sem fatos suficientes. O escopo visível de I41/I42/I71 é a classificação atual das participações, não uma contagem completa de cada entrada e saída já ocorrida.

## 13. Authorization/privacy

Exige sessão e membership ativa VIEWER+; sem sessão → 401, projeto ou Sprint alheio/inexistente/excluído → 404 opaco. As listas de carry-over trazem só ID/título de Task e IDs de Sprint; não incluem e-mail, credenciais ou ranking pessoal. Query desconhecida é rejeitada com 400.

## 14. Performance/query plans

Uma leitura de projeto, Sprints e participações de todas as concluídas alimenta a velocity em três consultas em lote; o owner selecionado executa suas consultas canônicas apenas para uma Sprint. Não há N+1 por Sprint, SprintTask ou Task na velocity. `scripts/explain-s2-p5.js` usa apenas `traceflow_test`; no schema de teste pequeno, Sprints tiveram lookup por projeto, participações selecionadas lookup por `(sprintId,taskId)` e o lote de velocity usou índice por projeto com filtro de IDs. Isso não prediz plano em produção. Nenhum índice ou cache foi criado sem carga representativa.

## 15. Tests

Unitários cobrem baseline 10h, escopo 14h, congelamento de pontos, velocity elegível/legada e limite. API persistida cobre as 14 fichas, seleção ativa/ausente/ambígua, I41/I42/I71, carry-over, I44 incompleto, I45 igual ao owner e terminal imutável após alteração de status, estimativa, realizado e vínculo da Task. Também cobre 401/404, VIEWER, Sprint de outro projeto, limite e query estrita.

## 16. Gates

| Gate | Resultado local |
|---|---|
| Regressão focada de Sprint/Planning/P5 | 108 PASS |
| Backend unit isolado | 811 PASS |
| Backend integração/API isolada | 586 PASS; 5 skips preexistentes |
| Backend full com coverage | 1.397 PASS; 5 skips preexistentes; 91,38% statements / 93,92% lines |
| Frontend full e coverage | 1.231 PASS em cada; coverage 83,88% statements / 86,30% lines |
| Backend/frontend lint e format; frontend build | PASS; avisos preexistentes de IIFE/chunk no build |
| Prisma validate/generate; arquitetura | PASS |
| CI policy/format, dependências backend/frontend, segredos, `git diff --check` | PASS; 0 high/critical |

## 17. Documentation

API Contracts, catálogo I36–I47/I71–I72, auditoria de prontidão e matriz RF foram atualizados. O roadmap não tem checklist específico P5; S2-04/S2-05 permanecem abertos. Nenhum DPI foi promovido a RF oficial.

## 18. Remaining gaps

Burnup íntegro ainda exige história intermediária adicional; I46 não recebe curva inferida. Reentrada pode colapsar eventos de escopo/carry-over. Snapshots legados podem deixar baseline, esforço ou fechamento indisponíveis. Plano SQL medido em base pequena não prova desempenho em volume. P6–P10, painel e homologação visual/externa permanecem pendentes.
