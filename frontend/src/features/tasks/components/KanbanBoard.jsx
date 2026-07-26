import { KanbanColumn } from './KanbanColumn.jsx';
import { formatDate, getTraceabilitySummary, KANBAN_COLUMNS, priorityLabels } from './kanban-display.js';

function KanbanTaskCard({ task, moving, dragging, onSelect, onKeyboardSelect, onDragStart, onDragEnd }) {
  const priority = task.priority || 'MEDIA';
  return (
    <article
      className={`kanban-task ${dragging ? 'kanban-task--dragging' : ''} ${moving ? 'kanban-task--moving' : ''}`.trim()}
      role="button"
      tabIndex={0}
      draggable={!moving}
      onClick={() => onSelect(task)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onKeyboardSelect(task);
        }
      }}
      onDragStart={(event) => onDragStart(event, task)}
      onDragEnd={onDragEnd}
    >
      <div className="kanban-task-header">
        <strong>{task.title}</strong>
        <span className={`priority-badge priority-${priority.toLowerCase()}`}>{priorityLabels[priority] || priority}</span>
      </div>
      <dl className="kanban-task-details">
        <div><dt>Responsável</dt><dd>{task.responsibleUser?.name || task.responsible || 'Não informado'}</dd></div>
        <div><dt>Prazo</dt><dd>{formatDate(task.deadline)}</dd></div>
        <div><dt>Rastreabilidade</dt><dd>{getTraceabilitySummary(task)}</dd></div>
      </dl>
      {moving && <span className="kanban-task-moving-label">Movendo...</span>}
    </article>
  );
}

export function KanbanBoard({ board, movingTaskId, draggingTaskId, dragOverStatus, onSelectTask, onKeyboardSelectTask = onSelectTask, onTaskDragStart, onTaskDragEnd, onColumnDragOver, onColumnDragLeave, onColumnDrop }) {
  return (
    <div className="kanban-board">
      {KANBAN_COLUMNS.map((column) => {
        const tasks = board?.columns?.[column.status] || [];
        return (
          <KanbanColumn
            key={column.status}
            title={`${column.label} (${board?.totals?.[column.status] ?? 0})`}
            className={dragOverStatus === column.status ? 'kanban-column--drag-over' : ''}
            onDragOver={(event) => onColumnDragOver(event, column.status)}
            onDragLeave={(event) => onColumnDragLeave(event, column.status)}
            onDrop={(event) => onColumnDrop(event, column.status)}
          >
            {tasks.length === 0 ? <p className="kanban-empty">Nenhuma tarefa nesta etapa.</p> : (
              <div className="kanban-task-list">
                {tasks.map((task) => (
                  <KanbanTaskCard
                    key={task.id}
                    task={task}
                    moving={movingTaskId === task.id}
                    dragging={draggingTaskId === task.id}
                    onSelect={onSelectTask}
                    onKeyboardSelect={onKeyboardSelectTask}
                    onDragStart={onTaskDragStart}
                    onDragEnd={onTaskDragEnd}
                  />
                ))}
              </div>
            )}
          </KanbanColumn>
        );
      })}
    </div>
  );
}
