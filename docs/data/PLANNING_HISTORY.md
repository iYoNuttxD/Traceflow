# Histórico de Planning

Referências: [regras canônicas de Planning](../qa/PLANNING_BUSINESS_RULES.md),
[ADR-010](../architecture/ADR-010-SPRINT-DOMAIN-CORRECTIONS.md),
[ADR-011](../architecture/ADR-011-MILESTONE-SPRINT-INVERSION.md) e
[contrato de evolução](../api/API_CONTRACTS.md#evolução-por-sprint-rf35).

## Fonte histórica

`Task.sprintId` identifica o vínculo operacional. `SprintTask` preserva a participação,
inclusive quando a Task é excluída. O histórico de entradas/saídas continua em
`TaskHistoryEntry`; uma linha de `SprintTask` pode ser reativada, mas isso não reabre o baseline.

| Campo | Significado e momento de captura |
| --- | --- |
| `Sprint.startedAt` | início da execução |
| `Sprint.planningSnapshotAt` | captura bem-sucedida do planejamento; igual a `startedAt` para novos starts |
| `Sprint.closedAt` | corte terminal persistido, inclusive cancelamento e escopo vazio |
| `SprintTask.plannedAtStart` | membership no start: `true` presente, `false` ausente, `null` sem snapshot confiável |
| `SprintTask.pointsAtPlanning` | esforço no start da Task presente; zero quando sem estimativa; `null` se não planejada ou desconhecido |
| `SprintTask.pointsAtClose` | esforço da participação ativa no encerramento; zero quando sem estimativa; `null` indica ausência de snapshot |
| `SprintTask.completedAtClose` | primeira conclusão dentro do intervalo da participação, capturada no encerramento; `null` quando não houve evento |
| `SprintTask.exitStatus`, `closedAt` | status observado e instante de congelamento da participação, já existentes |
| `SprintTask.closingTaskSnapshot` | JSON nullable v1 do card no encerramento: ID, título, prioridade, responsável ID, deadline e contagens de rastreabilidade; sem descrição, nome, e-mail ou conteúdo de artefato |
| `Sprint.deletedAt/deletedById`, `Milestone.deletedAt/deletedById` | tombstone e ator da exclusão lógica; não são evento de conclusão |
| `SprintTask.addedAt` | entrada do intervalo atual; reentrada atualiza este instante |
| `SprintTask.addedAfterStart` | projeção compatível da classificação; não é autoridade do baseline |

A captura no start marca todas as participações existentes como ausentes e apenas as
participações ativas como presentes, preservando seus pontos. Ambas as operações e a transição
para `EM_ANDAMENTO` pertencem à mesma transação. Uma inclusão posterior nasce com
`plannedAtStart=false`. Reativar uma participação preserva o membership e os pontos do baseline.

No encerramento, a mesma transação preserva pontos, status, instante da conclusão e corte,
além de transferir Tasks pendentes à próxima Sprint planejada válida (ou ao backlog sem destino)
e eventualmente concluir o Marco. Cancelamento mantém o retorno ao backlog. Os locks existentes
serializam start/scope/close por projeto e Sprint; as Tasks são travadas antes da leitura do
snapshot. Não há lógica de snapshot no controller.

Enquanto aberta, a Sprint mantém métricas operacionais calculadas com esforço/status corrente.
O planejamento permanece separado. Depois do encerramento, a evolução não consulta esforço ou
status da Task nem seu histórico de conclusão; usa os campos persistidos da participação.
Exclusão posterior da Task não apaga a série nem os pontos. A informação de continuidade para
outra Sprint pode continuar aparecendo em `carryOver`, sem mudar os números congelados.

## Continuidade operacional e apresentação terminal — FIX-02

Ao concluir, somente Tasks cujo ponteiro atual ainda é a origem e que não estão `CONCLUIDO`
seguem automaticamente à próxima Sprint planejada válida do mesmo projeto. A seleção usa o
menor início posterior ou contíguo ao fim da origem, com menor ID no empate. Sem destino,
retornam ao backlog; nenhuma Sprint nasce automaticamente. Participação removida não é candidata.

O fechamento e a transferência usam a mesma transação. O plano canônico de escopo é reutilizado
após congelar a origem, de modo que só o membership do destino é criado/reativado. Nenhum campo
do snapshot da origem é reescrito. O destino ainda planejado captura o membership ativo no seu
próprio start. Capacidade insuficiente ou falha de escrita causam rollback integral. O histórico
`SPRINT` registra uma troca origem → destino com o ator da mutation, sem evento intermediário
artificial de backlog. Os vínculos de rastreabilidade e Comments continuam pertencendo à Task.

`historicalSummary` é calculado no domínio e incluído em detalhe/listagem/Schedule/progress.
Resume contagens e pontos de planejamento/encerramento e corte; o mesmo calculator atende todos
os consumidores, com leitura em lote na listagem. A UI tem uma única seleção de métricas:
terminal usa a projeção histórica; aberta usa Tasks atuais. O progresso visual por pontos mantém
a fórmula existente, distinta da porcentagem por contagem de Tasks dos blocos de RF35.
O progresso do Marco continua por Sprints concluídas, e sua soma de pontos combina terminal
histórica com aberta live. Um total histórico desconhecido torna a soma indisponível.

`sprints[].tasks` mantém dados operacionais atuais. Para mostrar contexto atual no Cronograma,
`Task.sprintId` é autoridade e o nome vem de um índice por Sprint ID; `null` representa backlog.
O primeiro membership histórico não determina esse rótulo. Dedupe e deadline próprio permanecem.

A FIX-02 não altera schema ou migration. Usa os snapshots existentes, sem backfill. A limitação
legada abaixo continua explícita: campos desconhecidos são `null` e a UI usa `—`, nunca esforço
ou status atual para fabricar histórico.

## Migration e integridade

`20260904180000_planning_historical_snapshots` adiciona seis campos nullable. Não altera
migrations anteriores e não executa backfill a partir do estado atual.

Não há novas relações ou cascatas. Permanecem `SprintTask.taskId → Task` com `SetNull`,
`SprintTask.sprintId → Sprint` e `projectId → Project` com `Cascade`, a unicidade
`(sprintId, taskId)` e os índices existentes. A captura e as consultas selecionam pelo
`sprintId`, já atendido pelos índices existentes; os novos campos não são filtros globais.
A retenção continua sendo a da participação histórica, sem nova categoria de dado pessoal.

## LEGACY HISTORICAL LIMITATION

Linhas anteriores à migration não permitem reconstruir perfeitamente membership-at-start,
pontos no planejamento/encerramento ou conclusões cujo histórico já foi excluído. Reentradas
antigas reutilizavam o primeiro `addedAt` e apagavam `removedAt`.

- A migration mantém os novos campos nulos; não inventa precisão retroativa.
- Sprint legada ainda planejada recebe snapshot correto quando inicia.
- Sprint legada já iniciada mantém a limitação de baseline; encerrá-la captura corretamente o
  estado daquele encerramento, sem reconstruir o start.
- Sem snapshot de baseline, a compatibilidade usa a participação antiga e a saída conhecida
  (remoção anterior ao start não conta), acompanhadas de
  `LEGACY_PLANNING_SNAPSHOT_UNAVAILABLE`. É aproximação explicitamente limitada.
- Sem pontos de encerramento, o burndown terminal retorna `hasData=false`, `days=[]` e
  `LEGACY_CLOSING_POINTS_UNAVAILABLE`; `totalPoints=0` é o valor neutro do bloco sem dados,
  não prova de esforço histórico zero. Não utiliza esforço atual como fallback.
- Status terminal ausente não usa status atual; é sinalizado por
  `LEGACY_CLOSING_STATUS_UNAVAILABLE`. Contagens que dependem desses dados não constituem
  reconstrução histórica completa.
- Para terminais antigos sem `closedAt`, preserva-se `completedAt` ou, quando ausente,
  `updatedAt` como corte legado estável, cuja precisão histórica não é garantida, sinalizado
  por `LEGACY_CLOSING_CUTOFF_UNAVAILABLE`.

`historicalLimitations` na resposta de evolução comunica essas ausências. Para Sprints
capturadas integralmente pelo novo fluxo, a lista é vazia. As regras de congelamento histórico
permanecem inalteradas; as limitações identificam dados que nunca foram registrados.

## Quadro congelado e exclusão lógica — FIX-03

`projectSprintTasks` é a projeção única do endpoint `/sprints/:id/tasks`. A transação de leitura
observa Sprint e participações de forma consistente. Aberta usa campos operacionais; terminal
não faz join com Task. O ID atual nullable da participação serve somente à ação explícita de
abrir a Task atual. Status e pontos reutilizam campos existentes. `closingTaskSnapshot.version=1`
complementa o card com campos mínimos no mesmo corte; é capturado antes do carry-over.
Task excluída depois mantém seu ID histórico no JSON e a participação perde apenas a FK atual.

`traceabilityCounts` captura presença de Requirement/PR e quantidades de commits/issues.
O responsável é somente `responsibleUserId`: apresentação histórica usa “Responsável #ID” sem
resolver nome atual ou copiar PII dispensável. Deadline é ISO UTC ou null; atraso histórico é
avaliado no corte. Resumo terminal usa contagens, pontos e progresso históricos. Legado sem JSON
recebe `LEGACY_CLOSING_TASK_SNAPSHOT_UNAVAILABLE`, sem backfill ou fallback atual.

A migration incremental `20260905010000_planning_frozen_cards_soft_delete` acrescenta um JSON
nullable em SprintTask e dois campos nullable em cada entidade Sprint/Milestone. Há índices
`(projectId, deletedAt, status)` e de `deletedById`; FK de ator para User usa `SetNull`. JSON não
possui FK: IDs são identificadores observados no corte. Permanecem os índices de participação e
as cascatas anteriores. A exclusão de domínio nunca executa DELETE físico nessas entidades.
O nome da Sprint continua único no projeto, inclusive quando reservado por tombstone.

Excluir Sprint em qualquer estado preserva a linha, baseline, histórico e snapshots. Todos os
ponteiros atuais vão ao backlog com ator, sem status/conclusão/carry-over. Participação aberta
recebe saída REMOVIDA; terminal permanece intacta. Excluir Marco preserva todas as FKs de Sprints,
inclusive terminais. Referências existentes exibem “Marco X · Excluído”; novas associações são
bloqueadas. Queries atuais filtram tombstones; leituras históricas e conflito de DELETE repetido
usam inclusão explícita. Tombstones não ocupam janela/slot ativo nem recebem carry-over.

O Marco é opcional desde a criação por decisão explícita da FIX-03. Essa mudança não exige
schema adicional: `Sprint.milestoneId` já era nullable. A capacidade, o baseline, o freeze e a
proteção de associações terminais permanecem; excluir não significa reabrir ou reescrever.
