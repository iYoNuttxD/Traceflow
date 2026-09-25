# S2 P5.1 — Burnup Historical Foundation — relatório local

**Resultado: S2 P5.1 BURNUP HISTORICAL FOUNDATION — PASS LOCAL.** Uma Sprint iniciada após a fundação produz I46 `AVAILABLE` com escopo e conclusão históricos demonstráveis. A diferença de semântica histórica com I45 em reaberturas permanece registrada na seção 19.

## 1. Baseline

Início em `daniel-dev`, HEAD `797b5a415adee9e1a8e434e600594657f6929232`, working tree limpa, `git diff --check` e `git diff --stat` vazios. `node` padrão 26.9.0; todas as operações do projeto foram executadas com Node 22.23.3 via PATH explícito. Prisma 6.12.0. Sem commit, push, merge, rebase, reset, clean ou stash.

## 2. Motivo do P5.1

O P5 publicou I46 `UNAVAILABLE`: baseline e fechamento não determinam quando a estimativa mudou, e a linha de participação pode ser reativada. Esta rodada estabelece prova temporal para Sprints futuras e âncora honesta para Sprints já ativas. O painel e o gráfico permanecem para P8.

## 3. Auditoria das fontes existentes

| Pergunta | Resposta observada |
|---|---|
| A. `SprintTask` registra entrada? | Sim, `addedAt` da participação corrente; reentrada o sobrescreve. |
| B. Registra saída? | Sim, `removedAt`; reentrada o torna `null`. |
| C. Preserva `pointsAtPlanning`? | Sim, no start; ausência de estimativa vira zero no contrato Planning. |
| D. Preserva `pointsAtClose`? | Sim no fechamento novo; `null` em legado sem snapshot. |
| E. Há estimativa intermediária? | Não, nem em `SprintTask` nem no histórico funcional da Task. |
| F. `TaskEffortHistoryEntry` registra estimativa? | Não; registra segundos de sessões de tempo realizado. |
| G. `occurredAt` desse histórico é confiável? | Sim para sessão realizada, irrelevante para alteração de estimativa. |
| H. Guarda valores anterior/novo? | Sim, `previousSeconds/newSeconds` de duração realizada, não horas estimadas. |
| I. Correlação com participação? | O instante poderia ser comparado, mas o fato de estimativa não existe ali. |
| J. `TaskMovement` basta para conclusão? | Registra status e Sprint enquanto Task existe; hard delete o remove. Burndown I45 ainda usa a primeira conclusão. Não prova reaberturas após exclusão. |

| Fato | Fonte anterior | Completo/confiável para I46? | Persistência adicional |
|---|---|---|---|
| Baseline | `Sprint.startedAt`, `planningSnapshotAt`, `SprintTask.pointsAtPlanning` | Sim em start novo; legado parcial | Âncora por Task no start ou migration |
| Entrada/saída | `SprintTask.addedAt/removedAt` | Não após reentrada | Eventos `TASK_ADDED/TASK_REMOVED` |
| Estimativa vigente | `Task.estimatedEffort` atual | Não histórica | `ESTIMATE_CHANGED` anterior/novo |
| Conclusão/reabertura | `TaskMovement` | Não após hard delete | `STATUS_CHANGED` durável |

## 4. Fatos necessários ao Burnup

`BASELINE_TASK`, `TASK_ADDED`, `TASK_REMOVED`, `ESTIMATE_CHANGED` e `STATUS_CHANGED` sustentam as duas linhas. Nenhuma diferença entre início e fim é atribuída a um dia inventado.

## 5. Decisão: reutilização vs nova persistência

`SprintTask` e `TaskMovement` seguem autoridades operacionais e alimentam outros indicadores. Para I46, ambos perdem eventos necessários em reentrada ou hard delete. `TaskEffortHistoryEntry` tem outra unidade e outro significado. Duas migrations incrementais criam `SprintBurnupEvent` e sua FK composta para Sprint/projeto. O diário não substitui Planning/Kanban; preserva os fatos mínimos que esses owners não retêm durante todo o ciclo de vida da Task.

## 6. Baseline da Sprint

Na transição `PLANEJADA → EM_ANDAMENTO`, a mesma transação que captura `SprintTask.pointsAtPlanning` registra um `BASELINE_TASK` para cada Task presente e fixa `burnupCoverageStartedAt=startedAt`. O evento preserva `null` de estimativa, ao contrário do zero de compatibilidade de `pointsAtPlanning`. Zero explícito permanece zero.

## 7. Add/remove

`applyScopePlan` registra eventos antes de modificar `SprintTask`, sob locks do fluxo Planning. Isso cobre entrada, saída, reentrada e transferência. Saída da origem e entrada do destino usam o mesmo `occurredAt` da mutação e IDs persistidos para desempate; Sprint terminal não recebe evento novo. Exclusão de Task ativa gera `TASK_REMOVED` na transação de exclusão. A exclusão lógica de Sprint a torna indisponível pela API; os eventos são mantidos até o hard purge.

## 8. Estimate history

`PUT /tasks/:id` com alteração real de `estimatedEffort` trava Project, Sprint e Task, relê o valor anterior e grava `ESTIMATE_CHANGED` na mesma transação da Task. A captura exige participação corrente em Sprint ativa do mesmo projeto. Mudança antes da entrada, depois da saída ou após fechamento não altera aquela Sprint. Evento traz `previousPoints`, `newPoints`, `occurredAt`; `null` e zero permanecem distintos.

## 9. Completion/reopen

`PATCH /tasks/:id/status` e movimento Kanban usam o mesmo repository de `TaskMovement`. Na mesma transação é anexado `STATUS_CHANGED` para participação ativa. Conclusão soma a estimativa vigente; reabertura a retira; reconclusão a soma novamente apenas uma vez. Mudança de estimativa de Task já concluída altera escopo e concluído enquanto ela permanece na Sprint. Remoção de Task concluída reduz as duas linhas. O diário é necessário porque exclusão física remove `TaskMovement` e `TaskHistoryEntry` dessa Task.

## 10. Burnup calculator

`sprint.burnup.calculator.js` é puro. Ordena eventos por `(occurredAt,id)` e percorre eventos + até 180 dias UTC mantendo estado por `taskKey`, escopo conhecido, concluído conhecido e contagem de estimativas ausentes. Complexidade após ordenação: `O(events + buckets)`; a consulta já fornece a mesma ordem por índice. Série diária `{date,scope,completed}` usa o mesmo início real `startedAt`, janela nominal, eixo UTC e teto de 180 dias do Burndown. Dias futuros ou com estimativa ausente expõem `null`, não zero. Cadeia contraditória é `UNAVAILABLE` com `points:[]`.

## 11. Coverage model

`coverage:{startedAt,complete,truncated}` e `limitations[]` acompanham I46 v2. `AVAILABLE` exige cobertura desde o start, eventos consistentes e nenhuma ausência de estimativa nos dias medidos. `PARTIAL` sinaliza âncora tardia, estimativa ausente ou truncamento. `NO_DATA` indica Sprint planejada ou cobertura sem universo de Tasks. `UNAVAILABLE` indica falta de cobertura, corte terminal desconhecido ou contradição de eventos.

## 12. Legacy behavior

Migration ancora somente Sprints `EM_ANDAMENTO` com `startedAt` conhecido: `CURRENT_TIMESTAMP(3)` e estado corrente das participações ainda presentes. A API começa a série nessa âncora e marca `PARTIAL`. Sprints terminais antigas permanecem sem cobertura e `UNAVAILABLE`. O upgrade precisa ocorrer com escritas operacionais pausadas para que a âncora e as linhas capturadas descrevam o mesmo instante. Não houve backfill de revisões nem inferência a partir de `pointsAtPlanning/pointsAtClose`.

## 13. Terminal immutability

Após fechamento, a captura exige `status=EM_ANDAMENTO` e participação não fechada. Leitura I46 usa apenas Sprint + eventos congelados. Teste persistido altera estimativa e esforço atual, exclui a Task fisicamente e compara pontos, cobertura e estado antes/depois.

## 14. Deletion/purge behavior

`taskKey` não tem FK para Task; hard delete da Task não apaga o diário. `projectId` e `(sprintId,projectId)` têm FKs com `Cascade`, de modo que hard purge de Sprint/Project remove os eventos sem órfãos. A FK composta rejeita evento cross-project. Soft delete/restore do Project mantém eventos. A migration de escopo foi acrescentada em novo arquivo, sem editar a migration já aplicada no teste local.

## 15. Performance

Leitura I46: uma transação `RepeatableRead`, uma busca de Sprint e uma consulta ordenada de todos os eventos da Sprint; nenhuma consulta por Task/evento. O calculator usa `O(events + buckets)` quando recebe a ordem do índice e faz sort defensivo somente se a entrada não vier ordenada. `EXPLAIN` no banco de teste pequeno usou `SprintBurnupEvent_sprintId_occurredAt_id_idx`; os joins de captura usaram índice de `SprintTask` e PK de Task. Em processo local, fixture sintética de 10.100 eventos/180 buckets terminou em 15,66 ms; essa medição não prova latência em produção. Sem cache ou índice especulativo adicional.

## 16. Tests

Unitários cobrem baseline, add/remove, estimativa crescente/decrescente, `null↔valor`, zero, conclusão, reabertura, reconclusão, estimativa pós-conclusão, ordenação no empate, cobertura parcial/legada e cadeia inconsistente. API persistida cobre start e mutações atômicas, reentrada, terminal após hard delete, transferência, exclusão ativa e âncora parcial. A suíte existente de Planning/Sprint e P5 continua cobrindo autorização VIEWER+, 401 e 404 cross-scope.

## 17. Gates

| Gate local | Evidência |
|---|---|
| Focados Planning/P5/P5.1 | 97 PASS (código final) |
| Backend unit | 818 PASS |
| Backend integração/API | 591 PASS, 5 skips preexistentes |
| Backend coverage final | 1.409 PASS, 5 skips preexistentes; 91,42% statements / 94,00% lines |
| Frontend full e coverage | 1.231 PASS em cada; 83,87% statements / 86,30% lines |
| Lint/format backend e frontend | PASS |
| Frontend build | PASS; avisos de IIFE/chunk já existentes |
| Prisma | `validate`/`generate` PASS; 62 migrations em dia; empty deploy e upgrade representativo PASS; FK cross-project rejeita inserção |
| Banco | `SCHEMA_CONSISTENT`, zero órfãos na auditoria LR.5 |
| Arquitetura, CI, auditoria de dependências, segredo, diff | PASS; 0 high/critical em backend/frontend |

O primeiro `test:unit` no sandbox falhou com `listen EPERM 127.0.0.1`; repetido com acesso local, passou. A falha foi de infraestrutura e não do comportamento P5.1. Não houve CI remoto nem homologação visual.

## 18. Documentation

Atualizados contrato API, catálogo, auditoria de prontidão, histórico Planning, nota de histórico de esforço, matriz RF e workflow CI. A sugestão de commit é `feat: add historical foundation for sprint burnup`; nenhum commit foi criado.

## 19. Remaining limitations

I45 mantém o cálculo canônico P5 baseado na primeira conclusão e pontos do corte, sem reconstrução completa de reaberturas; I46 representa o status efetivo por dia, portanto curvas históricas podem diferir nesses casos. Sprints anteriores à captura não se tornam integralmente disponíveis. Até 180 dias UTC são publicados por Sprint. Não houve gráfico, painel, homologação visual, CI remoto ou medição com volume de produção. S2-04/S2-05 continuam abertos; P6 não foi iniciado.
