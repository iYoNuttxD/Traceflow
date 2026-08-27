import { FormInput } from '../../../shared/index.js';

const emptyForm = { title: '', description: '', dueDate: '' };

export { emptyForm as emptyMilestoneForm };

export function validateMilestoneForm(formData) {
  const errors = {};
  if (!formData.title.trim()) errors.title = 'Informe o título do marco.';
  if (!formData.dueDate) errors.dueDate = 'Informe a data prevista.';
  return errors;
}

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
