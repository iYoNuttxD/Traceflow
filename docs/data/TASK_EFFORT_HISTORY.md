# Histórico funcional de esforço — S1-09, Etapa 5

## Estado atual e trilha auditável

TaskTimeEntry representa sessões atuais. Task.actualEffort soma sessões encerradas e legacyActualEffort, convertido para horas com duas casas. Excluir uma sessão retira sua duração desse total. TaskEffortHistoryEntry preserva eventos imutáveis separados; não é derivado da lista atual nem do AuditEvent técnico.

| Evento | Momento | previousSeconds | newSeconds |
|---|---|---|---|
| CREATED | Lançamento manual ou encerramento do timer | null | Duração realizada |
| UPDATED | Ajuste de duração de sessão encerrada | Duração anterior | Nova duração |
| DELETED | Exclusão de sessão | Duração excluída | null |

TIMER/MANUAL indicam origem, nunca evento. Iniciar timer ainda não produz duração realizada. Ajustar TIMER preserva início/fim físicos como snapshot; a duração ajustada é explícita, não uma reescrita do relógio. Actor vem da sessão autenticada, não do responsável da Task nem do body.

Identidades: projectId/taskId/sessionId; evento/origem; actorUserId; durações anterior/nova; snapshotStartedAt/snapshotEndedAt; occurredAt servidor. Não há FK para Task ou sessão removível. Excluir Task/sessão não apaga os eventos. Excluir Project encerra a retenção por CASCADE, como nos demais históricos funcionais; exclusão de User neutraliza actorUserId por SetNull. Não existe endpoint operacional de edição/exclusão de eventos; histórico de Task fisicamente removida permanece armazenado, mas a rota da Task inexistente retorna 404.

## Atomicidade e concorrência

Repository trava Project → Task e relê a sessão dentro da transação. PATCH exige expectedUpdatedAt; conflito entre edições retorna 409 e não cria evento falso. updatedAt avança mesmo em edições no mesmo milissegundo. Ajuste idêntico não cria UPDATED. Escrita de sessão, recalculo do total e append do histórico são indivisíveis. Rollback é testado com falha injetada na persistência do histórico. Eventos SSE são posteriores ao commit; falha de publicação não transforma sucesso persistido em falha REST.

## Leitura e interface

[API_CONTRACTS](../api/API_CONTRACTS.md) documenta GET de history e PATCH. Paginação no banco e filtros por período UTC do evento, origem e tipo de evento. Histórico mostra ator/data, Registrado, Editado (3h → 4h), Excluído (Entrada de 4h). Timer também mostra intervalo físico. Permissões atuais controlam edição/exclusão da sessão associada; snapshots antigos nunca são editados.

“Histórico de eventos” e “Sessões atuais” são visualizações separadas. A segunda usa o endpoint antigo e permite ajustar/remover sessões anteriores à adoção; seu filtro de datas considera encerramento e Evento fica desabilitado. Ela não fabrica eventos de criação para esses registros. Cancelamento, loading, erro/retry, paginação e descarte de respostas obsoletas preservam o owner existente.

## Adoção e verificação

Migration incremental `20260912010000_s109_lifecycle_effort_history` cria a tabela vazia e altera somente o default de Requirement.status. Não há backfill de eventos retroativos. `backend/scripts/validate-s109-lifecycle-migration.js` valida cadeia vazia e upgrade populado representativo, compara Requirement/Task/sessões antes/depois, confirma histórico vazio e migration status, removendo somente os dois schemas descartáveis criados pela própria execução.

Testes reais cobrem manual 3h → 4h → exclusão, filtros, timer, ator/permissões/IDOR, edições concorrentes, conflito obsoleto e rollback. Repetibilidade e evidência visual estão na seção FINAL TARGETED CORRECTIONS do [relatório da Etapa 5](../deliveries/S1_09_TRACEABILITY_GRAPH_WORKSPACE_UX_REPORT.md). Não há conclusão sobre CI remoto ou produção.
