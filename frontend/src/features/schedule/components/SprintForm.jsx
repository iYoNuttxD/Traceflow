import { FormInput } from '../../../shared/index.js';
import { taskPriorityLabels, taskStatusLabels } from './schedule-display.js';

const emptyForm = { name: '', objective: '', startDate: '', endDate: '', milestoneId: '' };

export { emptyForm as emptySprintForm };

export function validateSprintForm(formData, { editing = false } = {}) {
  const errors = {};
  if (!formData.name.trim()) errors.name = 'Informe o nome da sprint.';
  if (!editing && !formData.milestoneId) errors.milestoneId = 'Selecione o marco da sprint.';
  if (!formData.startDate) errors.startDate = 'Informe o início da sprint.';
  if (!formData.endDate) errors.endDate = 'Informe o fim da sprint.';
  if (formData.startDate && formData.endDate && formData.startDate >= formData.endDate) {
    errors.endDate = 'O início precisa ser anterior ao fim.';
  }
  return errors;
}

export function SprintForm({
  formData,
  milestones = [],
  tasks = [],
  sprintNames = {},
  taskIds = [],
  tasksLoading = false,
  editingSprintId = null,
  errors = {},
  editing = false,
  submitting = false,
  onChange,
  onToggleTask,
  onSubmit,
  onCancel
}) {
  const selecionadas = tasks.filter((task) => taskIds.includes(task.id));
  const pontos = selecionadas.reduce((soma, task) => soma + (Number(task.estimatedEffort) || 0), 0);

  return (
    <form className="schedule-form" onSubmit={onSubmit} noValidate>
      <FormInput
        label="Nome"
        name="sprint-name"
        value={formData.name}
        required
        error={errors.name}
        onChange={(event) => onChange('name', event.target.value)}
      />
      <div className="form-field">
        <label htmlFor="sprint-objective">Objetivo</label>
        <textarea
          id="sprint-objective"
          name="sprint-objective"
          rows={3}
          value={formData.objective}
          onChange={(event) => onChange('objective', event.target.value)}
        />
      </div>
      <div className="form-field">
        <label htmlFor="sprint-milestoneId">Marco</label>
        <select
          id="sprint-milestoneId"
          name="sprint-milestoneId"
          value={formData.milestoneId}
          aria-invalid={errors.milestoneId ? 'true' : undefined}
          aria-describedby={errors.milestoneId ? 'sprint-milestoneId-error' : undefined}
          onChange={(event) => onChange('milestoneId', event.target.value)}
        >
          <option value="">Selecione o marco</option>
          {milestones.map((milestone) => (
            <option key={milestone.id} value={String(milestone.id)}>
              {milestone.title}
            </option>
          ))}
        </select>
        {errors.milestoneId && (
          <p className="field-error" id="sprint-milestoneId-error" role="alert">
            {errors.milestoneId}
          </p>
        )}
        {!milestones.length && (
          <p className="field-help">
            Nenhum marco cadastrado ainda. Cadastre um marco antes de criar a sprint.
          </p>
        )}
      </div>
      <FormInput
        label="Início"
        name="sprint-startDate"
        type="datetime-local"
        value={formData.startDate}
        required
        error={errors.startDate}
        onChange={(event) => onChange('startDate', event.target.value)}
      />
      <FormInput
        label="Fim"
        name="sprint-endDate"
        type="datetime-local"
        value={formData.endDate}
        required
        error={errors.endDate}
        onChange={(event) => onChange('endDate', event.target.value)}
      />

      <fieldset className="schedule-form-checklist">
        <legend>Tarefas da sprint</legend>
        <p className="field-help">
          Marque as tarefas que já entram no planejamento desta sprint. Tarefas de outra sprint
          serão movidas ao salvar.
        </p>
        {tasksLoading ? (
          <p className="empty-state" role="status">
            Carregando tarefas do projeto...
          </p>
        ) : tasks.length === 0 ? (
          <p className="empty-state">Nenhuma tarefa cadastrada neste projeto.</p>
        ) : (
          <ul className="sprint-tasks-options">
            {tasks.map((task) => {
              const pontosDaTarefa = Number(task.estimatedEffort) || 0;
              const outraSprint =
                task.sprintId && task.sprintId !== editingSprintId
                  ? sprintNames[task.sprintId] || 'outra sprint'
                  : null;
              return (
                <li key={task.id}>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={taskIds.includes(task.id)}
                      disabled={submitting}
                      onChange={() => onToggleTask(task.id)}
                    />
                    <span>
                      {task.title} — {taskStatusLabels[task.status] || task.status} ·{' '}
                      {taskPriorityLabels[task.priority] || task.priority}
                      {pontosDaTarefa ? ` · ${pontosDaTarefa} pts` : ''}
                      {outraSprint && (
                        <span className="checkbox-field-hint">
                          Atualmente em {outraSprint} — marcar move a tarefa para cá
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <p className="schedule-form-checklist-resumo" role="status">
          {selecionadas.length}{' '}
          {selecionadas.length === 1 ? 'tarefa selecionada' : 'tarefas selecionadas'} · {pontos} pts
        </p>
      </fieldset>

      <p className="field-help">
        Novas sprints entram como planejadas. As datas não podem sobrepor outra sprint — o fim é
        exclusivo, então a seguinte pode começar exatamente neste instante.
      </p>
      <div className="form-actions">
        {editing && (
          <button className="button button-secondary" type="button" onClick={onCancel}>
            Cancelar edição
          </button>
        )}
        <button className="button button-primary" type="submit" disabled={submitting}>
          {submitting ? 'Salvando...' : editing ? 'Salvar alterações' : 'Salvar sprint'}
        </button>
      </div>
    </form>
  );
}
