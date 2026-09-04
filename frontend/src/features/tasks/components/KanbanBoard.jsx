import { useEffect, useRef, useState } from 'react';
import { KanbanColumn } from './KanbanColumn.jsx';
import { formatDate, KANBAN_COLUMNS, priorityLabels } from './kanban-display.js';
import { formatTraceabilityCounts, isTaskOverdue } from './kanban-view.js';
import '../styles/task-cards.css';
import './KanbanBoard.css';

function responsibleInitial(task) {
  const name = task.responsibleUser?.name || task.responsible || '';
  return name.trim().charAt(0).toLocaleUpperCase('pt-BR') || '?';
}

function KanbanTaskCard({
  task,
  moving,
  dragging,
  sprintName,
  showSprint,
  frozen,
  onSelect,
  onHistory,
  onDelete,
  onDragStart,
  onDragEnd
}) {
  const priority = task.priority || 'MEDIA';
  const blocked = frozen || moving;
  const overdue = isTaskOverdue(task);
  const traceability = formatTraceabilityCounts(task);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    menuRef.current?.querySelector('[role="menuitem"]')?.focus();
    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
        window.requestAnimationFrame(() => triggerRef.current?.focus());
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  function stopDrag(event) {
    event.stopPropagation();
    event.preventDefault();
  }

  return (
    <article
      className={`kanban-task ${dragging ? 'kanban-task--dragging' : ''} ${moving ? 'kanban-task--moving' : ''}`.trim()}
    >
      <button
        type="button"
        className="kanban-task__body"
        draggable={!blocked}
        aria-label={`Abrir detalhes de ${task.title}`}
        aria-describedby={`kanban-task-meta-${task.id}`}
        onClick={(event) => onSelect(task, event.currentTarget)}
        onDragStart={(event) => onDragStart(event, task)}
        onDragEnd={onDragEnd}
      >
        <span className="kanban-task__topline">
          <span className="kanban-task__id">#{task.id}</span>
          <span className={`priority-badge priority-${priority.toLowerCase()}`}>
            {priorityLabels[priority] || priority}
          </span>
        </span>
        <strong className="kanban-task__title">{task.title}</strong>
        <span className="kanban-task__metadata" id={`kanban-task-meta-${task.id}`}>
          <span className="kanban-task__responsible">
            <span className="kanban-task__avatar" aria-hidden="true">
              {responsibleInitial(task)}
            </span>
            <span>{task.responsibleUser?.name || task.responsible || 'Não informado'}</span>
          </span>
          <span
            className={
              overdue
                ? 'kanban-task__deadline kanban-task__deadline--overdue'
                : 'kanban-task__deadline'
            }
          >
            <span aria-hidden="true">◷</span>
            {task.deadline ? formatDate(task.deadline) : 'Sem prazo'}
            {overdue && <strong>Atrasada</strong>}
          </span>
          <span className="kanban-task__traceability" title={traceability}>
            <span aria-hidden="true">⛓</span>
            {traceability}
          </span>
          {showSprint && sprintName && <span className="kanban-task__sprint">{sprintName}</span>}
          {frozen && <span className="kanban-task__frozen">Sprint congelada</span>}
          {moving && <span className="kanban-task__moving">Movendo...</span>}
        </span>
      </button>

      <div className="kanban-task__actions" onDragStart={stopDrag}>
        <button
          type="button"
          className="kanban-task__action"
          aria-label={`Ver histórico da tarefa ${task.title}`}
          title="Ver histórico da tarefa"
          onClick={(event) => onHistory(task, event.currentTarget)}
        >
          <span aria-hidden="true">◷</span>
        </button>
        <div className="kanban-task__menu" ref={menuRef}>
          <button
            ref={triggerRef}
            type="button"
            className="kanban-task__action"
            aria-label={`Mais ações para ${task.title}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((current) => !current)}
          >
            <span aria-hidden="true">⋯</span>
          </button>
          {menuOpen && (
            <div className="kanban-task__menu-popover" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onSelect(task, triggerRef.current);
                }}
              >
                Abrir detalhes
              </button>
              <button
                type="button"
                role="menuitem"
                className="kanban-task__menu-danger"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(task);
                }}
              >
                Excluir tarefa
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function KanbanBoard({
  board,
  movingTaskId,
  draggingTaskId,
  dragOverStatus,
  sprintNames = {},
  selectedSprintIds = [],
  frozenSprintIds = new Set(),
  filteredEmpty = false,
  boardRef,
  onSelectTask,
  onOpenHistory,
  onDeleteTask,
  onTaskDragStart,
  onTaskDragEnd,
  onColumnDragOver,
  onColumnDragLeave,
  onColumnDrop
}) {
  return (
    <section
      className="kanban-board-region"
      aria-labelledby="kanban-board-title"
      ref={boardRef}
      tabIndex={-1}
    >
      <header className="kanban-board-region__heading">
        <div>
          <span className="eyebrow">Fluxo</span>
          <h2 id="kanban-board-title">Kanban</h2>
        </div>
        <p>Arraste uma tarefa para alterar sua etapa.</p>
      </header>
      {filteredEmpty && (
        <div className="kanban-filtered-empty" role="status">
          Nenhuma tarefa corresponde aos filtros.
        </div>
      )}
      <div className="kanban-board-scroll">
        <div className="kanban-board">
          {KANBAN_COLUMNS.map((column) => {
            const tasks = board?.columns?.[column.status] || [];
            return (
              <KanbanColumn
                key={column.status}
                title={column.label}
                count={tasks.length}
                className={dragOverStatus === column.status ? 'kanban-column--drag-over' : ''}
                onDragOver={(event) => onColumnDragOver(event, column.status)}
                onDragLeave={(event) => onColumnDragLeave(event, column.status)}
                onDrop={(event) => onColumnDrop(event, column.status)}
              >
                {tasks.length === 0 ? (
                  <p className="kanban-empty">Nenhuma tarefa nesta etapa.</p>
                ) : (
                  <div className="kanban-task-list">
                    {tasks.map((task) => (
                      <KanbanTaskCard
                        key={task.id}
                        task={task}
                        moving={movingTaskId === task.id}
                        dragging={draggingTaskId === task.id}
                        sprintName={sprintNames[task.sprintId]}
                        showSprint={selectedSprintIds.length === 0}
                        frozen={Boolean(task.sprintId) && frozenSprintIds.has(task.sprintId)}
                        onSelect={onSelectTask}
                        onHistory={onOpenHistory}
                        onDelete={onDeleteTask}
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
      </div>
    </section>
  );
}
