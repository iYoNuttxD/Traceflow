import { SearchCombobox } from './SearchCombobox.jsx';
import { statusBadgeClass, taskPriorityLabels, taskStatusLabels } from './schedule-display.js';

const taskLabel = (task) => `#${task.id} ${task.title}`;

function TaskMetadata({ task }) {
  const points = Number(task.estimatedEffort) || 0;
  return (
    <span className="sprint-task-option__metadata">
      {taskStatusLabels[task.status] || task.status || 'Status não informado'} ·{' '}
      {taskPriorityLabels[task.priority] || task.priority || 'Prioridade não informada'}
      {points > 0 ? ` · ${points} pts` : ''}
    </span>
  );
}

export function SprintTaskSelector({
  id,
  sprintId = null,
  selectedTasks,
  sprintNames = {},
  disabled = false,
  onSearch,
  onChange
}) {
  const selectedIds = new Set(selectedTasks.map((task) => Number(task.id)));

  function addTask(task) {
    if (selectedIds.has(Number(task.id))) return;
    onChange([...selectedTasks, task]);
  }

  function removeTask(taskId) {
    onChange(selectedTasks.filter((task) => Number(task.id) !== Number(taskId)));
  }

  return (
    <fieldset className="sprint-task-selector" disabled={disabled}>
      <legend>Tarefas da sprint</legend>
      <p className="field-help">
        Pesquise por título. Tarefas de outra sprint serão movidas ao salvar.
      </p>
      <SearchCombobox
        id={id}
        label="Pesquisar tarefas"
        placeholder="Pesquisar tarefas..."
        onSearch={onSearch}
        onSelect={addTask}
        getOptionLabel={taskLabel}
        emptyMessage="Nenhuma tarefa encontrada."
        renderOption={(task) => {
          const otherSprint =
            task.sprintId && Number(task.sprintId) !== Number(sprintId)
              ? sprintNames[task.sprintId] || 'outra sprint'
              : null;
          const alreadySelected = selectedIds.has(Number(task.id));
          return (
            <span className="sprint-task-option">
              <strong>{taskLabel(task)}</strong>
              <TaskMetadata task={task} />
              {alreadySelected && <small>Já selecionada</small>}
              {!alreadySelected && otherSprint && (
                <small>Está em {otherSprint} e será movida para esta sprint.</small>
              )}
            </span>
          );
        }}
      />

      <div className="sprint-task-selector__selected">
        <div className="sprint-task-selector__heading">
          <strong>Tarefas selecionadas ({selectedTasks.length})</strong>
          <span>
            {selectedTasks.reduce((total, task) => total + (Number(task.estimatedEffort) || 0), 0)}{' '}
            pts
          </span>
        </div>
        {selectedTasks.length === 0 ? (
          <p className="sprint-task-selector__empty">Nenhuma tarefa selecionada.</p>
        ) : (
          <ul className="sprint-task-selector__list">
            {selectedTasks.map((task) => {
              const otherSprint =
                task.sprintId && Number(task.sprintId) !== Number(sprintId)
                  ? sprintNames[task.sprintId] || 'outra sprint'
                  : null;
              return (
                <li key={task.id}>
                  <div>
                    <strong>{taskLabel(task)}</strong>
                    <span className={statusBadgeClass(task.status)}>
                      {taskStatusLabels[task.status] || task.status}
                    </span>
                    <TaskMetadata task={task} />
                    {otherSprint && (
                      <small>Será movida de {otherSprint} ao salvar esta sprint.</small>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeTask(task.id)}
                    aria-label={`Remover ${taskLabel(task)} da seleção`}
                    title="Remover tarefa"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </fieldset>
  );
}
