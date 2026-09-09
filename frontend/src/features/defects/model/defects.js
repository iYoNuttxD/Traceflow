export const statuses = {
  ABERTO: 'Aberto',
  EM_CORRECAO: 'Em correção',
  AGUARDANDO_RETESTE: 'Aguardando reteste',
  VALIDADO: 'Validado'
};
export const severities = { BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta', CRITICA: 'Crítica' };
export const taskStatuses = {
  A_FAZER: 'A Fazer',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDO: 'Concluída'
};
export const filtersDefault = {
  search: '',
  status: '',
  severity: '',
  responsibleUserId: '',
  requirementId: '',
  originTaskId: '',
  correctionTaskId: '',
  testCaseId: ''
};
export const mergeItems = (a, b) => [...new Map([...a, ...b].map((v) => [v.id, v])).values()];
export const defectLabel = (d) => `${d.displayId || `DEF-${d.id}`} · ${d.title}`;
export const taskLabel = (t) => `TASK-${t.id} · ${t.title}`;
export const requirementLabel = (r) => `REQ-${r.id} · ${r.title}`;
export const executionLabel = (id) => `EXEC-${String(id).padStart(4, '0')}`;
export const dateLabel = (value) => (value ? new Date(value).toLocaleString('pt-BR') : '—');
export const contextualAction = (status) =>
  status === 'AGUARDANDO_RETESTE'
    ? 'Retestar'
    : status === 'ABERTO'
      ? 'Gerenciar correção'
      : status === 'EM_CORRECAO'
        ? 'Ver correção'
        : null;
export function statusReason(d) {
  const r = d.statusReason;
  if (!r) return '';
  if (d.status === 'VALIDADO' && r.validatedByExecutionId)
    return `Correção confirmada pela ${executionLabel(r.validatedByExecutionId)}.`;
  if (!r.correctionTasksTotal) return 'Nenhuma tarefa de correção vinculada neste ciclo.';
  if (d.status === 'ABERTO') return 'Todas as tarefas de correção estão em A Fazer.';
  if (d.status === 'AGUARDANDO_RETESTE')
    return r.correctionTasksTotal === 1
      ? 'A tarefa de correção foi concluída.'
      : `Todas as ${r.correctionTasksTotal} tarefas de correção foram concluídas.`;
  return `${r.done} de ${r.correctionTasksTotal} tarefas de correção concluídas. ${r.inProgress} em andamento.`;
}
export function validateDefect(form) {
  const e = {};
  if (!form.title.trim()) e.title = 'Informe o título.';
  if (form.title.length > 200) e.title = 'Use até 200 caracteres.';
  if (!form.description.trim()) e.description = 'Informe a descrição.';
  if (form.description.length > 10000) e.description = 'Use até 10000 caracteres.';
  if (!severities[form.severity]) e.severity = 'Selecione a severidade.';
  if (!form.responsibleUserId) e.responsibleUserId = 'Selecione um membro ativo.';
  if (!form.requirementId && !form.originTaskIds.length)
    e.traceability = 'Vincule o defeito a pelo menos um requisito ou uma tarefa de origem.';
  return e;
}
export function defectPayload(form, defect, candidate) {
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    severity: form.severity,
    responsibleUserId: Number(form.responsibleUserId),
    requirementId: form.requirementId ? Number(form.requirementId) : null,
    originTaskIds: form.originTaskIds.map(Number),
    ...(defect
      ? { expectedRevision: defect.revision }
      : { detectedExecutionStepId: candidate.detectedExecutionStepId })
  };
}
export const historyLabels = {
  CREATED: 'Defeito criado',
  UPDATED: 'Dados alterados',
  RESPONSIBLE_CHANGED: 'Responsável alterado',
  SEVERITY_CHANGED: 'Severidade alterada',
  TRACEABILITY_CHANGED: 'Rastreabilidade alterada',
  CORRECTION_TASK_LINKED: 'Tarefa de correção vinculada',
  CORRECTION_TASK_CREATED: 'Tarefa de correção criada',
  STATUS_CHANGED: 'Status alterado automaticamente',
  RETEST_RECORDED: 'Reteste realizado',
  CYCLE_REOPENED: 'Novo ciclo iniciado',
  VALIDATED: 'Defeito validado',
  DELETED: 'Defeito excluído'
};
