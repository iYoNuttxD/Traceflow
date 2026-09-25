export const INDICATORS = Object.freeze({
  I01: Object.freeze({
    id: 'I01',
    rf: 'RF15',
    category: 'GENERAL',
    title: 'Progresso atual do projeto',
    description: 'Fração das Tasks atuais com status CONCLUIDO.',
    unit: 'PERCENT',
    temporalType: 'CURRENT_STATE',
    eventClock: null,
    supportedFilters: [],
    definitionVersion: 1,
    formula: '(tarefas concluídas / total de tarefas) × 100',
    sources: ['Task.status']
  }),
  I02: Object.freeze({
    id: 'I02',
    rf: 'RF16',
    category: 'GITHUB',
    title: 'Commits na main por responsável',
    description:
      'Commits distintos da fotografia confirmada da branch main por identidade GitHub estável.',
    unit: 'COMMITS',
    temporalType: 'EVENT',
    eventClock: 'Commit.date',
    supportedFilters: ['period'],
    definitionVersion: 1,
    formula: 'commits distintos na main no período, agrupados por identidade GitHub estável',
    sources: ['Commit.date', 'CommitBranch', 'GitBranch', 'GitHubIdentity']
  }),
  I03: Object.freeze({
    id: 'I03',
    rf: 'RF17',
    category: 'TASK',
    title: 'Tasks concluídas por responsável',
    description: 'Tasks distintas com conclusão vigente no corte do período.',
    unit: 'TASKS',
    temporalType: 'EVENT',
    eventClock: 'TaskMovement.movedAt',
    supportedFilters: ['period'],
    definitionVersion: 1,
    formula: 'Tasks distintas cuja última movimentação no corte é uma conclusão no período',
    sources: ['TaskMovement.movedAt', 'TaskMovement.responsibleUserIdSnapshot']
  }),
  I05: Object.freeze({
    id: 'I05',
    rf: 'RF36',
    category: 'TASK',
    title: 'Atividade por responsável',
    description: 'Apresentação conjunta de commits na main e Tasks concluídas, sem score.',
    unit: 'ACTIVITY_VECTOR',
    temporalType: 'EVENT',
    eventClock: 'Commit.date + TaskMovement.movedAt',
    supportedFilters: ['period'],
    definitionVersion: 1,
    formula: 'vetor (Tasks concluídas, commits na main); unidades não são somadas',
    sources: ['I02', 'I03']
  })
});
