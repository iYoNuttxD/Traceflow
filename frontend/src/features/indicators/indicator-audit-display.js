import { formatDateTime } from './dashboard-display.js';

// Presentation vocabulary, not metric definitions: the expression remains API-owned.
const TERMS = {
  COUNT: 'Contagem de',
  'COUNT DISTINCT': 'Contagem distinta de',
  DISTINCT: 'distintos',
  SUM: 'Soma',
  MEDIAN: 'Mediana',
  MEAN: 'Média',
  WHERE: 'quando',
  AND: 'e',
  'GROUP BY': 'agrupados por',
  'IS NULL': 'não informado',
  Task: 'tarefa',
  Tasks: 'tarefas',
  TaskMovement: 'movimentações das tarefas',
  Commit: 'commit',
  PullRequest: 'Pull Request',
  Issue: 'Issue',
  TestExecution: 'execuções de teste',
  TestCase: 'caso de teste',
  TestCases: 'casos de teste',
  Defect: 'defeito',
  Defects: 'defeitos',
  Requirement: 'requisito',
  Requirements: 'requisitos',
  Sprint: 'Sprint',
  'Commit.id': 'commits',
  'PullRequest.id': 'Pull Requests',
  'Task.id': 'tarefas',
  'Task.status': 'tarefas com status',
  'Task.createdAt': 'criação da tarefa',
  'Defect.createdAt': 'criação do defeito',
  'Task.actualEffort': 'esforço realizado',
  'PullRequest.state': 'Pull Requests com estado',
  'Issue.state': 'Issues com estado',
  'Sprint.effort': 'esforço estimado e realizado da Sprint',
  'VALIDATED.occurredAt': 'instante da validação',
  'implementation.implemented': 'implementação marcada',
  'scopeChange.added': 'entradas de escopo',
  'scopeChange.removed': 'saídas de escopo',
  'Sprint historical projection': 'histórico da Sprint',
  responsibleUserId: 'responsável',
  estimatedEffort: 'estimativa de esforço',
  actualEffort: 'esforço realizado',
  pointsAtPlanning: 'estimativa no planejamento',
  plannedAtStart: 'planejada no início',
  completedPoints: 'esforço concluído',
  carriedFromSprintId: 'transferência de Sprint anterior',
  createdAtGithub: 'abertura no GitHub',
  mergedAtGithub: 'merge no GitHub',
  closedAtGithub: 'fechamento no GitHub',
  pullRequestId: 'Pull Requests',
  defectId: 'defeitos',
  currentVersion: 'versão atual',
  severity: 'severidade',
  situation: 'situação',
  deadline: 'prazo',
  asOf: 'instante do cálculo',
  points: 'estimativas',
  remaining: 'trabalho restante',
  scope: 'escopo',
  completed: 'trabalho concluído',
  incoming: 'entradas',
  outgoing: 'saídas',
  from: 'a partir do',
  t: 'dia',
  coorte: 'grupo',
  PASS: 'aprovadas',
  FAIL: 'falhas',
  BLOCKED: 'bloqueadas',
  VALIDATED: 'validação',
  CLOSED: 'fechadas',
  REOPENED: 'reabertas',
  ORIGIN: 'de origem',
  EM_ANDAMENTO: 'em andamento',
  CONCLUIDO: 'concluído',
  CONCLUIDA: 'concluída',
  open: 'aberto',
  closed: 'fechado',
  true: 'sim',
  I02: 'commits na main por responsável',
  I03: 'tarefas concluídas por responsável',
  I04: 'taxa de retrabalho de Pull Requests'
};

const SOURCE_LABELS = {
  Task: 'Tarefas do projeto',
  TaskMovement: 'Histórico de movimentações das tarefas',
  Commit: 'Commits sincronizados do GitHub',
  CommitBranch: 'Commits sincronizados por branch',
  GitBranch: 'Branches sincronizadas do GitHub',
  GitHubIdentity: 'Associação de autores do GitHub',
  PullRequest: 'Pull Requests sincronizadas do GitHub',
  PullRequestLifecycleEvent: 'Histórico sincronizado de Pull Requests',
  Issue: 'Issues sincronizadas do GitHub',
  SprintTask: 'Participações das tarefas na Sprint',
  Sprint: 'Sprint e histórico preservado',
  SprintBurnupEvent: 'Histórico de escopo e entrega da Sprint',
  TestExecution: 'Execuções dos casos de teste',
  TestCase: 'Casos de teste do projeto',
  Defect: 'Defeitos registrados no projeto',
  DefectHistoryEntry: 'Histórico dos defeitos',
  DefectRetest: 'Retestes dos defeitos',
  DefectTask: 'Vínculos entre defeitos e tarefas',
  'S1-09 defect_links': 'Rastreabilidade dos defeitos',
  'S1-09 projectIndicatorCoverage': 'Rastreabilidade dos requisitos e tarefas',
  'S1-09 technicalEvidence': 'Evidências técnicas vinculadas aos requisitos',
  'S1-09 case_links': 'Casos de teste vinculados aos requisitos',
  'S1-09 situation': 'Situação dos requisitos',
  'S1-09 implementation': 'Implementação dos requisitos',
  'S1-09 buildMatrixSummary.averageProgress': 'Progresso dos requisitos',
  I02: 'Commits sincronizados da branch main',
  I03: 'Conclusões das tarefas',
  I04: 'Histórico sincronizado de retrabalho de Pull Requests'
};

export function presentFormula(formula) {
  if (!formula?.trim()) return 'Descrição do cálculo indisponível no momento.';
  return formula
    .replace(/Sprint historical projection|COUNT DISTINCT|GROUP BY|IS NULL/g, (term) => TERMS[term])
    .replace(
      /\b[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*\b/g,
      (term) => TERMS[term] ?? term
    );
}

export function indicatorAuditDetails(indicator, metadata) {
  const sources = indicator.sources ?? [];
  // These requirement projections include synchronized technical evidence.
  const external =
    indicator.sourceSyncStatus != null ||
    sources.some(
      (source) =>
        /^(Commit|Git|PullRequest|Issue|I02|I04)/.test(source) ||
        ['S1-09 technicalEvidence', 'S1-09 situation', 'S1-09 implementation'].includes(source)
    );
  const clock =
    indicator.state === 'UNAVAILABLE'
      ? null
      : external
        ? indicator.sourceUpdatedAt
        : indicator.asOf;
  const validClock = clock && Number.isFinite(new Date(clock).getTime());
  return {
    formula: presentFormula(indicator.formula),
    sources: [
      ...new Set(
        sources.map(
          (source) =>
            SOURCE_LABELS[source] ??
            SOURCE_LABELS[source.split('.')[0]] ??
            metadata?.source ??
            'Registros do projeto'
        )
      )
    ],
    clockLabel: external
      ? indicator.state === 'STALE'
        ? 'Última atualização da fonte'
        : 'Fonte atualizada'
      : 'Calculado com dados até',
    clock: validClock ? formatDateTime(clock) : 'Indisponível no momento.'
  };
}
