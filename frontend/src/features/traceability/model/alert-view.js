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
  OPEN: Object.freeze({ label: 'Aberta', tone: 'warning' }),
  DISMISSED: Object.freeze({ label: 'Dispensada', tone: 'neutral' }),
  RESOLVED: Object.freeze({ label: 'Resolvida', tone: 'success' })
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

export const alertTypeLabel = (type) => ALERT_TYPES[type]?.label || 'Alerta';
export const alertStatusLabel = (status) =>
  ALERT_STATUSES[status]?.label || 'Situação indisponível';
export const alertStatusTone = (status) => ALERT_STATUSES[status]?.tone || 'neutral';
export const resolutionLabel = (reason) => RESOLUTION_REASONS[reason] || 'Motivo indisponível';
export const taskStatusLabel = (status) => TASK_STATUSES[status] || 'Status indisponível';

export const NO_REPOSITORY_MESSAGE =
  'Projeto sem repositório conectado: nenhum commit pode ser vinculado.';

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

const counted = (count, singular, plural) =>
  `${count.toLocaleString('pt-BR')} ${count === 1 ? singular : plural}`;

const SUMMARY_TARGETS = Object.freeze({
  TASK_CONCLUDED_WITHOUT_COMMIT: (projectId) =>
    `/projects/${projectId}/tasks?rastreabilidade=SEM_COMMIT`,
  PULL_REQUEST_MERGED_WITHOUT_TASK: (projectId) =>
    `/projects/${projectId}/repository?inconsistencia=OPEN&tipo=pull_request`,
  ISSUE_CLOSED_WITHOUT_TASK: (projectId) =>
    `/projects/${projectId}/repository?inconsistencia=OPEN&tipo=issue`
});

const capitalized = (text) => text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1);

export const RECONCILIATION_PENDING_MESSAGE =
  'As inconsistências deste projeto ainda não foram calculadas.';

const isPendingFirst = (summary) => summary?.reconciliation?.state === 'PENDING_FIRST';

export function inconsistencyMetrics(summary, projectId) {
  const known = Boolean(summary) && !isPendingFirst(summary);
  return Object.entries(ALERT_TYPES).map(([type, labels]) => {
    const count = known ? summary.open.byType[type] || 0 : null;
    return {
      type,
      label: capitalized(labels.plural),
      count,
      text: count === null ? '' : counted(count, labels.singular, labels.plural),
      to: SUMMARY_TARGETS[type](projectId)
    };
  });
}

export function alertSubjectFilter(alert) {
  const key = { TASK: 'taskId', PULL_REQUEST: 'pullRequestId', ISSUE: 'issueId' }[
    alert?.subject?.type
  ];
  return key && alert.subject.id ? { [key]: alert.subject.id } : null;
}

export function alertHistoryTitle(alert) {
  if (alert.status === 'DISMISSED')
    return `Dispensada por ${alert.dismissal?.by?.name || 'pessoa removida'} em ${formatInstant(
      alert.dismissal?.at
    )}`;
  if (alert.status === 'RESOLVED')
    return `Resolvida em ${formatInstant(alert.resolvedAt)} · ${resolutionLabel(alert.resolutionReason)}`;
  return `Em aberto desde ${formatInstant(alert.detectedAt)}`;
}

export function alertHistoryDetail(alert) {
  const detected = `Detectada em ${formatInstant(alert.detectedAt)}`;
  return alert.status === 'DISMISSED' && alert.dismissal?.reason
    ? `${detected}. Justificativa: “${alert.dismissal.reason}”`
    : `${detected}.`;
}

export function historyToggleLabel(total) {
  return `Histórico (${total.toLocaleString('pt-BR')})`;
}

export const dismissReasonLength = (reason) => Array.from(String(reason ?? '').trim()).length;

export function validateDismissReason(reason) {
  const length = dismissReasonLength(reason);
  if (length < DISMISS_REASON_MIN || length > DISMISS_REASON_MAX)
    return `A justificativa deve ter entre ${DISMISS_REASON_MIN} e ${DISMISS_REASON_MAX} caracteres.`;
  return '';
}

export function reconciliationNotice(reconciliation) {
  if (reconciliation?.state === 'PENDING_FIRST') return RECONCILIATION_PENDING_MESSAGE;
  if (reconciliation?.state !== 'STALE') return '';
  const { lastFailedAt, lastSucceededAt } = reconciliation;
  const failed =
    Boolean(lastFailedAt) &&
    (!lastSucceededAt || new Date(lastFailedAt).getTime() > new Date(lastSucceededAt).getTime());
  const fact = failed
    ? `falhou em ${formatInstant(lastFailedAt)}`
    : `foi em ${formatInstant(lastSucceededAt)}`;
  return `A última atualização das inconsistências ${fact}. Os números podem estar desatualizados.`;
}

export const taskOptionLabel = (task) => (task ? `TASK-${task.id} · ${task.title}` : '');
