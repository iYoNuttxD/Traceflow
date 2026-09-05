import { formatDate, formatDateTime, priorityLabels, statusLabels } from './kanban-display.js';
import { isTaskOverdue } from './kanban-view.js';

export function currentTaskDetailsView(task) {
  const responsible = task.responsibleUser?.name || task.responsible || '';
  return {
    description: task.description || 'Sem descrição cadastrada.',
    priority: {
      key: task.priority || 'MEDIA',
      label: priorityLabels[task.priority] || task.priority || 'Média'
    },
    responsible: {
      label: responsible || 'Não informado',
      initial: responsible.trim().charAt(0).toLocaleUpperCase('pt-BR') || '?'
    },
    deadline: { label: formatDate(task.deadline), overdue: isTaskOverdue(task) },
    status: { key: task.status, label: statusLabels[task.status] || task.status },
    estimatedEffort: task.estimatedEffort ?? 'Não informado',
    actualEffort: task.actualEffort ?? 'Não informado',
    createdAt: formatDateTime(task.createdAt)
  };
}
