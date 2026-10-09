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
    'Quantidade de execuções de casos de teste realizadas no período, separadas em aprovadas, com falha e bloqueadas.',
    ['TestExecution.result', 'TestExecution.executedAt']
  ),
  I49: quality(
    'I49',
    'Pass rate',
    'PERCENT',
    'EVENT',
    'TestExecution.executedAt',
    '(Execuções aprovadas ÷ Total de execuções aprovadas, com falha ou bloqueadas no período) × 100',
    ['TestExecution.result', 'TestExecution.executedAt']
  ),
  I50: quality(
    'I50',
    'Fail rate',
    'PERCENT',
    'EVENT',
    'TestExecution.executedAt',
    '(Execuções com falha ÷ Total de execuções aprovadas, com falha ou bloqueadas no período) × 100',
    ['TestExecution.result', 'TestExecution.executedAt']
  ),
  I51: quality(
    'I51',
    'Blocked rate',
    'PERCENT',
    'EVENT',
    'TestExecution.executedAt',
    '(Execuções bloqueadas ÷ Total de execuções aprovadas, com falha ou bloqueadas no período) × 100',
    ['TestExecution.result', 'TestExecution.executedAt']
  ),
  I52: quality(
    'I52',
    'Saúde atual dos TestCases',
    'TEST_CASES',
    'CURRENT_STATE',
    null,
    'Quantidade de casos de teste ativos e não excluídos por resultado da última execução de sua versão atual. Casos sem execução dessa versão são classificados como nunca executados.',
    ['TestCase.currentVersion', 'TestExecution']
  ),
  I53: quality(
    'I53',
    'Defeitos por estado',
    'DEFECTS',
    'CURRENT_STATE',
    null,
    'Quantidade de defeitos não excluídos por estado atual. O total de ativos reúne “Aberto”, “Em correção” e “Aguardando reteste”.',
    ['Defect.status', 'Defect.deletedAt']
  ),
  I54: quality(
    'I54',
    'Defeitos por severidade',
    'DEFECTS',
    'CURRENT_STATE',
    null,
    'Quantidade de defeitos não excluídos por severidade: baixa, média, alta e crítica.',
    ['Defect.severity', 'Defect.deletedAt']
  ),
  I55: quality(
    'I55',
    'Defeitos criados',
    'DEFECTS',
    'EVENT',
    'Defect.createdAt',
    'Quantidade de defeitos não excluídos criados no período.',
    ['Defect.createdAt', 'Defect.deletedAt']
  ),
  I56: quality(
    'I56',
    'Defeitos validados',
    'DEFECTS',
    'EVENT',
    'DefectHistoryEntry.occurredAt',
    'Quantidade de defeitos distintos e não excluídos com uma validação registrada no período. Cada defeito é contado uma vez, mesmo com múltiplas validações.',
    ['DefectHistoryEntry.action', 'DefectHistoryEntry.occurredAt']
  ),
  I57: quality(
    'I57',
    'Tempo de correção',
    'DAYS',
    'EVENT',
    'primeiro DefectHistoryEntry.VALIDATED.occurredAt',
    'Mediana do tempo entre a criação do defeito e sua primeira validação registrada, em dias corridos. Considera primeiras validações ocorridas no período, com datas válidas, de defeitos não excluídos.',
    ['Defect.createdAt', 'DefectHistoryEntry']
  ),
  I58: quality(
    'I58',
    'Sucesso de reteste',
    'PERCENT',
    'EVENT',
    'TestExecution.executedAt',
    '(Tentativas de reteste aprovadas ÷ Total de tentativas aprovadas, com falha ou bloqueadas no período) × 100. Inclui todos os ciclos de correção de defeitos não excluídos.',
    ['DefectRetest', 'TestExecution.result']
  ),
  I59: quality(
    'I59',
    'Concentração por Requirement',
    'DEFECTS',
    'CURRENT_STATE',
    null,
    'Quantidade de defeitos distintos e não excluídos ligados a cada requisito, diretamente ou por tarefas de origem. A lista mostra até dez requisitos com mais defeitos; o mesmo defeito pode aparecer em requisitos diferentes.',
    ['S1-09 defect_links']
  ),
  I60: quality(
    'I60',
    'Concentração por Task de origem',
    'DEFECTS',
    'CURRENT_STATE',
    null,
    'Quantidade de defeitos distintos e não excluídos por tarefa de origem. A lista mostra até dez tarefas com mais defeitos; vínculos de correção não entram.',
    ['DefectTask.relationType', 'Defect.deletedAt']
  ),
  I61: traceability(
    'I61',
    'Requirements com Tasks',
    '(Requisitos com ao menos uma tarefa vinculada ÷ Total de requisitos) × 100',
    ['S1-09 projectIndicatorCoverage']
  ),
  I62: traceability(
    'I62',
    'Requirements com evidência técnica',
    '(Requisitos com ao menos um Commit ou Pull Request vinculado por uma tarefa ÷ Total de requisitos) × 100',
    ['S1-09 technicalEvidence']
  ),
  I63: traceability(
    'I63',
    'Requirements com TestCase',
    '(Requisitos com ao menos um caso de teste ativo e não excluído vinculado diretamente ou por uma tarefa ÷ Total de requisitos) × 100',
    ['S1-09 case_links']
  ),
  I64: traceability(
    'I64',
    'Requirements com Defect ativo',
    '(Requisitos com ao menos um defeito ativo ligado diretamente ou por uma tarefa de origem ÷ Total de requisitos) × 100. Defeitos excluídos ou validados não são ativos.',
    ['S1-09 defect_links']
  ),
  I65: traceability(
    'I65',
    'Requirements validados',
    '(Requisitos implementados com ao menos um caso de teste ativo relevante, todos os casos ativos relevantes aprovados na versão atual e nenhum defeito ativo ÷ Total de requisitos) × 100',
    ['S1-09 situation']
  ),
  I66: traceability(
    'I66',
    'Cobertura de implementação',
    '(Requisitos com todas as tarefas concluídas e ao menos um Commit ou Pull Request vinculado a uma delas ÷ Total de requisitos) × 100. Falhas em testes e defeitos não apagam essa implementação técnica.',
    ['S1-09 implementation']
  ),
  I67: traceability(
    'I67',
    'Progresso médio por Requirement',
    'Média dos percentuais de tarefas concluídas de cada requisito, com o mesmo peso para todos os requisitos. Requisitos sem tarefas contribuem com zero.',
    ['S1-09 buildMatrixSummary.averageProgress']
  )
});
