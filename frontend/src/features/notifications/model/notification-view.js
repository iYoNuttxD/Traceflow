export const POLL_INTERVAL_MS = 60_000;
export const PAGE_SIZE = 20;

export const NOTIFICATION_FILTERS = Object.freeze([
  { value: 'UNREAD', label: 'Não lidas' },
  { value: 'ALL', label: 'Todas' }
]);

export const NOTIFICATION_GROUPS = Object.freeze([
  { value: 'ALL', label: 'Todas' },
  { value: 'TASKS', label: 'Tarefas' },
  { value: 'GITHUB', label: 'GitHub' },
  { value: 'INCONSISTENCIES', label: 'Inconsistências' }
]);

const GROUP_NOUNS = Object.freeze({
  ALL: 'Nenhuma notificação',
  TASKS: 'Nenhuma notificação de tarefas',
  GITHUB: 'Nenhuma notificação do GitHub',
  INCONSISTENCIES: 'Nenhuma notificação de inconsistência'
});

const INCONSISTENCY = 'TRACEABILITY_INCONSISTENCY';

const TYPE_LABELS = Object.freeze({
  TASK_STATUS_CHANGED: 'Mudança de status',
  TASK_OVERDUE: 'Prazo vencido',
  ISSUE_EVENT: 'Issue',
  PULL_REQUEST_EVENT: 'Pull request',
  [INCONSISTENCY]: 'Inconsistência'
});

const TONES = Object.freeze({
  TASK_STATUS_CHANGED: 'info',
  TASK_OVERDUE: 'danger',
  ISSUE_EVENT: 'info',
  PULL_REQUEST_EVENT: 'info',
  [INCONSISTENCY]: 'warning'
});

const ICONS = Object.freeze({
  TASK_STATUS_CHANGED: 'status',
  TASK_OVERDUE: 'clock',
  ISSUE_EVENT: 'issue',
  PULL_REQUEST_EVENT: 'merge',
  [INCONSISTENCY]: 'alert'
});

const GITHUB_TYPES = new Set(['ISSUE_EVENT', 'PULL_REQUEST_EVENT']);

const GITHUB_EVENT_VERBS = new Map([
  ['ISSUE_CLOSED', 'fechada'],
  ['ISSUE_REOPENED', 'reaberta'],
  ['PULL_REQUEST_MERGED', 'mesclada'],
  ['PULL_REQUEST_CLOSED', 'fechada sem merge']
]);

const ARTIFACT_CODES = new Map([
  ['ISSUE', 'Issue'],
  ['PULL_REQUEST', 'PR']
]);

const STATUS_LABELS = Object.freeze({
  A_FAZER: 'A fazer',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDO: 'Concluído'
});

export const PREFERENCE_GROUPS = Object.freeze([
  { key: 'TASKS', legend: 'Avisos sobre as suas tarefas' },
  { key: 'GITHUB', legend: 'Avisos do GitHub' },
  { key: 'INCONSISTENCIES', legend: 'Avisos de inconsistência do projeto' }
]);

export const PREFERENCE_OPTIONS = Object.freeze([
  {
    type: 'TASK_STATUS_CHANGED',
    group: 'TASKS',
    label: 'Mudança de status das minhas tarefas',
    description:
      'Avisa quando muda o status de uma tarefa da qual você é responsável, inclusive quando é você quem muda.'
  },
  {
    type: 'TASK_OVERDUE',
    group: 'TASKS',
    label: 'Prazo vencido das minhas tarefas',
    description:
      'Avisa uma vez quando uma tarefa da qual você é responsável passa do prazo sem estar concluída.'
  },
  {
    type: 'ISSUE_EVENT',
    group: 'GITHUB',
    label: 'Issues vinculadas às tarefas de que você participa',
    description:
      'Avisa quando uma issue aberta é vinculada a uma tarefa da qual você é responsável, em que comentou ou registrou esforço, e quando essa issue é fechada ou reaberta no GitHub.'
  },
  {
    type: 'PULL_REQUEST_EVENT',
    group: 'GITHUB',
    label: 'Pull requests vinculadas às tarefas de que você participa',
    description:
      'Avisa quando uma pull request vinculada a uma tarefa da qual você é responsável, em que comentou ou registrou esforço é mesclada ou fechada sem merge no GitHub.'
  },
  {
    type: INCONSISTENCY,
    group: 'INCONSISTENCIES',
    label: 'PRs mescladas e issues fechadas sem tarefa',
    description:
      'Avisa os membros do projeto quando uma pull request é mesclada ou uma issue é fechada no GitHub sem tarefa vinculada.'
  }
]);

export function notificationTypeLabel(type) {
  return TYPE_LABELS[type] || 'Notificação';
}

export function notificationTone(notification) {
  return TONES[notification.type] || 'info';
}

export function notificationIconName(notification) {
  return ICONS[notification.type] || 'status';
}

export function isInconsistency(notification) {
  return notification.type === INCONSISTENCY;
}

export function orphanGithubUrl(notification) {
  if (notification.link || !GITHUB_TYPES.has(notification.type)) return null;
  return notification.context?.artifact?.url || null;
}

export function taskStatusLabel(status) {
  return STATUS_LABELS[status] || status || '';
}

export function formatDueDate(value) {
  if (!value) return '';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

export function formatInstant(value) {
  if (!value) return '';
  const date = new Date(value);
  return `${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit'
  })}`;
}

function formatDay(value) {
  return value ? new Date(value).toLocaleDateString('pt-BR') : '';
}

function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function taskReference(task) {
  if (task?.code) return task.code;
  return task?.title ? `“${task.title}”` : 'uma tarefa removida';
}

function linkedTaskReference(task) {
  if (task?.code) return `à ${task.code}`;
  return task?.title ? `à tarefa “${task.title}”` : 'a uma tarefa removida';
}

function artifactReference(artifact) {
  return artifact
    ? `${ARTIFACT_CODES.get(artifact.kind) || 'Artefato'} #${artifact.number}`
    : 'Artefato';
}

function inconsistencySentence({ batch, artifact }) {
  if (batch) {
    const parts = [
      batch.pullRequests && plural(batch.pullRequests, 'PR mesclada', 'PRs mescladas'),
      batch.issues && plural(batch.issues, 'issue fechada', 'issues fechadas')
    ].filter(Boolean);
    return `${plural(batch.total, 'inconsistência nova', 'inconsistências novas')}: ${parts.join(' e ')} sem tarefa`;
  }
  const change = artifact?.kind === 'ISSUE' ? 'fechada' : 'mesclada';
  return `${artifactReference(artifact)} ${change} sem tarefa vinculada`;
}

export function notificationSentence(notification) {
  const context = notification.context || {};
  const task = taskReference(notification.task);
  if (notification.type === INCONSISTENCY) return inconsistencySentence(context);
  if (GITHUB_TYPES.has(notification.type)) {
    if (context.event === 'ISSUE_LINKED')
      return `${artifactReference(context.artifact)}, aberta no GitHub, vinculada ${linkedTaskReference(notification.task)}`;
    const change = GITHUB_EVENT_VERBS.get(context.event) || 'mudou';
    return `${artifactReference(context.artifact)} ${change} no GitHub · ${task}`;
  }
  if (notification.type === 'TASK_STATUS_CHANGED') {
    const actor = context.selfAction ? 'Você' : context.actor?.name || 'Pessoa removida';
    return `${actor} moveu ${task} para ${taskStatusLabel(context.toStatus)}`;
  }
  if (notification.type === 'TASK_OVERDUE')
    return `${task} venceu em ${formatDueDate(context.dueDate)}`;
  return `Notificação sobre ${task}`;
}

export function notificationState(notification) {
  if (notification.type !== INCONSISTENCY) return '';
  const alert = notification.context?.alert;
  if (alert?.status === 'RESOLVED') return `resolvida em ${formatDay(alert.resolvedAt)}`;
  if (alert?.status === 'DISMISSED') return `dispensada em ${formatDay(alert.dismissedAt)}`;
  return alert ? 'em aberto' : '';
}

export function notificationCardLabel(notification) {
  return `${notificationTypeLabel(notification.type)}: ${notificationSentence(notification)}. ${
    notification.project?.name
  }, ${formatInstant(notification.createdAt)}`;
}

export function readToggleLabel(notification) {
  const action = notification.readAt ? 'Marcar como não lida' : 'Marcar como lida';
  const where = notification.project?.name ? `, ${notification.project.name}` : '';
  return `${action}: ${notificationSentence(notification)}${where}, ${formatInstant(
    notification.createdAt
  )}`;
}

export function loadMoreLabel(remaining) {
  if (!(remaining > 0)) return 'Carregar mais';
  return `Carregar mais (${remaining.toLocaleString('pt-BR')} ${
    remaining === 1 ? 'restante' : 'restantes'
  })`;
}

export function notificationEmptyTitle(status, group = 'ALL') {
  const noun = GROUP_NOUNS[group] || GROUP_NOUNS.ALL;
  return status === 'ALL' ? `${noun} recebida.` : `${noun} não lida.`;
}

export function unreadBadge(count) {
  if (!count || count < 1) return null;
  return count > 99 ? '99+' : String(count);
}

export function unreadNavLabel(count) {
  if (!count || count < 1) return 'Notificações';
  return `Notificações, ${count} ${count === 1 ? 'não lida' : 'não lidas'}`;
}

export function markAllMessage(updated) {
  if (!updated) return 'Nenhuma notificação estava pendente.';
  return updated === 1
    ? '1 notificação marcada como lida.'
    : `${updated} notificações marcadas como lidas.`;
}

export const UNAVAILABLE_MESSAGE = 'Esta notificação não está mais disponível.';
