export const ALERT_TYPES = Object.freeze({
  TASK_CONCLUDED_WITHOUT_COMMIT: Object.freeze({
    label: 'Tarefa concluída sem commit',
    singular: 'tarefa concluída sem commit',
    plural: 'tarefas concluídas sem commit',
    fact: 'Concluída em',
    missingFact: 'Data da conclusão indisponível'
  }),
  PULL_REQUEST_MERGED_WITHOUT_TASK: Object.freeze({
    label: 'PR mesclada sem tarefa',
    singular: 'PR mesclada sem tarefa',
    plural: 'PRs mescladas sem tarefa',
    fact: 'Mesclada em',
    missingFact: 'Data do merge indisponível'
  }),
  ISSUE_CLOSED_WITHOUT_TASK: Object.freeze({
    label: 'Issue fechada sem tarefa',
    singular: 'issue fechada sem tarefa',
    plural: 'issues fechadas sem tarefa',
    fact: 'Fechada em',
    missingFact: 'Data do fechamento indisponível'
  })
});

export const ALERT_STATUSES = Object.freeze({
  OPEN: Object.freeze({ label: 'Aberto', filter: 'Abertos', tone: 'warning' }),
  DISMISSED: Object.freeze({ label: 'Dispensado', filter: 'Dispensados', tone: 'neutral' }),
  RESOLVED: Object.freeze({ label: 'Resolvido', filter: 'Resolvidos', tone: 'success' })
});

export const RESOLUTION_REASONS = Object.freeze({
  COMMIT_LINKED: 'Commit vinculado',
  TASK_REOPENED: 'Tarefa reaberta',
  TASK_DELETED: 'Tarefa excluída',
  PULL_REQUEST_LINKED: 'PR vinculada a uma tarefa',
  ISSUE_LINKED: 'Issue vinculada a uma tarefa',
  ISSUE_REOPENED: 'Issue reaberta',
  RULE_NO_LONGER_APPLIES: 'Regra deixou de se aplicar'
});

export const TASK_STATUSES = Object.freeze({
  A_FAZER: 'A fazer',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDO: 'Concluído'
});

export const DISMISS_REASON_MIN = 10;
export const DISMISS_REASON_MAX = 500;

export const emptyAlertFilters = Object.freeze({ status: 'OPEN', type: '' });

export const alertTypeLabel = (type) => ALERT_TYPES[type]?.label || 'Alerta';
export const alertStatusLabel = (status) =>
  ALERT_STATUSES[status]?.label || 'Situação indisponível';
export const alertStatusTone = (status) => ALERT_STATUSES[status]?.tone || 'neutral';
export const resolutionLabel = (reason) => RESOLUTION_REASONS[reason] || 'Motivo indisponível';
export const taskStatusLabel = (status) => TASK_STATUSES[status] || 'Status indisponível';

export function formatInstant(value) {
  if (!value) return '';
  const date = new Date(value);
  return `${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  })}`;
}

export function alertFactText(alert) {
  const type = ALERT_TYPES[alert.type];
  if (!type) return '';
  return alert.occurredAt ? `${type.fact} ${formatInstant(alert.occurredAt)}` : type.missingFact;
}

const counted = (count, singular, plural) => `${count} ${count === 1 ? singular : plural}`;

export function alertSummarySentence(summary) {
  if (!summary) return '';
  const total = summary.open.total;
  if (!total) return 'Nenhum alerta aberto.';
  const parts = Object.entries(ALERT_TYPES)
    .map(([type, labels]) => [summary.open.byType[type] || 0, labels])
    .filter(([count]) => count > 0)
    .map(([count, labels]) => counted(count, labels.singular, labels.plural));
  return `${counted(total, 'alerta aberto', 'alertas abertos')}: ${parts.join(', ')}.`;
}

export function reconcileMessage(result) {
  return `Reprocessamento concluído: ${counted(result.created, 'novo', 'novos')}, ${counted(
    result.resolved,
    'resolvido',
    'resolvidos'
  )}, ${counted(result.kept, 'mantido', 'mantidos')}.`;
}

export function unlinkedCountLabel(total) {
  if (total === undefined || total === null) return '';
  return counted(total, 'tarefa sem vínculo técnico', 'tarefas sem vínculo técnico');
}

export const dismissReasonLength = (reason) => Array.from(String(reason ?? '').trim()).length;

export function validateDismissReason(reason) {
  const length = dismissReasonLength(reason);
  if (length < DISMISS_REASON_MIN || length > DISMISS_REASON_MAX)
    return `A justificativa deve ter entre ${DISMISS_REASON_MIN} e ${DISMISS_REASON_MAX} caracteres.`;
  return '';
}

export function reconciliationNotice(reconciliation, canManage) {
  if (!reconciliation?.stale) return '';
  const guidance = canManage
    ? 'Use Reprocessar alertas para atualizá-los.'
    : 'Peça a um gestor do projeto para reprocessar os alertas.';
  return `A última atualização dos alertas falhou em ${formatInstant(reconciliation.lastFailedAt)}. Os alertas podem estar desatualizados. ${guidance}`;
}

export function alertEmptyTitle(filters) {
  if (filters.type) return 'Nenhum alerta corresponde aos filtros.';
  if (filters.status === 'DISMISSED') return 'Nenhum alerta dispensado.';
  if (filters.status === 'RESOLVED') return 'Nenhum alerta resolvido.';
  return 'Nenhuma inconsistência pendente neste projeto.';
}

export const activeAlertFilterCount = (filters) =>
  (filters.status !== emptyAlertFilters.status ? 1 : 0) + (filters.type ? 1 : 0);

export const taskOptionLabel = (task) => (task ? `TASK-${task.id} · ${task.title}` : '');
