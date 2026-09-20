import { TraceFlowIcon } from '../../../shared/index.js';
import { SprintActionsMenu } from '../../schedule/index.js';
import { formatDate, formatEffortHours, priorityLabels, statusLabels } from './kanban-display.js';
import '../styles/task-cards.css';
import './TaskList.css';

function initials(value) {
  const words = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (words[0]?.[0] || '?') + (words.length > 1 ? words.at(-1)[0] : '');
}

function deadlineView(task) {
  if (!task.deadline) return { label: 'Sem prazo', tone: '' };
  const deadline = new Date(`${task.deadline.slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((deadline - today) / 86400000);

  if (task.status !== 'CONCLUIDO' && days < 0) {
    return { label: `Atrasada · ${formatDate(task.deadline)}`, tone: 'overdue' };
  }
  if (task.status !== 'CONCLUIDO' && days <= 7) {
    return { label: `Próxima · ${formatDate(task.deadline)}`, tone: 'upcoming' };
  }
  return { label: formatDate(task.deadline), tone: '' };
}

function TaskListItem({ task, sprintName, deleting, canWrite, onOpen, onEdit, onDelete }) {
  const responsible = task.responsibleUser?.name || task.responsible || 'Sem responsável';
  const deadline = deadlineView(task);

  return (
    <article className="task-catalog-card">
      <button
        type="button"
        className="task-catalog-card__open"
        aria-label={`Abrir detalhes de TASK-${task.id} · ${task.title}`}
        onClick={(event) => onOpen(task, event.currentTarget)}
      >
        <header className="task-catalog-card__header">
          <div>
            <span className="eyebrow">TASK-{task.id}</span>
            <h3>{task.title}</h3>
          </div>
          <span className={`status-badge status-${task.status.toLowerCase()}`}>
            {statusLabels[task.status] || task.status}
          </span>
        </header>
        <div className="task-catalog-card__body">
          <span className={`priority-badge priority-${task.priority.toLowerCase()}`}>
            {priorityLabels[task.priority] || task.priority}
          </span>
          <p className="task-catalog-card__description">
            {task.description || 'Sem descrição cadastrada.'}
          </p>
          <dl className="task-catalog-card__metadata">
            <div className="task-catalog-card__responsible">
              <dt>Responsável</dt>
              <dd>
                <span className="task-catalog-card__avatar" aria-hidden="true">
                  {initials(responsible)}
                </span>
                <span>{responsible}</span>
              </dd>
            </div>
            <div>
              <dt>Sprint</dt>
              <dd>{sprintName || 'Backlog'}</dd>
            </div>
            <div>
              <dt>Prazo</dt>
              <dd className={deadline.tone ? `task-deadline--${deadline.tone}` : undefined}>
                {deadline.label}
              </dd>
            </div>
          </dl>
          <dl className="task-catalog-card__effort">
            <div>
              <dt>Estimado</dt>
              <dd>{formatEffortHours(task.estimatedEffort)}</dd>
            </div>
            <div>
              <dt>Realizado</dt>
              <dd>{formatEffortHours(task.actualEffort)}</dd>
            </div>
          </dl>
        </div>
      </button>
      {canWrite && (
        <footer className="task-catalog-card__footer">
          <SprintActionsMenu
            entityName={`TASK-${task.id}`}
            entityDescriptor="da tarefa"
            disabled={deleting}
            items={[
              {
                key: 'edit',
                label: 'Editar tarefa',
                ariaLabel: `Editar TASK-${task.id}`,
                onSelect: (trigger) => onEdit(task, trigger)
              },
              {
                key: 'delete',
                label: deleting ? 'Excluindo...' : 'Excluir tarefa',
                ariaLabel: `Excluir TASK-${task.id}`,
                danger: true,
                disabled: deleting,
                onSelect: () => onDelete(task)
              }
            ]}
          />
        </footer>
      )}
    </article>
  );
}

function NewTaskCard({ onOpen }) {
  return (
    <button className="new-task-card" type="button" aria-label="Nova tarefa" onClick={onOpen}>
      <span className="new-task-card__icon" aria-hidden="true">
        <TraceFlowIcon name="plus" />
      </span>
      <strong>Nova tarefa</strong>
      <small>Cadastre uma nova atividade do projeto.</small>
    </button>
  );
}

export function TaskList({
  tasks,
  sprints = [],
  deletingTaskId,
  canWrite = true,
  filtered = false,
  onCreate,
  onOpen,
  onEdit,
  onDelete
}) {
  const sprintNames = Object.fromEntries(sprints.map((sprint) => [sprint.id, sprint.name]));

  return (
    <section className="tasks-catalog" aria-labelledby="tasks-list-title">
      <header>
        <h2 id="tasks-list-title">Tarefas do projeto</h2>
      </header>
      {tasks.length ? (
        <div className="tasks-list-grid" role="list">
          {canWrite && (
            <div role="listitem">
              <NewTaskCard onOpen={onCreate} />
            </div>
          )}
          {tasks.map((task) => (
            <div role="listitem" key={task.id}>
              <TaskListItem
                task={task}
                sprintName={sprintNames[task.sprintId]}
                deleting={deletingTaskId === task.id}
                canWrite={canWrite}
                onOpen={onOpen}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            </div>
          ))}
        </div>
      ) : filtered ? (
        <div className="tasks-empty-state">
          <h3>Nenhuma tarefa corresponde aos filtros.</h3>
          <p>Ajuste a busca ou limpe os filtros para ver outras tarefas.</p>
        </div>
      ) : (
        <div className="tasks-empty-state">
          <h3>Nenhuma tarefa cadastrada.</h3>
          <p>Cadastre a primeira atividade para começar a organizar o trabalho do projeto.</p>
          {canWrite && (
            <button type="button" className="button button-primary" onClick={onCreate}>
              + Nova tarefa
            </button>
          )}
        </div>
      )}
    </section>
  );
}
