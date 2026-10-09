function define(
  id,
  category,
  title,
  description,
  unit,
  temporalType,
  eventClock,
  formula,
  sources
) {
  return Object.freeze({
    id,
    rf: null,
    category,
    title,
    description,
    unit,
    temporalType,
    eventClock,
    supportedFilters: temporalType === 'CURRENT_STATE' ? [] : ['period'],
    definitionVersion: 1,
    formula,
    sources
  });
}

export const FLOW_TASK_INDICATORS = Object.freeze({
  I20: define(
    'I20',
    'FLOW',
    'Lead time',
    'Criação até a primeira conclusão verificável.',
    'DAYS',
    'EVENT',
    'TaskMovement.movedAt',
    'Mediana do tempo entre a criação e a primeira conclusão verificável das tarefas concluídas pela primeira vez no período, em dias corridos. A série mostra a mediana dessas durações em cada dia.',
    ['Task.createdAt', 'TaskMovement']
  ),
  I21: define(
    'I21',
    'FLOW',
    'Cycle time',
    'Primeira entrada em andamento até a primeira conclusão.',
    'DAYS',
    'EVENT',
    'TaskMovement.movedAt',
    'Mediana do tempo entre a primeira entrada em “Em andamento” e a primeira conclusão verificável das tarefas concluídas pela primeira vez no período, em dias corridos. Reentradas não reiniciam o relógio; a série mostra a mediana diária.',
    ['TaskMovement']
  ),
  I22: define(
    'I22',
    'FLOW',
    'Throughput',
    'Tasks distintas com conclusão vigente no corte do período.',
    'TASKS',
    'EVENT',
    'TaskMovement.movedAt',
    'Quantidade de tarefas distintas cuja última movimentação até o fim do período é uma conclusão ocorrida no período. Cada tarefa é contada uma vez e agrupada pelo dia dessa conclusão.',
    ['TaskMovement']
  ),
  I23: define(
    'I23',
    'FLOW',
    'WIP atual',
    'Tasks atualmente em andamento.',
    'TASKS',
    'CURRENT_STATE',
    null,
    'Quantidade de tarefas atualmente em andamento.',
    ['Task.status']
  ),
  I24: define(
    'I24',
    'FLOW',
    'Aging WIP',
    'Tasks abertas em andamento com última entrada observada.',
    'DAYS',
    'CURRENT_STATE',
    null,
    'Tempo desde a última entrada registrada em “Em andamento” até a consulta, em dias, para tarefas que continuam nesse estado. A lista mostra até dez das mais antigas com histórico verificável.',
    ['Task.status', 'TaskMovement']
  ),
  I25: define(
    'I25',
    'FLOW',
    'Cumulative flow',
    'Série parcial das Tasks sobreviventes com cadeia de movimentos observável.',
    'TASKS',
    'HISTORICAL_SERIES',
    'Task.createdAt + TaskMovement.movedAt',
    'Quantidade de tarefas por status ao fim de cada dia completo no fuso escolhido. Considera somente tarefas ainda existentes com sequência de movimentações verificável.',
    ['Task.createdAt', 'TaskMovement']
  ),
  I26: define(
    'I26',
    'TASK',
    'Total de Tasks',
    'Tasks existentes no projeto.',
    'TASKS',
    'CURRENT_STATE',
    null,
    'Quantidade de tarefas existentes no projeto.',
    ['Task']
  ),
  I27: define(
    'I27',
    'TASK',
    'Distribuição por status',
    'Tasks existentes por estado canônico.',
    'TASKS',
    'CURRENT_STATE',
    null,
    'Quantidade de tarefas existentes em cada status: “A fazer”, “Em andamento” e “Concluído”.',
    ['Task.status']
  ),
  I28: define(
    'I28',
    'TASK',
    'Tasks atrasadas',
    'Tasks não concluídas cujo prazo instantâneo passou.',
    'TASKS',
    'CURRENT_STATE',
    null,
    'Quantidade de tarefas não concluídas cujo prazo civil é anterior ao dia atual no fuso aplicado. A lista mostra até dez tarefas, começando pelos prazos mais antigos.',
    ['Task.deadline', 'Task.status']
  ),
  I29: define(
    'I29',
    'TASK',
    'Tasks sem responsável',
    'Tasks sem responsibleUserId canônico.',
    'TASKS',
    'CURRENT_STATE',
    null,
    'Quantidade de tarefas sem responsável registrado.',
    ['Task.responsibleUserId']
  ),
  I30: define(
    'I30',
    'TASK',
    'Tasks sem estimativa',
    'Tasks cuja estimativa é null; zero explícito é estimado.',
    'TASKS',
    'CURRENT_STATE',
    null,
    'Quantidade de tarefas sem estimativa de esforço informada. Uma estimativa registrada como zero não é considerada ausente.',
    ['Task.estimatedEffort']
  ),
  I31: define(
    'I31',
    'TASK',
    'Estimativa total conhecida',
    'Soma das estimativas presentes.',
    'HOURS',
    'CURRENT_STATE',
    null,
    'Soma das estimativas de esforço conhecidas das tarefas, em horas. Tarefas sem estimativa não entram no subtotal e tornam o resultado parcial.',
    ['Task.estimatedEffort']
  ),
  I32: define(
    'I32',
    'TASK',
    'Esforço realizado conhecido',
    'Soma do derivado S1-06, sem recontar sessões.',
    'HOURS',
    'CURRENT_STATE',
    null,
    'Soma do esforço realizado conhecido das tarefas, em horas. Usa o total já consolidado de sessões e registros anteriores, sem somá-los novamente.',
    ['Task.actualEffort']
  ),
  I33: define(
    'I33',
    'TASK',
    'Desvio de esforço comparável',
    'Realizado menos estimado nas Tasks com ambos conhecidos.',
    'HOURS',
    'CURRENT_STATE',
    null,
    'Soma de (Esforço realizado − Esforço estimado), em horas, somente nas tarefas com os dois valores conhecidos.',
    ['Task.estimatedEffort', 'Task.actualEffort']
  ),
  I34: define(
    'I34',
    'TASK',
    'Tasks acima da estimativa',
    'Tasks com realizado maior que estimativa conhecida.',
    'TASKS',
    'CURRENT_STATE',
    null,
    'Quantidade de tarefas com esforço realizado maior que a estimativa, considerando somente valores conhecidos. A lista mostra até dez dos maiores excessos.',
    ['Task.estimatedEffort', 'Task.actualEffort']
  ),
  I35: define(
    'I35',
    'TASK',
    'Tasks concluídas abaixo da estimativa',
    'Tasks concluídas com realizado menor que estimativa conhecida.',
    'TASKS',
    'CURRENT_STATE',
    null,
    'Quantidade de tarefas concluídas com esforço realizado menor que a estimativa, considerando somente valores conhecidos. A lista mostra até dez das maiores diferenças.',
    ['Task.status', 'Task.estimatedEffort', 'Task.actualEffort']
  )
});
