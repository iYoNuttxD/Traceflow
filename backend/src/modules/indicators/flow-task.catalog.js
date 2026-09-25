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
    'MEDIAN(primeira conclusão − Task.createdAt)',
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
    'MEDIAN(primeira conclusão − primeira entrada EM_ANDAMENTO)',
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
    'COUNT DISTINCT Task da última conclusão vigente no corte',
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
    'COUNT Task.status=EM_ANDAMENTO',
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
    'asOf − última entrada EM_ANDAMENTO ainda vigente',
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
    'estoque observado por status ao fim de cada dia civil',
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
    'COUNT Task.id',
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
    'COUNT Task.id GROUP BY status',
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
    'COUNT deadline < asOf AND status != CONCLUIDO',
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
    'COUNT responsibleUserId IS NULL',
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
    'COUNT estimatedEffort IS NULL',
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
    'SUM estimatedEffort não nulo',
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
    'SUM Task.actualEffort não nulo',
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
    'SUM(actualEffort − estimatedEffort) nas Tasks comparáveis',
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
    'COUNT actualEffort > estimatedEffort nas Tasks comparáveis',
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
    'COUNT CONCLUIDO AND actualEffort < estimatedEffort',
    ['Task.status', 'Task.estimatedEffort', 'Task.actualEffort']
  )
});
