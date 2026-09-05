import { formatDate, formatDateTime, priorityLabels, statusLabels } from './kanban-display.js';

const unavailable = 'Indisponível no snapshot';
const categories = [
  ['requirements', 'Requisito'],
  ['pullRequests', 'Pull request'],
  ['commits', 'Commits'],
  ['issues', 'Issues']
];

// Versioned historical projection only; legacy fields never hydrate from current data.
export function frozenTaskDetailsView(task) {
  const captured = task.snapshotAvailable === true;
  const complete = captured && task.snapshotVersion === 2;
  const name = complete ? task.responsibleDisplayName : null;
  const responsibleId = captured ? task.responsibleUserId : null;
  return {
    title: `#${task.id} ${task.title}`,
    cutoff: task.snapshotAt
      ? `Congelado em ${formatDateTime(task.snapshotAt)}`
      : 'Data de encerramento indisponível no snapshot',
    description: complete
      ? task.description || 'Sem descrição cadastrada.'
      : 'Descrição indisponível no snapshot.',
    artifacts: complete
      ? {
          requirement: task.requirement,
          pullRequest: task.pullRequest,
          commits: task.commits,
          issues: task.issues
        }
      : null,
    priority: {
      key: captured ? task.priority : null,
      label: captured ? priorityLabels[task.priority] || unavailable : unavailable
    },
    responsible: {
      label: complete
        ? name || 'Não informado'
        : !captured || task.responsibleUserId === undefined
          ? unavailable
          : responsibleId
            ? `Responsável #${responsibleId} · nome indisponível no snapshot`
            : 'Não informado',
      initial: name?.trim().charAt(0).toLocaleUpperCase('pt-BR') || '?'
    },
    deadline: {
      label:
        !captured || task.deadline === undefined
          ? unavailable
          : task.deadline
            ? formatDate(task.deadline)
            : 'Sem prazo',
      overdue: false
    },
    status: { key: task.status, label: statusLabels[task.status] || unavailable },
    estimatedEffort: task.estimatedEffort ?? unavailable,
    actualEffort: complete ? (task.actualEffort ?? 'Não informado') : unavailable,
    createdAt: complete ? formatDateTime(task.createdAt) : unavailable,
    traceability: categories.map(([key, label]) => {
      const count =
        captured && Number.isInteger(task.traceabilityCounts?.[key])
          ? task.traceabilityCounts[key]
          : null;
      return {
        key,
        label,
        count,
        text:
          count == null
            ? unavailable
            : count === 0
              ? 'Nenhum vínculo no encerramento'
              : `${count} ${count === 1 ? 'vínculo' : 'vínculos'} no encerramento`
      };
    })
  };
}
