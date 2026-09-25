function define(
  id,
  title,
  description,
  unit,
  temporalType,
  formula,
  sources,
  supportedFilters = ['sprintId']
) {
  return Object.freeze({
    id,
    rf: null,
    category: 'SPRINT',
    title,
    description,
    unit,
    temporalType,
    eventClock:
      id === 'I45' || id === 'I46'
        ? 'SprintBurnupEvent.occurredAt'
        : temporalType === 'HISTORICAL_SERIES'
          ? 'Sprint.closedAt'
          : null,
    supportedFilters,
    definitionVersion: id === 'I45' || id === 'I46' ? 2 : 1,
    formula,
    sources
  });
}

export const SPRINT_ANALYTICS_INDICATORS = Object.freeze({
  I36: define(
    'I36',
    'Pontos planejados',
    'Estimativa congelada no início da Sprint.',
    'HOURS',
    'FROZEN',
    'SUM(pointsAtPlanning WHERE plannedAtStart)',
    ['SprintTask.plannedAtStart', 'SprintTask.pointsAtPlanning']
  ),
  I37: define(
    'I37',
    'Pontos atuais',
    'Escopo corrente ou congelado no encerramento.',
    'HOURS',
    'CURRENT_OR_FROZEN',
    'SUM(points das participações ativas)',
    ['SprintTask', 'Task.estimatedEffort']
  ),
  I38: define(
    'I38',
    'Pontos entregues',
    'Escopo concluído no corte da Sprint.',
    'HOURS',
    'CURRENT_OR_FROZEN',
    'SUM(points das participações concluídas)',
    ['SprintTask', 'Sprint.historicalSummary']
  ),
  I39: define(
    'I39',
    'Tasks planejadas',
    'Participações no baseline inicial.',
    'TASKS',
    'FROZEN',
    'COUNT(plannedAtStart=true)',
    ['SprintTask.plannedAtStart']
  ),
  I40: define(
    'I40',
    'Tasks entregues',
    'Participações concluídas no corte.',
    'TASKS',
    'CURRENT_OR_FROZEN',
    'COUNT(status no corte=CONCLUIDO)',
    ['SprintTask.exitStatus', 'Sprint.progress']
  ),
  I41: define(
    'I41',
    'Escopo adicionado',
    'Participações atuais incluídas depois do início.',
    'TASKS',
    'FROZEN',
    'COUNT(scopeChange.added)',
    ['Sprint.progress.scopeChange']
  ),
  I42: define(
    'I42',
    'Escopo removido',
    'Participações planejadas removidas após o início.',
    'TASKS',
    'FROZEN',
    'COUNT(scopeChange.removed)',
    ['Sprint.progress.scopeChange']
  ),
  I43: define(
    'I43',
    'Carry-over',
    'Entradas herdadas e saídas transferidas da Sprint.',
    'TASKS',
    'CURRENT_OR_FROZEN',
    'COUNT(incoming), COUNT(outgoing)',
    ['SprintTask.carriedFromSprintId', 'Sprint.progress.carryOver']
  ),
  I44: define(
    'I44',
    'Estimado × realizado',
    'Resumo canônico de esforço S1-06.',
    'HOURS',
    'CURRENT_OR_FROZEN',
    'Sprint.effort',
    ['Sprint.progress.effort', 'SprintTask.closingTaskSnapshot']
  ),
  I45: define(
    'I45',
    'Burndown',
    'Série diária canônica de trabalho restante.',
    'HOURS',
    'HISTORICAL_SERIES',
    'remaining(t) from Sprint historical projection',
    ['Sprint.progress.burndown', 'SprintBurnupEvent']
  ),
  I46: define(
    'I46',
    'Burnup',
    'Escopo e concluído ao longo do tempo, somente com história íntegra.',
    'HOURS',
    'HISTORICAL_SERIES',
    'scope(t), completed(t)',
    ['Sprint.burnupCoverageStartedAt', 'SprintBurnupEvent']
  ),
  I47: define(
    'I47',
    'Velocity',
    'Pontos concluídos de Sprints encerradas elegíveis.',
    'HOURS',
    'HISTORICAL_SERIES',
    'completedPoints por Sprint CONCLUIDA',
    ['Sprint.historicalSummary'],
    ['limit']
  ),
  I71: define(
    'I71',
    'Sprint com mudança de escopo',
    'Entradas e saídas sem score.',
    'TASKS',
    'CURRENT_OR_FROZEN',
    'scopeChange.added e scopeChange.removed',
    ['Sprint.progress.scopeChange']
  ),
  I72: define(
    'I72',
    'Carry-over atual',
    'Pendências recebidas de outra Sprint no escopo corrente.',
    'TASKS',
    'CURRENT_STATE',
    'COUNT(participação corrente com carriedFromSprintId)',
    ['SprintTask.carriedFromSprintId']
  )
});
