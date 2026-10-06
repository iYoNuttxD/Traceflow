export const HEALTH_STATUS_LABELS = {
  HEALTHY: 'Saudável',
  ATTENTION: 'Atenção',
  CRITICAL: 'Crítico',
  UNASSESSED: 'Dados insuficientes',
  NOT_APPLICABLE: 'Não se aplica'
};

export const HEALTH_DIMENSION_LABELS = {
  PLANNING: 'Planejamento',
  FLOW: 'Fluxo',
  SPRINT: 'Sprint',
  QUALITY: 'Qualidade',
  TRACEABILITY: 'Rastreabilidade',
  TECHNICAL_INTEGRATION: 'Integração técnica'
};

const number = (value) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);

export function describeHealthReason(assessment, metricId) {
  const { reasonCode, basis } = assessment ?? {};
  if (reasonCode === 'GITHUB_NOT_CONFIGURED')
    return 'A avaliação depende de uma integração GitHub configurada.';
  if (reasonCode === 'TASK_SHARE')
    return `${number(basis.count)} de ${number(basis.totalTasks)} Tasks ${
      metricId === 'I28'
        ? 'estão atrasadas'
        : metricId === 'I29'
          ? 'estão sem responsável'
          : 'estão sem estimativa'
    }.`;
  if (reasonCode === 'BASELINE_REGRESSION') {
    const unit = metricId === 'I15' ? 'h' : 'dias';
    return `${number(basis.current)} ${unit} no período atual e ${number(basis.previous)} ${unit} no anterior; ${basis.regressionPercent ? `aumento de ${number(basis.regressionPercent)}%` : 'sem regressão'} (${basis.currentSample} e ${basis.previousSample} amostras).`;
  }
  if (reasonCode === 'EFFORT_DEVIATION')
    return `${number(basis.actualHours)} h realizadas para ${number(basis.estimatedHours)} h estimadas.`;
  if (reasonCode === 'BURNDOWN_GAP')
    return `${number(basis.actualRemaining)} h restantes frente a ${number(basis.idealRemaining)} h ideais; escopo base de ${number(basis.baselineScope)} h.`;
  if (reasonCode === 'SCOPE_CHANGE')
    return `${number(basis.addedCount)} Tasks adicionadas e ${number(basis.removedCount)} removidas de ${number(basis.plannedTasks)} planejadas.`;
  if (reasonCode === 'INVERSE_PERCENT' || reasonCode === 'DIRECT_PERCENT')
    return `Valor observado: ${number(basis.value)}%.`;
  if (reasonCode === 'CURRENT_TEST_PASS')
    return `${number(basis.pass)} de ${number(basis.total)} casos ativos estão aprovados na versão atual.`;
  if (reasonCode === 'STAGE_GAP')
    return `Cobertura observada de ${number(basis.current)}% frente a ${number(basis.expected)}% no estágio anterior; lacuna de ${number(basis.gapPoints)} pontos percentuais.`;
  if (reasonCode === 'NO_OPEN_PRS') return 'Não há PRs abertas na fila atual.';
  if (reasonCode === 'OPEN_PR_AGE')
    return `${number(basis.averageOpenAgeDays)} dias de idade média das PRs abertas; mediana de merge de ${number(basis.medianMergeHours)} h.`;
  if (reasonCode?.startsWith('DATA_'))
    return 'A fonte não está plenamente disponível para pontuação.';
  if (reasonCode === 'INSUFFICIENT_BASIS')
    return 'A amostra ou a base de comparação é insuficiente para pontuação.';
  return 'Este indicador é informativo e não compõe a Saúde do Projeto.';
}
