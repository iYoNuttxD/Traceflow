import { formatDateTime } from './dashboard-display.js';

// Calculation rules are user-facing metadata owned by the backend catalog.
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
  'S1-09 situation': 'Rastreabilidade, casos de teste e defeitos dos requisitos',
  'S1-09 implementation': 'Tarefas e evidências técnicas dos requisitos',
  'S1-09 buildMatrixSummary.averageProgress': 'Progresso dos requisitos',
  I02: 'Commits sincronizados da branch main',
  I03: 'Conclusões das tarefas',
  I04: 'Histórico sincronizado de retrabalho de Pull Requests'
};

export function presentFormula(formula) {
  if (!formula?.trim()) return 'Descrição do cálculo indisponível no momento.';
  return formula.trim();
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
