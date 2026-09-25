function define(id, category, title, unit, temporalType, eventClock, formula, sources) {
  return Object.freeze({
    id,
    rf: null,
    category,
    title,
    description: title,
    unit,
    temporalType,
    eventClock,
    supportedFilters: temporalType === 'EVENT' ? ['period'] : [],
    definitionVersion: 1,
    formula,
    sources
  });
}

const quality = (id, title, unit, temporalType, clock, formula, sources) =>
  define(id, 'QUALITY', title, unit, temporalType, clock, formula, sources);
const traceability = (id, title, formula, sources) =>
  define(id, 'TRACEABILITY', title, 'PERCENT', 'CURRENT_STATE', null, formula, sources);

export const QUALITY_TRACEABILITY_INDICATORS = Object.freeze({
  I48: quality(
    'I48',
    'Execuções por resultado',
    'EXECUTIONS',
    'EVENT',
    'TestExecution.executedAt',
    'COUNT(TestExecution) por PASS, FAIL, BLOCKED',
    ['TestExecution.result', 'TestExecution.executedAt']
  ),
  I49: quality(
    'I49',
    'Pass rate',
    'PERCENT',
    'EVENT',
    'TestExecution.executedAt',
    'PASS / (PASS + FAIL + BLOCKED) × 100',
    ['TestExecution.result', 'TestExecution.executedAt']
  ),
  I50: quality(
    'I50',
    'Fail rate',
    'PERCENT',
    'EVENT',
    'TestExecution.executedAt',
    'FAIL / (PASS + FAIL + BLOCKED) × 100',
    ['TestExecution.result', 'TestExecution.executedAt']
  ),
  I51: quality(
    'I51',
    'Blocked rate',
    'PERCENT',
    'EVENT',
    'TestExecution.executedAt',
    'BLOCKED / (PASS + FAIL + BLOCKED) × 100',
    ['TestExecution.result', 'TestExecution.executedAt']
  ),
  I52: quality(
    'I52',
    'Saúde atual dos TestCases',
    'TEST_CASES',
    'CURRENT_STATE',
    null,
    'última execução da currentVersion por TestCase ativo',
    ['TestCase.currentVersion', 'TestExecution']
  ),
  I53: quality(
    'I53',
    'Defeitos por estado',
    'DEFECTS',
    'CURRENT_STATE',
    null,
    'COUNT(Defect não excluído) por status',
    ['Defect.status', 'Defect.deletedAt']
  ),
  I54: quality(
    'I54',
    'Defeitos por severidade',
    'DEFECTS',
    'CURRENT_STATE',
    null,
    'COUNT(Defect não excluído) por severity',
    ['Defect.severity', 'Defect.deletedAt']
  ),
  I55: quality(
    'I55',
    'Defeitos criados',
    'DEFECTS',
    'EVENT',
    'Defect.createdAt',
    'COUNT(Defect não excluído criado no período)',
    ['Defect.createdAt', 'Defect.deletedAt']
  ),
  I56: quality(
    'I56',
    'Defeitos validados',
    'DEFECTS',
    'EVENT',
    'DefectHistoryEntry.occurredAt',
    'COUNT(DISTINCT defectId) com VALIDATED no período',
    ['DefectHistoryEntry.action', 'DefectHistoryEntry.occurredAt']
  ),
  I57: quality(
    'I57',
    'Tempo de correção',
    'DAYS',
    'EVENT',
    'primeiro DefectHistoryEntry.VALIDATED.occurredAt',
    'MEDIAN(primeiro VALIDATED.occurredAt − Defect.createdAt)',
    ['Defect.createdAt', 'DefectHistoryEntry']
  ),
  I58: quality(
    'I58',
    'Sucesso de reteste',
    'PERCENT',
    'EVENT',
    'TestExecution.executedAt',
    'retestes PASS / (PASS + FAIL + BLOCKED) × 100',
    ['DefectRetest', 'TestExecution.result']
  ),
  I59: quality(
    'I59',
    'Concentração por Requirement',
    'DEFECTS',
    'CURRENT_STATE',
    null,
    'Defects distintos diretos ou via Task ORIGIN por Requirement',
    ['S1-09 defect_links']
  ),
  I60: quality(
    'I60',
    'Concentração por Task de origem',
    'DEFECTS',
    'CURRENT_STATE',
    null,
    'Defects distintos por Task ORIGIN',
    ['DefectTask.relationType', 'Defect.deletedAt']
  ),
  I61: traceability(
    'I61',
    'Requirements com Tasks',
    'Requirements com Task / total Requirements × 100',
    ['S1-09 projectIndicatorCoverage']
  ),
  I62: traceability(
    'I62',
    'Requirements com evidência técnica',
    'Requirements com PR/commit via Task / total Requirements × 100',
    ['S1-09 technicalEvidence']
  ),
  I63: traceability(
    'I63',
    'Requirements com TestCase',
    'Requirements com TestCase ativo relevante / total Requirements × 100',
    ['S1-09 case_links']
  ),
  I64: traceability(
    'I64',
    'Requirements com Defect ativo',
    'Requirements com Defect ativo relevante / total Requirements × 100',
    ['S1-09 defect_links']
  ),
  I65: traceability(
    'I65',
    'Requirements validados',
    'Requirements com situation CONCLUIDO / total Requirements × 100',
    ['S1-09 situation']
  ),
  I66: traceability(
    'I66',
    'Cobertura de implementação',
    'Requirements com implementation.implemented / total Requirements × 100',
    ['S1-09 implementation']
  ),
  I67: traceability(
    'I67',
    'Progresso médio por Requirement',
    'média do percentual de progresso de cada Requirement',
    ['S1-09 buildMatrixSummary.averageProgress']
  )
});
