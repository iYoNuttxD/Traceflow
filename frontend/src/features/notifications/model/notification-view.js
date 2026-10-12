export const POLL_INTERVAL_MS = 60_000;
export const PAGE_SIZE = 20;

export const NOTIFICATION_FILTERS = Object.freeze([
  { value: 'UNREAD', label: 'Não lidas' },
  { value: 'ALL', label: 'Todas' }
]);

const TYPE_LABELS = Object.freeze({
  TASK_STATUS_CHANGED: 'Mudança de status',
  TASK_OVERDUE: 'Prazo vencido',
  ISSUE_EVENT: 'Issue',
  PULL_REQUEST_EVENT: 'Pull request'
});

const GITHUB_TYPES = new Set(['ISSUE_EVENT', 'PULL_REQUEST_EVENT']);

const GITHUB_EVENT_VERBS = new Map([
  ['ISSUE_CLOSED', 'fechada'],
  ['ISSUE_REOPENED', 'reaberta'],
  ['PULL_REQUEST_MERGED', 'mesclada'],
  ['PULL_REQUEST_CLOSED', 'fechada sem merge']
]);

const ARTIFACT_LABELS = new Map([
  ['ISSUE', 'Issue'],
  ['PULL_REQUEST', 'Pull request']
]);

const ARTIFACT_REFERENCES = new Map([
  ['ISSUE', 'a issue'],
  ['PULL_REQUEST', 'a pull request']
]);

const STATUS_LABELS = Object.freeze({
  A_FAZER: 'A fazer',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDO: 'Concluído'
});

export const PREFERENCE_GROUPS = Object.freeze([
  { key: 'TASKS', legend: 'Avisos sobre as suas tarefas' },
  { key: 'GITHUB', legend: 'Avisos do GitHub' }
]);

export const PREFERENCE_OPTIONS = Object.freeze([
  {
    type: 'TASK_STATUS_CHANGED',
    group: 'TASKS',
    label: 'Mudança de status das minhas tarefas',
    description:
      'Avisa quando alguém muda o status de uma tarefa da qual você é responsável. Mudanças feitas por você não geram aviso.'
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
      'Avisa quando uma issue vinculada a uma tarefa da qual você é responsável, em que comentou ou registrou esforço é fechada ou reaberta no GitHub.'
  },
  {
    type: 'PULL_REQUEST_EVENT',
    group: 'GITHUB',
    label: 'Pull requests vinculadas às tarefas de que você participa',
    description:
      'Avisa quando uma pull request vinculada a uma tarefa da qual você é responsável, em que comentou ou registrou esforço é mesclada ou fechada sem merge no GitHub.'
  }
]);

export function notificationTypeLabel(type) {
  return TYPE_LABELS[type] || 'Notificação';
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

function githubEventText(context) {
  const artifact = context.artifact || {};
  const subject = `${ARTIFACT_LABELS.get(artifact.kind) || 'Artefato'} #${artifact.number}`;
  const change = GITHUB_EVENT_VERBS.has(context.event)
    ? `${GITHUB_EVENT_VERBS.get(context.event)} no GitHub`
    : 'mudou no GitHub';
  return context.occurredAt
    ? `${subject} ${change} em ${formatInstant(context.occurredAt)}`
    : `${subject} ${change}`;
}

export function githubLinkLabel(notification) {
  const artifact = notification.context?.artifact || {};
  const reference = ARTIFACT_REFERENCES.get(artifact.kind) || 'o artefato';
  return `Abrir no GitHub ${reference} #${artifact.number} (abre em nova aba)`;
}

export function notificationContextText(notification) {
  const context = notification.context || {};
  if (GITHUB_TYPES.has(notification.type)) return githubEventText(context);
  if (notification.type === 'TASK_STATUS_CHANGED') {
    const actor = context.actor?.name || 'Pessoa removida';
    return `${actor} moveu de ${taskStatusLabel(context.fromStatus)} para ${taskStatusLabel(context.toStatus)}`;
  }
  if (notification.type === 'TASK_OVERDUE')
    return `Prazo venceu em ${formatDueDate(context.dueDate)}`;
  return '';
}

export function notificationEmptyTitle(status) {
  return status === 'ALL' ? 'Nenhuma notificação recebida.' : 'Nenhuma notificação não lida.';
}

export function unreadBadge(count) {
  if (!count || count < 1) return null;
  return count > 99 ? '99+' : String(count);
}

export function unreadNavLabel(count) {
  if (!count || count < 1) return 'Notificações';
  return `Notificações, ${count} ${count === 1 ? 'não lida' : 'não lidas'}`;
}

export function navigationMenuLabel(count) {
  if (!count || count < 1) return 'Abrir navegação';
  return `Abrir navegação, ${count} ${count === 1 ? 'notificação não lida' : 'notificações não lidas'}`;
}

export function markAllMessage(updated) {
  if (!updated) return 'Nenhuma notificação estava pendente.';
  return updated === 1
    ? '1 notificação marcada como lida.'
    : `${updated} notificações marcadas como lidas.`;
}

export const UNAVAILABLE_MESSAGE = 'Esta notificação não está mais disponível.';
