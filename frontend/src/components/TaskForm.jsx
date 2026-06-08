export const emptyTaskForm = {
  title: '',
  description: '',
  priority: 'MEDIA',
  responsible: '',
  status: 'A_FAZER',
  deadline: '',
  estimatedEffort: '',
  actualEffort: '',
  pullRequestId: ''
};

export function taskToFormData(task) {
  return {
    title: task.title || '',
    description: task.description || '',
    priority: task.priority || 'MEDIA',
    responsible: task.responsible || '',
    status: task.status || 'A_FAZER',
    deadline: task.deadline ? task.deadline.slice(0, 10) : '',
    estimatedEffort: task.estimatedEffort ?? '',
    actualEffort: task.actualEffort ?? '',
    pullRequestId: task.pullRequestId ? String(task.pullRequestId) : ''
  };
}

function normalizeNumberField(value) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return String(value);
  }

  return parsedValue;
}

export function taskFormToPayload(formData, editing = false) {
  const payload = {
    ...formData,
    deadline: formData.deadline || null,
    estimatedEffort: normalizeNumberField(formData.estimatedEffort)
  };

  if (editing) {
    payload.actualEffort = normalizeNumberField(formData.actualEffort);
  } else {
    delete payload.actualEffort;
  }

  delete payload.pullRequestId;

  return payload;
}

export function TaskForm({
  formData,
  onChange,
  onSubmit,
  onCancel,
  submitting,
  editing,
  pullRequests = []
}) {
  function handleChange(event) {
    onChange(event.target.name, event.target.value);
  }

  return (
    <form className="task-form" onSubmit={onSubmit}>
      <label className="field field-full">
        <span>Título da tarefa</span>
        <input
          name="title"
          value={formData.title}
          onChange={handleChange}
          required
          placeholder="Ex.: Implementar cadastro de tarefas"
        />
      </label>

      <label className="field field-full">
        <span>Descrição</span>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          rows="4"
          placeholder="Descreva o trabalho que deve ser realizado."
        />
      </label>

      <label className="field">
        <span>Prioridade</span>
        <select name="priority" value={formData.priority} onChange={handleChange}>
          <option value="BAIXA">Baixa</option>
          <option value="MEDIA">Média</option>
          <option value="ALTA">Alta</option>
          <option value="CRITICA">Crítica</option>
        </select>
      </label>

      <label className="field">
        <span>Responsável</span>
        <input
          name="responsible"
          value={formData.responsible}
          onChange={handleChange}
          placeholder="Nome do responsável"
        />
      </label>

      <label className="field">
        <span>Status</span>
        <select name="status" value={formData.status} onChange={handleChange}>
          <option value="A_FAZER">A Fazer</option>
          <option value="EM_ANDAMENTO">Em Andamento</option>
          <option value="CONCLUIDO">Concluído</option>
        </select>
      </label>

      <label className="field">
        <span>Prazo</span>
        <input
          type="date"
          name="deadline"
          value={formData.deadline}
          onChange={handleChange}
        />
      </label>

      <label className="field">
        <span>Esforço estimado</span>
        <input
          type="number"
          min="0"
          step="1"
          name="estimatedEffort"
          value={formData.estimatedEffort}
          onChange={handleChange}
          placeholder="Horas"
        />
      </label>

      {editing && (
        <label className="field">
          <span>Esforço realizado</span>
          <input
            type="number"
            min="0"
            step="1"
            name="actualEffort"
            value={formData.actualEffort}
            onChange={handleChange}
            placeholder="Horas"
          />
        </label>
      )}

      <label className="field field-full">
        <span>Pull request vinculado</span>
        <select
          name="pullRequestId"
          value={formData.pullRequestId}
          onChange={handleChange}
        >
          <option value="">Nenhum pull request vinculado</option>
          {pullRequests.map((pullRequest) => (
            <option key={pullRequest.id} value={pullRequest.id}>
              #{pullRequest.number} — {pullRequest.title}
            </option>
          ))}
        </select>
        {pullRequests.length === 0 && (
          <small className="field-help">
            Nenhum pull request importado. Sincronize o GitHub do projeto antes de
            vincular PRs às tarefas.
          </small>
        )}
      </label>

      <div className="form-actions field-full">
        {editing && (
          <button className="button button-secondary" type="button" onClick={onCancel}>
            Cancelar edição
          </button>
        )}
        <button className="button button-primary" type="submit" disabled={submitting}>
          {submitting
            ? 'Salvando...'
            : editing
              ? 'Salvar alterações'
              : 'Cadastrar tarefa'}
        </button>
      </div>
    </form>
  );
}
