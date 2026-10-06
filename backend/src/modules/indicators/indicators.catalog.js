import { FLOW_TASK_INDICATORS } from './flow-task.catalog.js';
import { SPRINT_ANALYTICS_INDICATORS } from './sprint-analytics.catalog.js';
import { QUALITY_TRACEABILITY_INDICATORS } from './quality-traceability.catalog.js';

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
    formula: '(Tarefas concluídas ÷ Total de tarefas) × 100',
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
    formula:
      'Quantidade de Commits distintos da branch main no período, agrupados pelo responsável associado à identidade GitHub. Autores sem associação permanecem separados.',
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
    formula:
      'Quantidade de tarefas distintas cuja última movimentação até o fim do período é uma conclusão ocorrida no período, agrupadas pelo responsável registrado nessa conclusão.',
    sources: ['TaskMovement.movedAt', 'TaskMovement.responsibleUserIdSnapshot']
  }),
  I04: Object.freeze({
    id: 'I04',
    rf: 'RF18',
    category: 'GITHUB',
    title: 'Taxa de retrabalho de PR',
    description: 'PRs distintas fechadas na coorte que reabriram antes do corte.',
    unit: 'PERCENT',
    temporalType: 'EVENT',
    eventClock: 'PullRequestLifecycleEvent.occurredAt',
    supportedFilters: ['period'],
    definitionVersion: 1,
    formula:
      '(Pull Requests distintas reabertas após seu primeiro fechamento no período ÷ Pull Requests distintas fechadas no período) × 100. Somente reaberturas anteriores ao fim do período são consideradas.',
    sources: ['PullRequestLifecycleEvent']
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
    formula:
      'Quantidade de tarefas concluídas e de Commits na main por responsável no período. Os dois totais são apresentados separadamente, sem soma ou nota.',
    sources: ['I02', 'I03']
  }),
  I06: Object.freeze({
    id: 'I06',
    rf: 'RF54',
    category: 'GITHUB',
    title: 'Qualidade oficial de PR',
    description: 'Taxa de retrabalho RF18 e taxa de PRs mescladas na mesma coorte fechada.',
    unit: 'RATE_VECTOR',
    temporalType: 'EVENT',
    eventClock: 'PullRequestLifecycleEvent.occurredAt',
    supportedFilters: ['period'],
    definitionVersion: 1,
    formula:
      'Duas taxas para as Pull Requests distintas fechadas no período: (Pull Requests reabertas após o primeiro fechamento ÷ Total de Pull Requests fechadas) × 100 e (Pull Requests mescladas até o fim do período ÷ Total de Pull Requests fechadas) × 100. As taxas não são somadas.',
    sources: ['I04', 'PullRequestLifecycleEvent', 'PullRequest.mergedAtGithub']
  }),
  I09: Object.freeze({
    id: 'I09',
    rf: null,
    category: 'GITHUB',
    title: 'Commits no período',
    description: 'Commits distintos observados no projeto, em qualquer branch.',
    unit: 'COMMITS',
    temporalType: 'EVENT',
    eventClock: 'Commit.date',
    supportedFilters: ['period'],
    definitionVersion: 1,
    formula:
      'Quantidade de Commits distintos registrados no período, considerando todas as branches do projeto.',
    sources: ['Commit.date']
  }),
  I10: Object.freeze({
    id: 'I10',
    rf: null,
    category: 'GITHUB',
    title: 'PRs abertas agora',
    description: 'Pull Requests abertas na última fotografia GitHub.',
    unit: 'PULL_REQUESTS',
    temporalType: 'CURRENT_STATE',
    eventClock: null,
    supportedFilters: [],
    definitionVersion: 1,
    formula: 'Quantidade de Pull Requests abertas na última sincronização do GitHub.',
    sources: ['PullRequest.state']
  }),
  I11: Object.freeze({
    id: 'I11',
    rf: null,
    category: 'GITHUB',
    title: 'PRs fechadas no período',
    description: 'PRs distintas com evento CLOSED no período, mesmo se reabertas depois.',
    unit: 'PULL_REQUESTS',
    temporalType: 'EVENT',
    eventClock: 'PullRequestLifecycleEvent.occurredAt',
    supportedFilters: ['period'],
    definitionVersion: 1,
    formula:
      'Quantidade de Pull Requests distintas com fechamento registrado no período, mesmo que tenham sido reabertas depois.',
    sources: ['PullRequestLifecycleEvent']
  }),
  I12: Object.freeze({
    id: 'I12',
    rf: null,
    category: 'GITHUB',
    title: 'PRs mescladas no período',
    description: 'PRs distintas com merge comprovado pelo timestamp canônico GitHub.',
    unit: 'PULL_REQUESTS',
    temporalType: 'EVENT',
    eventClock: 'PullRequest.mergedAtGithub',
    supportedFilters: ['period'],
    definitionVersion: 1,
    formula: 'Quantidade de Pull Requests cuja data de merge está no período.',
    sources: ['PullRequest.mergedAtGithub']
  }),
  I13: Object.freeze({
    id: 'I13',
    rf: null,
    category: 'GITHUB',
    title: 'Issues GitHub abertas agora',
    description: 'Issues do repositório GitHub abertas na última fotografia.',
    unit: 'ISSUES',
    temporalType: 'CURRENT_STATE',
    eventClock: null,
    supportedFilters: [],
    definitionVersion: 1,
    formula: 'Quantidade de Issues abertas na última sincronização do GitHub.',
    sources: ['Issue.state']
  }),
  I14: Object.freeze({
    id: 'I14',
    rf: null,
    category: 'GITHUB',
    title: 'Issues atualmente fechadas no período',
    description: 'Fechamento corrente; ciclos anteriores de reabertura não são coletados.',
    unit: 'ISSUES',
    temporalType: 'EVENT',
    eventClock: 'Issue.closedAtGithub',
    supportedFilters: ['period'],
    definitionVersion: 1,
    formula:
      'Quantidade de Issues atualmente fechadas cuja data de fechamento está no período. Fechamentos anteriores a reaberturas não são reconstruídos.',
    sources: ['Issue.state', 'Issue.closedAtGithub']
  }),
  I15: Object.freeze({
    id: 'I15',
    rf: null,
    category: 'GITHUB',
    title: 'Mediana até merge',
    description: 'Mediana das durações válidas de PRs mescladas no período.',
    unit: 'HOURS',
    temporalType: 'EVENT',
    eventClock: 'PullRequest.mergedAtGithub',
    supportedFilters: ['period'],
    definitionVersion: 1,
    formula:
      'Mediana do tempo entre a abertura e o merge das Pull Requests mescladas no período, em horas. Somente datas válidas e durações não negativas entram na amostra.',
    sources: ['PullRequest.createdAtGithub', 'PullRequest.mergedAtGithub']
  }),
  I16: Object.freeze({
    id: 'I16',
    rf: null,
    category: 'GITHUB',
    title: 'Média até merge',
    description: 'Média das mesmas durações válidas de I15; sensível a outliers.',
    unit: 'HOURS',
    temporalType: 'EVENT',
    eventClock: 'PullRequest.mergedAtGithub',
    supportedFilters: ['period'],
    definitionVersion: 1,
    formula:
      'Média do tempo entre a abertura e o merge das Pull Requests mescladas no período, em horas. Somente datas válidas e durações não negativas entram na amostra.',
    sources: ['PullRequest.createdAtGithub', 'PullRequest.mergedAtGithub']
  }),
  I17: Object.freeze({
    id: 'I17',
    rf: null,
    category: 'GITHUB',
    title: 'PRs abertas mais antigas',
    description: 'Total de PRs abertas com idade válida e lista das dez mais antigas.',
    unit: 'DAYS',
    temporalType: 'CURRENT_STATE',
    eventClock: null,
    supportedFilters: [],
    definitionVersion: 1,
    formula:
      'Idade de cada Pull Request aberta: tempo entre a abertura e a consulta, em dias. O total conta todas as abertas com data válida; a lista mostra até dez das mais antigas.',
    sources: ['PullRequest.state', 'PullRequest.createdAtGithub']
  }),
  I18: Object.freeze({
    id: 'I18',
    rf: null,
    category: 'GITHUB',
    title: 'Mediana até fechamento de Issue',
    description: 'Mediana de duração do fechamento corrente das Issues.',
    unit: 'DAYS',
    temporalType: 'EVENT',
    eventClock: 'Issue.closedAtGithub',
    supportedFilters: ['period'],
    definitionVersion: 1,
    formula:
      'Mediana do tempo entre a abertura e o fechamento atual das Issues fechadas no período, em dias. Somente datas válidas e durações não negativas entram na amostra.',
    sources: ['Issue.createdAtGithub', 'Issue.closedAtGithub']
  }),
  I73: Object.freeze({
    id: 'I73',
    rf: null,
    category: 'GITHUB',
    title: 'Idade média das PRs abertas',
    description: 'Média de idade da fila atual de PRs abertas.',
    unit: 'DAYS',
    temporalType: 'CURRENT_STATE',
    eventClock: null,
    supportedFilters: [],
    definitionVersion: 1,
    formula:
      'Média do tempo entre a abertura e a consulta de todas as Pull Requests atualmente abertas com data válida, em dias.',
    sources: ['PullRequest.state', 'PullRequest.createdAtGithub']
  }),
  I74: Object.freeze({
    id: 'I74',
    rf: null,
    category: 'GITHUB',
    title: 'Tempo médio até fechamento de Issue',
    description: 'Média da mesma amostra de fechamento corrente de I18.',
    unit: 'DAYS',
    temporalType: 'EVENT',
    eventClock: 'Issue.closedAtGithub',
    supportedFilters: ['period'],
    definitionVersion: 1,
    formula:
      'Média do tempo entre a abertura e o fechamento atual das Issues fechadas no período, em dias. Somente datas válidas e durações não negativas entram na amostra.',
    sources: ['Issue.createdAtGithub', 'Issue.closedAtGithub']
  }),
  ...FLOW_TASK_INDICATORS,
  ...SPRINT_ANALYTICS_INDICATORS,
  ...QUALITY_TRACEABILITY_INDICATORS
});
