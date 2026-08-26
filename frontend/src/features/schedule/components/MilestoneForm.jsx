import { FormInput } from '../../../shared/index.js';

const emptyForm = { title: '', description: '', dueDate: '' };

export { emptyForm as emptyMilestoneForm };

// Validacao no cliente e apenas UX; a fonte de verdade e o backend.
export function validateMilestoneForm(formData) {
  const errors = {};
  if (!formData.title.trim()) errors.title = 'Informe o título do marco.';
  if (!formData.dueDate) errors.dueDate = 'Informe a data prevista.';
  return errors;
}

// Sem campo de sprint: o marco agrupa sprints, e quem declara o vínculo é o
// formulário da sprint (ADR-011 D01). O prazo também não é mais conferido contra
// janela nenhuma — um marco que atravessa três sprints não tem uma para caber.
export function MilestoneForm({
  formData,
  errors = {},
  editing = false,
  submitting = false,
  onChange,
  onSubmit,
  onCancel
}) {
  return (
    <form className="schedule-form" onSubmit={onSubmit} noValidate>
      <FormInput
        label="Título"
        name="milestone-title"
        value={formData.title}
        required
        error={errors.title}
        onChange={(event) => onChange('title', event.target.value)}
      />
      <div className="form-field">
        <label htmlFor="milestone-description">Descrição</label>
        <textarea
          id="milestone-description"
          name="milestone-description"
          rows={3}
          value={formData.description}
          onChange={(event) => onChange('description', event.target.value)}
        />
      </div>
      <FormInput
        label="Prazo"
        name="milestone-dueDate"
        type="datetime-local"
        value={formData.dueDate}
        required
        error={errors.dueDate}
        onChange={(event) => onChange('dueDate', event.target.value)}
      />
      <p className="field-help">
        Um marco pode ter várias sprints e é concluído automaticamente quando todas forem
        concluídas.
      </p>
      {/* Mesma ordem do formulário de sprint: cancelar antes, submit por último. */}
      <div className="form-actions">
        {editing && (
          <button className="button button-secondary" type="button" onClick={onCancel}>
            Cancelar edição
          </button>
        )}
        <button className="button button-primary" type="submit" disabled={submitting}>
          {submitting ? 'Salvando...' : editing ? 'Salvar alterações' : 'Salvar marco'}
        </button>
      </div>
    </form>
  );
}
