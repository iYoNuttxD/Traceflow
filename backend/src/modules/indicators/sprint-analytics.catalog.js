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
    'Soma das estimativas conhecidas das tarefas planejadas no início da Sprint, em horas. Usa o planejamento preservado; estimativas ausentes deixam a cobertura parcial.',
    ['SprintTask.plannedAtStart', 'SprintTask.pointsAtPlanning']
  ),
  I37: define(
    'I37',
    'Pontos atuais',
    'Escopo corrente ou congelado no encerramento.',
    'HOURS',
    'CURRENT_OR_FROZEN',
    'Soma das estimativas conhecidas das tarefas que compõem o escopo da Sprint, em horas. Usa o escopo atual enquanto aberta e o escopo preservado no encerramento quando encerrada.',
    ['SprintTask', 'Task.estimatedEffort']
  ),
  I38: define(
    'I38',
    'Pontos entregues',
    'Escopo concluído no corte da Sprint.',
    'HOURS',
    'CURRENT_OR_FROZEN',
    'Soma das estimativas conhecidas das tarefas concluídas que pertencem ao escopo da Sprint, em horas. Em Sprints encerradas, usa os valores preservados no fechamento.',
    ['SprintTask', 'Sprint.historicalSummary']
  ),
  I39: define(
    'I39',
    'Tasks planejadas',
    'Participações no baseline inicial.',
    'TASKS',
    'FROZEN',
    'Quantidade de tarefas que pertenciam ao planejamento inicial preservado da Sprint.',
    ['SprintTask.plannedAtStart']
  ),
  I40: define(
    'I40',
    'Tasks entregues',
    'Participações concluídas no corte.',
    'TASKS',
    'CURRENT_OR_FROZEN',
    'Quantidade de tarefas concluídas no escopo da Sprint. Em Sprints encerradas, considera o status preservado no fechamento.',
    ['SprintTask.exitStatus', 'Sprint.progress']
  ),
  I41: define(
    'I41',
    'Escopo adicionado',
    'Participações atuais incluídas depois do início.',
    'TASKS',
    'FROZEN',
    'Quantidade de tarefas fora do planejamento inicial que foram adicionadas e ainda pertencem ao escopo da Sprint. Reentradas não são contadas como eventos separados.',
    ['Sprint.progress.scopeChange']
  ),
  I42: define(
    'I42',
    'Escopo removido',
    'Participações planejadas removidas após o início.',
    'TASKS',
    'FROZEN',
    'Quantidade de tarefas do planejamento inicial que foram removidas do escopo da Sprint. Reentradas não são contadas como eventos separados.',
    ['Sprint.progress.scopeChange']
  ),
  I43: define(
    'I43',
    'Carry-over',
    'Entradas herdadas e saídas transferidas da Sprint.',
    'TASKS',
    'CURRENT_OR_FROZEN',
    'Quantidade de tarefas recebidas de outras Sprints que permanecem no escopo e quantidade de tarefas transferidas para outras Sprints. Em Sprints encerradas, as saídas usam o registro congelado no fechamento.',
    ['SprintTask.carriedFromSprintId', 'Sprint.progress.carryOver']
  ),
  I44: define(
    'I44',
    'Estimado × realizado',
    'Resumo canônico de esforço S1-06.',
    'HOURS',
    'CURRENT_OR_FROZEN',
    'Soma do esforço estimado e soma do esforço realizado das tarefas da Sprint, em horas. O desvio é (Realizado − Estimado) quando a cobertura é completa. Sprints encerradas usam os registros preservados no fechamento.',
    ['Sprint.progress.effort', 'SprintTask.closingTaskSnapshot']
  ),
  I45: define(
    'I45',
    'Burndown',
    'Série diária canônica de trabalho restante.',
    'HOURS',
    'HISTORICAL_SERIES',
    'Trabalho restante em cada dia = Escopo estimado − Trabalho concluído, em horas. Com histórico capturado, respeita mudanças e usa o escopo inicial conhecido na linha ideal até o fim nominal. Sem esse histórico, usa uma aproximação legada do escopo disponível, sem reconstruir mudanças passadas.',
    ['Sprint.progress.burndown', 'SprintBurnupEvent']
  ),
  I46: define(
    'I46',
    'Burnup',
    'Escopo e concluído ao longo do tempo, somente com história íntegra.',
    'HOURS',
    'HISTORICAL_SERIES',
    'Soma das estimativas do escopo e soma das estimativas das tarefas concluídas ao fim de cada dia UTC, em horas. Usa os fatos históricos da Sprint; dias com estimativa desconhecida ficam sem valor.',
    ['Sprint.burnupCoverageStartedAt', 'SprintBurnupEvent']
  ),
  I47: define(
    'I47',
    'Velocity',
    'Pontos concluídos de Sprints encerradas elegíveis.',
    'HOURS',
    'HISTORICAL_SERIES',
    'Soma das estimativas das tarefas concluídas no fechamento de cada Sprint concluída, em horas. Somente Sprints com histórico íntegro entram; Sprints abertas ou canceladas são excluídas.',
    ['Sprint.historicalSummary'],
    ['limit']
  ),
  I71: define(
    'I71',
    'Sprint com mudança de escopo',
    'Entradas e saídas sem score.',
    'TASKS',
    'CURRENT_OR_FROZEN',
    'Quantidade de tarefas adicionadas fora do planejamento inicial e ainda no escopo, e quantidade de tarefas planejadas que foram removidas. Há mudança de escopo quando qualquer uma dessas quantidades é maior que zero.',
    ['Sprint.progress.scopeChange']
  ),
  I72: define(
    'I72',
    'Carry-over atual',
    'Tarefas recebidas de outra Sprint que permanecem no escopo corrente, inclusive concluídas.',
    'TASKS',
    'CURRENT_STATE',
    'Quantidade de tarefas recebidas de outra Sprint que ainda pertencem ao escopo atual, incluindo as já concluídas. Não se aplica a Sprints encerradas.',
    ['SprintTask.carriedFromSprintId']
  )
});
