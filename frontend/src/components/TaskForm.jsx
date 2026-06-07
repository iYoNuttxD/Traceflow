export const emptyTaskForm = {
  title: '',
  description: '',
  priority: 'MEDIA',
  responsible: '',
  status: 'A_FAZER',
  deadline: '',
  estimatedEffort: '',
  actualEffort: ''
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
    actualEffort: task.actualEffort ?? ''
  };
}

export function taskFormToPayload(formData, editing = false) {
  const payload = {
    ...formData,
    deadline: formData.deadline || null,
    estimatedEffort:
      formData.estimatedEffort === '' ? null : Number(formData.estimatedEffort)
  };

  if (editing) {
    payload.actualEffort =
      formData.actualEffort === '' ? null : Number(formData.actualEffort);
  } else {
    delete payload.actualEffort;
  }

  return payload;
}

export function TaskForm({
  formData,
  onChange,
  onSubmit,
  onCancel,
  submitting,
  editing
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
