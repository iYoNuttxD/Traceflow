import { useEffect, useMemo, useState } from 'react';
import { SprintTaskSelector } from './SprintTaskSelector.jsx';
import {
  isTerminalSprint,
  statusBadgeClass,
  taskPriorityLabels,
  taskStatusLabels
} from './schedule-display.js';

function TaskRows({ tasks, emptyMessage }) {
  if (!tasks.length) return <p className="sprint-tasks-modal__empty">{emptyMessage}</p>;
  return (
    <ul className="sprint-tasks-modal__list">
      {tasks.map((task) => (
        <li key={task.id}>
          <div>
            <strong>
              #{task.id} {task.title}
            </strong>
            <span>
              {taskPriorityLabels[task.priority] || task.priority || 'Prioridade não informada'}
              {Number(task.estimatedEffort) ? ` · ${Number(task.estimatedEffort)} pts` : ''}
            </span>
          </div>
          <span className={statusBadgeClass(task.status)}>
            {taskStatusLabels[task.status] || task.status}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SprintTasksPanel({
  sprint,
  sprintTasks = [],
  sprintNames = {},
  progress = null,
  loading = false,
  submitting = false,
  readOnly = false,
  onTaskSearch,
  onSubmit,
  onCancel
}) {
  const [selection, setSelection] = useState(sprintTasks);

  useEffect(() => {
    setSelection(sprintTasks);
  }, [sprintTasks]);

  const frozen = isTerminalSprint(sprint.status);
  const scopeReadOnly = frozen || readOnly;
  const planned = useMemo(
    () => sprintTasks.filter((task) => task.addedAfterStart !== true),
    [sprintTasks]
  );
  const added = useMemo(
    () => sprintTasks.filter((task) => task.addedAfterStart === true),
    [sprintTasks]
  );
  const removed = progress?.scopeChange?.removed || [];
  const totalPoints =
    frozen && sprintTasks.some((task) => task.estimatedEffort == null)
      ? null
      : sprintTasks.reduce((total, task) => total + (Number(task.estimatedEffort) || 0), 0);
  const completed =
    frozen && sprintTasks.some((task) => !task.status)
      ? null
      : sprintTasks.filter((task) => task.status === 'CONCLUIDO').length;

  return (
    <section className="sprint-tasks-modal" aria-label={`Tarefas da sprint ${sprint.name}`}>
      {loading ? (
        <p className="sprint-tasks-modal__loading" role="status">
          Carregando tarefas e histórico de escopo...
        </p>
      ) : (
        <>
          <div className="sprint-tasks-modal__summary" aria-label="Resumo das tarefas">
            <span>
              <strong>{sprintTasks.length}</strong> tarefas
            </span>
            <span>
              <strong>{totalPoints ?? '—'}</strong> pts
            </span>
            <span>
              <strong>{completed ?? '—'}</strong> {completed === 1 ? 'concluída' : 'concluídas'}
            </span>
          </div>

          {frozen && (
            <p className="sprint-tasks-modal__notice">
              Esta sprint está congelada. A composição abaixo é o registro do período e não pode ser
              alterada.
            </p>
          )}
          {frozen && sprintTasks.some((task) => task.isFrozen && !task.snapshotAvailable) && (
            <p className="field-help">
              Snapshot detalhado indisponível para esta Sprint histórica.
            </p>
          )}
          {!frozen && readOnly && (
            <p className="sprint-tasks-modal__notice">
              Seu perfil no projeto permite somente consultar a composição da sprint.
            </p>
          )}

          <div className="sprint-tasks-modal__scope">
            <section>
              <h3>{progress?.baseline?.kind === 'OPEN' ? 'Escopo atual' : 'Escopo planejado'}</h3>
              <TaskRows
                tasks={planned}
                emptyMessage={
                  progress?.baseline?.kind === 'OPEN'
                    ? 'Nenhuma tarefa associada.'
                    : 'Nenhuma tarefa do planejamento permanece nesta sprint.'
                }
              />
            </section>

            {progress?.baseline?.kind !== 'OPEN' && (
              <section>
                <h3>Adicionadas durante a sprint</h3>
                <TaskRows tasks={added} emptyMessage="Nenhuma tarefa entrou depois do início." />
              </section>
            )}

            {progress?.baseline?.kind !== 'OPEN' && (
              <section>
                <h3>Removidas após o planejamento</h3>
                {removed.length === 0 ? (
                  <p className="sprint-tasks-modal__empty">Nenhuma tarefa foi removida.</p>
                ) : (
                  <ul className="sprint-tasks-modal__removed">
                    {removed.map((task) => (
                      <li key={`${task.taskId}-${task.at || task.toSprintId || 'removed'}`}>
                        <strong>#{task.taskId}</strong>
                        <span>
                          {task.toSprintId
                            ? `Movida para a sprint #${task.toSprintId}`
                            : 'Removida da sprint'}
                          {task.exitStatus
                            ? ` · ${taskStatusLabels[task.exitStatus] || task.exitStatus}`
                            : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {removed.length > 0 && (
                  <p className="field-help">
                    O contrato histórico atual fornece o identificador, mas não o título da tarefa
                    removida.
                  </p>
                )}
              </section>
            )}
          </div>

          {!scopeReadOnly && (
            <SprintTaskSelector
              id="sprint-modal-task-search"
              sprintId={sprint.id}
              selectedTasks={selection}
              sprintNames={sprintNames}
              disabled={submitting}
              onSearch={onTaskSearch}
              onChange={setSelection}
            />
          )}
        </>
      )}

      <div className="form-actions sprint-tasks-modal__actions">
        <button
          type="button"
          className="button button-secondary"
          disabled={submitting}
          onClick={onCancel}
        >
          Fechar
        </button>
        {!scopeReadOnly && !loading && (
          <button
            type="button"
            className="button button-primary"
            disabled={submitting}
            aria-busy={submitting}
            onClick={() => onSubmit(selection.map((task) => task.id))}
          >
            {submitting ? 'Salvando...' : 'Salvar tarefas da sprint'}
          </button>
        )}
      </div>
    </section>
  );
}
