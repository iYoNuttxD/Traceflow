export const POLL_INTERVAL_MS = 60_000;
export const PAGE_SIZE = 20;

export const NOTIFICATION_FILTERS = Object.freeze([
  { value: 'UNREAD', label: 'Não lidas' },
  { value: 'ALL', label: 'Todas' }
]);

export const NOTIFICATION_GROUPS = Object.freeze([
  { value: 'ALL', label: 'Todas as origens' },
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
      'Avisa quando uma issue vinculada a uma tarefa da qual você é responsável, em que comentou ou registrou esforço é fechada ou reaberta no GitHub.'
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
  if (!context.occurredAt) return `${subject} ${change}`;
  if (context.event === 'ISSUE_REOPENED')
    return `${subject} ${change}; última atualização em ${formatInstant(context.occurredAt)}`;
  return `${subject} ${change} em ${formatInstant(context.occurredAt)}`;
}

function formatDay(value) {
  return value ? new Date(value).toLocaleDateString('pt-BR') : '';
}

function alertStateText(alert) {
  if (alert?.status === 'RESOLVED') return `resolvida em ${formatDay(alert.resolvedAt)}`;
  if (alert?.status === 'DISMISSED') return `dispensada em ${formatDay(alert.dismissedAt)}`;
  return alert ? 'em aberto' : '';
}

function plural(count, singular, pluralForm) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function inconsistencyText(context) {
  const { batch, artifact = {} } = context;
  if (batch) {
    const parts = [
      batch.pullRequests && plural(batch.pullRequests, 'PR mesclada', 'PRs mescladas'),
      batch.issues && plural(batch.issues, 'issue fechada', 'issues fechadas')
    ].filter(Boolean);
    return `${parts.join(' e ')} sem tarefa`;
  }
  const subject = `${ARTIFACT_LABELS.get(artifact?.kind) || 'Artefato'} #${artifact?.number}`;
  const change = artifact?.kind === 'ISSUE' ? 'fechada sem tarefa' : 'mesclada sem tarefa';
  const when = context.occurredAt ? ` em ${formatInstant(context.occurredAt)}` : '';
  const state = alertStateText(context.alert);
  return `${subject} ${change}${when}${state ? `; ${state}` : ''}`;
}

export function notificationSubject(notification) {
  if (notification.type === INCONSISTENCY) {
    const { artifact, batch } = notification.context || {};
    if (batch)
      return {
        code: null,
        title: plural(batch.total, 'inconsistência nova', 'inconsistências novas')
      };
    return {
      code: artifact
        ? `${ARTIFACT_CODES.get(artifact.kind) || 'Artefato'} #${artifact.number}`
        : null,
      title: artifact?.title || 'Artefato removido'
    };
  }
  const task = notification.task || {};
  return { code: task.code, title: task.title };
}

export function isInconsistency(notification) {
  return notification.type === INCONSISTENCY;
}

export function githubLinkLabel(notification) {
  const artifact = notification.context?.artifact || {};
  const reference = ARTIFACT_REFERENCES.get(artifact.kind) || 'o artefato';
  return `Abrir no GitHub ${reference} #${artifact.number} (abre em nova aba)`;
}

export function notificationContextText(notification) {
  const context = notification.context || {};
  if (notification.type === INCONSISTENCY) return inconsistencyText(context);
  if (GITHUB_TYPES.has(notification.type)) return githubEventText(context);
  if (notification.type === 'TASK_STATUS_CHANGED') {
    const actor = context.selfAction ? 'Você' : context.actor?.name || 'Pessoa removida';
    return `${actor} moveu de ${taskStatusLabel(context.fromStatus)} para ${taskStatusLabel(context.toStatus)}`;
  }
  if (notification.type === 'TASK_OVERDUE')
    return `Prazo venceu em ${formatDueDate(context.dueDate)}`;
  return '';
}

function subjectText(subject) {
  return subject.code ? `${subject.code} ${subject.title}` : subject.title;
}

export function notificationCardLabel(notification) {
  const label = `${notificationTypeLabel(notification.type)}: ${subjectText(notificationSubject(notification))}`;
  const context = notificationContextText(notification);
  return context ? `${label}. ${context}` : label;
}

export function readToggleLabel(notification) {
  const action = notification.readAt ? 'Marcar como não lida' : 'Marcar como lida';
  const context = notificationContextText(notification);
  const subject = notificationSubject(notification);
  if (isInconsistency(notification))
    return `${action}: ${context}, projeto ${notification.project?.name}`;
  return context
    ? `${action}: ${context}, ${subject.code || subject.title}`
    : `${action}: ${subjectText(subject)}`;
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
