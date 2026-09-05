import { FormInput } from '../../../shared/index.js';
import { MilestoneSprintSelector } from './MilestoneSprintSelector.jsx';

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
  sprints = [],
  milestoneNames = {},
  sprintIds = [],
  editingMilestoneId = null,
  errors = {},
  editing = false,
  submitting = false,
  onChange,
  onSprintsChange,
  onSubmit,
  onCancel
}) {
  return (
    <form className="schedule-form milestone-form" onSubmit={onSubmit} noValidate>
      <div className="milestone-form__fields">
        <FormInput
          label="Título"
          name="milestone-title"
          value={formData.title}
          required
          error={errors.title}
          onChange={(event) => onChange('title', event.target.value)}
        />
        <div className="form-field milestone-form__description">
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
      </div>

      <MilestoneSprintSelector
        sprints={sprints}
        selectedSprintIds={sprintIds}
        milestoneNames={milestoneNames}
        editingMilestoneId={editingMilestoneId}
        disabled={submitting}
        onChange={onSprintsChange}
      />

      <p className="field-help milestone-form__rule">
        O marco usa somente um prazo próprio. O período coberto é derivado das Sprints vinculadas, e
        a conclusão automática ocorre quando todas as Sprints não canceladas são concluídas.
      </p>
      <div className="form-actions milestone-form__actions">
        <button
          className="button button-secondary"
          type="button"
          disabled={submitting}
          onClick={onCancel}
        >
          Cancelar
        </button>
        <button
          className="button button-primary"
          type="submit"
          disabled={submitting}
          aria-busy={submitting}
        >
          {submitting ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar marco'}
        </button>
      </div>
    </form>
  );
}
