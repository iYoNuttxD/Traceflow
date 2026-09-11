export const situations = {
  SEM_RASTREABILIDADE: ['Sem rastreabilidade', 'neutral'],
  PLANEJADO: ['Planejado', 'neutral'],
  EM_DESENVOLVIMENTO: ['Em desenvolvimento', 'info'],
  IMPLEMENTADO: ['Implementado', 'info'],
  AGUARDANDO_VALIDACAO: ['Aguardando validação', 'warning'],
  EM_VALIDACAO: ['Em validação', 'info'],
  COM_FALHA: ['Com falha', 'danger'],
  EM_CORRECAO: ['Em correção', 'warning'],
  AGUARDANDO_RETESTE: ['Aguardando reteste', 'warning'],
  VALIDADO: ['Validado', 'success'],
  CONCLUIDO: ['Concluído', 'success']
};
export const requirementStatuses = {
  CADASTRADO: 'Cadastrado',
  APROVADO: 'Aprovado',
  EM_IMPLEMENTACAO: 'Em implementação',
  VALIDADO: 'Validado',
  CONCLUIDO: 'Concluído',
  PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em andamento',
  CANCELADO: 'Cancelado'
};
export const situationLabel = (value) => situations[value]?.[0] || 'Situação indisponível';
export const historyReasons = {
  BASELINE_INITIALIZED: 'Baseline da rastreabilidade registrado',
  RECONCILIATION: 'Rastreabilidade reconciliada',
  TRACEABILITY_POLICY_RECONCILIATION:
    'Situação reconciliada após atualização das regras de rastreabilidade',
  REQUIREMENT_CREATED: 'Requisito criado',
  REQUIREMENT_UPDATED: 'Requisito atualizado',
  REQUIREMENT_STATUS_CHANGED: 'Status do requisito alterado',
  REQUIREMENT_DELETED: 'Requisito excluído',
  TASK_CREATED: 'Tarefa criada',
  TASK_UPDATED: 'Tarefa atualizada',
  TASK_DELETED: 'Tarefa excluída',
  TASK_REQUIREMENT_CHANGED: 'Vínculo entre tarefa e requisito alterado',
  TASK_STATUS_CHANGED: 'Status da tarefa alterado',
  TECHNICAL_EVIDENCE_CHANGED: 'Evidência técnica alterada',
  TESTCASE_CREATED: 'Caso de teste criado',
  TESTCASE_UPDATED: 'Caso de teste atualizado',
  TESTCASE_STATUS_CHANGED: 'Status do caso de teste alterado',
  TESTCASE_DELETED: 'Caso de teste excluído',
  TEST_EXECUTION_RECORDED: 'Execução de teste registrada',
  DEFECT_CREATED: 'Defeito criado',
  DEFECT_UPDATED: 'Defeito atualizado',
  DEFECT_DELETED: 'Defeito excluído',
  DEFECT_CORRECTION_CHANGED: 'Correção do defeito alterada',
  DEFECT_RETEST_RECORDED: 'Reteste do defeito registrado'
};
export const sourceLabels = {
  Requirement: 'Requisito',
  Task: 'Tarefa',
  TestCase: 'Caso de teste',
  TestExecution: 'Execução',
  Defect: 'Defeito'
};
export const emptyFilters = {
  search: '',
  situation: '',
  requirementStatus: '',
  hasTests: '',
  hasOpenDefects: '',
  hasTechnicalEvidence: ''
};
export const percentageLabel = (progress) =>
  progress?.percentage == null
    ? 'Sem dados'
    : `${Number(progress.percentage).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
export function overviewMetrics(summary) {
  const sum = (keys) =>
    summary ? keys.reduce((total, key) => total + (summary.bySituation[key] ?? 0), 0) : undefined;
  return [
    ['Requisitos', summary?.total, 'Todos os requisitos do projeto'],
    [
      'Em desenvolvimento',
      sum(['PLANEJADO', 'EM_DESENVOLVIMENTO', 'IMPLEMENTADO']),
      'Planejado, Em desenvolvimento e Implementado'
    ],
    [
      'Em validação',
      sum(['AGUARDANDO_VALIDACAO', 'EM_VALIDACAO', 'VALIDADO']),
      'Aguardando validação, Em validação e Validado'
    ],
    ['Com defeito', summary?.withDefect, 'Com falha, Em correção ou Aguardando reteste'],
    ['Concluídos', summary?.bySituation.CONCLUIDO, 'Somente requisitos na situação Concluído']
  ];
}
export function mergeById(previous, next, getId = (item) => item.id) {
  return [...new Map([...previous, ...next].map((item) => [getId(item), item])).values()];
}
