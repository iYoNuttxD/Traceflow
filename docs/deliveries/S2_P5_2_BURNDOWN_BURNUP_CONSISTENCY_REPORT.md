# S2 P5.2 — consistência histórica entre Burndown e Burnup

**Resultado local: PASS LOCAL.**

## 1. Baseline

Branch `daniel-dev`, HEAD `cba764401dbae2221d066b0aab997c41b3b914ab`, working tree limpa antes desta rodada. Node padrão `v26.9.0`; execução e gates desta rodada usam Node `v22.23.3`. Prisma `6.12.0` conforme `backend/package.json`.

## 2. Motivo do P5.2

P5.1 passou a reconstruir o escopo e a conclusão por eventos para I46, mas manteve I45 com a primeira conclusão e os pontos do corte. Para o mesmo dia coberto, `remaining + completed` podia divergir de `scope`.

## 3. I45 antes

`sprint.burndown.calculator.js` usa somente participações não removidas, soma os pontos atuais/congelados como total para todos os dias, subtrai a primeira conclusão registrada e clampa o restante em zero. Usa dias UTC desde `Sprint.startedAt`, limite de 180 dias, corte terminal e linha ideal independente.

## 4. I46 antes

`sprint.burnup.calculator.js` reproduz `SprintBurnupEvent` por `occurredAt,id`, mantém Task presente/ausente, estimativa e status, e mede o estado ao fim do dia UTC. Reabertura, reconclusão, mudanças de estimativa e escopo já mudam `scope` e `completed` do dia correto. Âncora tardia é `PARTIAL`; legado sem cobertura é `UNAVAILABLE`.

## 5. Divergências encontradas

| Evento | I45 antes | I46 antes | Consistente? | Ação |
| --- | --- | --- | --- | --- |
| Task adicionada | Insere pontos atuais em todos os dias anteriores | Entra no dia do evento | Não | Compartilhar projeção |
| Task removida | Exclui de todos os dias | Sai no dia do evento | Não | Compartilhar projeção |
| Estimativa aumenta/diminui | Aplica ponto final retroativamente | Aplica no evento | Não | Compartilhar projeção |
| Conclusão | Queima na primeira conclusão | Conta quando status final do dia é `CONCLUIDO` | Condicional | Compartilhar projeção |
| Reabertura | Continua queimada | Retira do concluído | Não | Compartilhar projeção |
| Reconclusão | Continua queimada desde a primeira | Conta uma vez a partir da nova conclusão | Não | Compartilhar projeção |
| Task transferida/carry-over | Sai/entra retroativamente pelas participações correntes | Saída na origem, entrada no destino | Não | Compartilhar projeção por Sprint |
| Sprint encerrada | Usa snapshot de pontos/status e corte | Usa diário e corte terminal | Parcialmente | Verificar imutabilidade de ambas |
| Task alterada após fechamento | Usa snapshot congelado | Sem novo evento por guard terminal | Sim | Regressão |
| Task excluída | Participação terminal sobrevive; ativa perde escopo atual | Evento persiste; exclusão ativa registra saída | Parcialmente | Regressão |

Fixtures puras, antes da mudança, com Sprint iniciada em D1 e corte D5:

| Caso | I45 D1–D5 | I46 `(scope,completed)` D1–D5 |
| --- | --- | --- |
| 4h concluída D2, reaberta D3 | `4,0,0,0,0` | `(4,0),(4,4),(4,0),(4,0),(4,0)` |
| Estimativa aberta 3→5 em D3 | `5,5,5,5,5` | `(3,0),(3,0),(5,0),(5,0),(5,0)` |
| Task concluída 4h removida D3 | série vazia | `(4,4),(4,4),(0,0),(0,0),(0,0)` |

## 6. Autoridade histórica compartilhada

`sprint.historical.projection.js` no domínio de Sprint reproduz o diário uma vez, em ordem
`occurredAt ASC,id ASC`, e produz internamente `{date,scope,completed,remaining}`. I46 seleciona
`scope/completed`; o owner `sprint.burndown.calculator.js` seleciona `remaining` e calcula sua
linha ideal separadamente. O endpoint reutiliza a mesma instância da projeção para as duas fichas;
`/sprints/:id/progress` também usa o caminho histórico quando há cobertura. Não há endpoint,
schema, migration ou chart novos.

## 7. Scope semantics

`scope` soma as estimativas das Tasks presentes no fim do dia UTC. Cada entrada inclui a
estimativa vigente, cada saída remove a contribuição. Bucket futuro e bucket com estimativa
desconhecida têm valores `null`, não zero presumido. A projeção valida não negatividade,
`completed <= scope` e `remaining = scope - completed`; cadeia impossível produz `UNAVAILABLE`,
sem clamp.

## 8. Completion/reopen semantics

Conclusão move a estimativa atual de restante para concluído; reabertura faz o inverso;
reconclusão conta uma única vez. Múltiplos eventos no mesmo dia são aplicados antes do ponto do
fim do dia. A primeira conclusão deixa de dominar a série coberta de I45.

## 9. Estimate-change semantics

Task aberta 3→5 aumenta escopo/restante em 2; 5→2 os reduz em 3. Task concluída 5→7 aumenta
escopo/concluído em 2, sem alterar restante. Após reabertura, a revisão aumenta restante. O
evento de conclusão usa a estimativa válida naquele instante; testes cobrem 0,5/1,5/2,5h.

## 10. Add/remove/transfer semantics

Remover Task aberta reduz escopo/restante; remover Task concluída reduz escopo/concluído. A
transferência é saída em A e entrada em B; eventos posteriores em B não afetam A. Carry-over
mantém contexto de participação e segue as mesmas regras. Exclusão de Task ativa grava saída;
o diário preserva o estado anterior.

## 11. Terminal immutability

Os guards de captura P5.1 exigem `EM_ANDAMENTO` e participação não fechada. A projeção limita
eventos ao corte terminal, inclusive se receber um evento posterior indevido. Regressão API
compara ambas as séries antes/depois de editar estimativa, realizado e excluir fisicamente a
Task; o diário permanece intacto. A API rejeita mudança de status de Task ainda vinculada à
Sprint terminal com `409`. Uma alteração direta da Task viva na fixture também não altera as
séries congeladas.

## 12. Legacy/partial behavior

Âncora tardia inicia ambas as séries comparáveis no dia da captura e mantém `PARTIAL`; dias
anteriores não são inventados. Sprint antiga sem cobertura mantém I45 legado e I46
`UNAVAILABLE`; os dois não afirmam ter o mesmo histórico. Estimativa ausente e teto de 180 dias
continuam propagados. Uma cadeia contraditória suprime as duas séries cobertas.

## 13. Definition versions

Somente I45 sobe de v1 para v2: v1 aplicava pontos finais e primeira conclusão a toda a série;
v2 usa os fatos por dia nas Sprints cobertas. I46 permanece v2. As demais definições não mudam.

## 14. Performance

Leitura do diário ordenado por `(sprintId,occurredAt,id)` ocorre uma vez por Sprint selecionada.
O replay é `O(events + buckets)` quando a consulta já fornece a ordem; sort defensivo se não.
No caminho ativo com Task, sem Sprints concluídas no projeto, a contagem estática de operações
de leitura Prisma passa de **10 antes para 8 depois**: saem a leitura duplicada da Sprint para
I46 e a busca de primeiras conclusões para I45 coberto. Com Sprints concluídas, o lote de
velocity acrescenta uma operação em ambos os casos (**11→9**). Relações carregadas pelo Prisma
podem gerar mais de uma instrução SQL; estes números são operações de repositório, não medição
de statements físicos. A consulta por `sprintId`, ordenada por `occurredAt,id`, foi examinada
com `EXPLAIN` no schema de teste: `Index lookup` em
`SprintBurnupEvent_sprintId_occurredAt_id_idx` (tabela vazia após limpeza dos testes). Sem índice
novo, N+1 ou cache.

## 15. Tests

Fixtures puras cobrem baseline, conclusão, reabertura, reconclusão, escopo adicionado/removido,
Task concluída removida, estimativa aberta/concluída, frações, ordenação no mesmo dia,
congelamento, âncora parcial, legado e cadeia contraditória. Helper compartilhado verifica
`scope - completed ≈ remaining` e não negatividade para cada bucket comparável. API persistida
verifica I45/I46 e seus estados após mutação, transferência, fechamento e exclusão de Task.

## 16. Gates

| Gate local, Node 22 | Resultado |
| --- | --- |
| Unitários focados de Burndown/Burnup/projeção | 33 PASS |
| API focada P5/P5.1 | 12 PASS; Planning + API após correção, 25 PASS; guard terminal final, 5 PASS |
| Backend unitário completo | 823 PASS |
| Backend integração/API | 591 PASS, 5 skips preexistentes |
| Backend cobertura completa | 1.414 PASS, 5 skips preexistentes; 94,01% linhas, 83,68% branches |
| Backend lint e format:check | PASS |
| Frontend full e cobertura | 1.231 PASS em cada execução; cobertura 86,30% linhas |
| Frontend lint, format:check e build | PASS; build com avisos de chunk já existentes |
| Prisma validate e generate | PASS, client 6.12.0 |
| Architecture check e validação CI | PASS; 8 testes de política CI |
| Dependency/security | Audit backend/frontend PASS, 0 high/critical; 5 testes de política PASS; secret scan backend PASS |
| `git diff --check` | PASS |

A primeira execução da cobertura backend detectou uma regressão funcional introduzida pela
otimização da leitura de primeiras conclusões: o fechamento deixou de preencher
`SprintTask.completedAtClose`. A leitura foi preservada no fluxo de fechamento e dispensada
somente na consulta de indicadores cobertos. Teste focado e cobertura completa repetidos
passaram. A primeira execução unitária completa no sandbox falhou apenas em 28 casos HTTP por
`listen EPERM 127.0.0.1`; repetida com transporte local permitido, passou 823/823.

## 17. Documentation

Atualizados `PLANNING_HISTORY`, catálogo, auditoria de prontidão, contratos API e matriz RF.
O relatório P5/P5.1 permanece como registro do estado anterior.

## 18. Remaining limitations

180 dias UTC por Sprint; âncora tardia não recupera o período anterior; Sprint legada sem
diário não ganha Burnup inferido. Medição local de consulta não substitui benchmark de produção.
P6–P10, frontend de painel e homologação visual/externa seguem pendentes. S2-04/S2-05 ficam
abertos.
