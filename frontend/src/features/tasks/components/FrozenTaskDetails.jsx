import { KanbanDialog } from './KanbanDialog.jsx';
import { formatDate, formatDateTime, priorityLabels, statusLabels } from './kanban-display.js';
import { formatTraceabilityCounts } from './kanban-view.js';

export function FrozenTaskDetails({
  task,
  returnFocusRef,
  onClose,
  onOpenCurrent,
  opening,
  error
}) {
  const fields = [
    ['Tarefa', `#${task.id} ${task.title}`],
    ['Status', statusLabels[task.status] || 'Indisponível'],
    ['Pontos', task.estimatedEffort ?? 'Indisponível'],
    [
      'Prioridade',
      task.snapshotAvailable ? priorityLabels[task.priority] || task.priority : 'Indisponível'
    ],
    [
      'Responsável',
      task.snapshotAvailable
        ? task.responsibleUserId
          ? `Responsável #${task.responsibleUserId}`
          : 'Não informado'
        : 'Indisponível'
    ],
    [
      'Prazo',
      task.snapshotAvailable
        ? task.deadline
          ? formatDate(task.deadline)
          : 'Sem prazo'
        : 'Indisponível'
    ],
    ['Rastreabilidade', formatTraceabilityCounts(task)]
  ];
  return (
    <KanbanDialog
      title="Detalhes no encerramento"
      description={`Estado congelado em ${formatDateTime(task.snapshotAt)}.`}
      returnFocusRef={returnFocusRef}
      onClose={onClose}
    >
      {!task.snapshotAvailable && (
        <p role="status">Snapshot detalhado indisponível para esta Sprint histórica.</p>
      )}
      <dl className="frozen-task-details">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {error && (
        <p className="message message-error" role="alert">
          {error}
        </p>
      )}
      {task.currentTaskId && (
        <div className="form-actions">
          <button
            type="button"
            className="button button-secondary"
            disabled={opening}
            onClick={() => onOpenCurrent(task)}
          >
            {opening ? 'Abrindo...' : 'Abrir tarefa atual'}
          </button>
        </div>
      )}
    </KanbanDialog>
  );
}
