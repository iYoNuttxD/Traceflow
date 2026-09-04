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
| `SprintTask.addedAt` | entrada do intervalo atual; reentrada atualiza este instante |
| `SprintTask.addedAfterStart` | projeção compatível da classificação; não é autoridade do baseline |

A captura no start marca todas as participações existentes como ausentes e apenas as
participações ativas como presentes, preservando seus pontos. Ambas as operações e a transição
para `EM_ANDAMENTO` pertencem à mesma transação. Uma inclusão posterior nasce com
`plannedAtStart=false`. Reativar uma participação preserva o membership e os pontos do baseline.

No encerramento, a mesma transação preserva pontos, status, instante da conclusão e corte,
além de devolver Tasks pendentes ao backlog e eventualmente concluir o Marco. Os locks existentes
serializam start/scope/close por projeto e Sprint; as Tasks são travadas antes da leitura do
snapshot. Não há lógica de snapshot no controller.

Enquanto aberta, a Sprint mantém métricas operacionais calculadas com esforço/status corrente.
O planejamento permanece separado. Depois do encerramento, a evolução não consulta esforço ou
status da Task nem seu histórico de conclusão; usa os campos persistidos da participação.
Exclusão posterior da Task não apaga a série nem os pontos. A informação de continuidade para
outra Sprint pode continuar aparecendo em `carryOver`, sem mudar os números congelados.

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
capturadas integralmente pelo novo fluxo, a lista é vazia. As regras de negócio permanecem
inalteradas; as limitações identificam dados que nunca foram registrados.
