export const POLL_INTERVAL_MS = 60_000;
export const PAGE_SIZE = 20;

export const NOTIFICATION_FILTERS = Object.freeze([
  { value: 'UNREAD', label: 'Não lidas' },
  { value: 'ALL', label: 'Todas' }
]);

const TYPE_LABELS = Object.freeze({
  TASK_STATUS_CHANGED: 'Mudança de status',
  TASK_OVERDUE: 'Prazo vencido'
});

const STATUS_LABELS = Object.freeze({
  A_FAZER: 'A fazer',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDO: 'Concluído'
});

export const PREFERENCE_OPTIONS = Object.freeze([
  {
    type: 'TASK_STATUS_CHANGED',
    label: 'Mudança de status das minhas tarefas',
    description:
      'Avisa quando alguém muda o status de uma tarefa da qual você é responsável. Mudanças feitas por você não geram aviso.'
  },
  {
    type: 'TASK_OVERDUE',
    label: 'Prazo vencido das minhas tarefas',
    description:
      'Avisa uma vez quando uma tarefa da qual você é responsável passa do prazo sem estar concluída.'
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

export function notificationContextText(notification) {
  const context = notification.context || {};
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

export function markAllMessage(updated) {
  if (!updated) return 'Nenhuma notificação estava pendente.';
  return updated === 1
    ? '1 notificação marcada como lida.'
    : `${updated} notificações marcadas como lidas.`;
}

export const UNAVAILABLE_MESSAGE = 'Esta notificação não está mais disponível.';
