import { FormInput } from '../../../shared/index.js';
import { SearchCombobox } from './SearchCombobox.jsx';
import { SprintTaskSelector } from './SprintTaskSelector.jsx';

const emptyForm = { name: '', objective: '', startDate: '', endDate: '', milestoneId: '' };
const milestoneLabel = (milestone) =>
  `${milestone.title}${milestone.deletedAt ? ' · Excluído' : ''}`;

export { emptyForm as emptySprintForm };

export function validateSprintForm(formData) {
  const errors = {};
  if (!formData.name.trim()) errors.name = 'Informe o nome da sprint.';
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
  currentMilestone = null,
  selectedTasks = [],
  sprintNames = {},
  editingSprintId = null,
  errors = {},
  editing = false,
  submitting = false,
  onChange,
  onTasksChange,
  onTaskSearch,
  onSubmit,
  onCancel
}) {
  const selectedMilestone =
    milestones.find((milestone) => Number(milestone.id) === Number(formData.milestoneId)) ||
    (currentMilestone?.id === Number(formData.milestoneId) ? currentMilestone : null);

  return (
    <form className="schedule-form sprint-form" onSubmit={onSubmit} noValidate>
      <div className="sprint-form__fields">
        <FormInput
          label="Nome"
          name="sprint-name"
          value={formData.name}
          required
          error={errors.name}
          onChange={(event) => onChange('name', event.target.value)}
        />
        <div className="form-field sprint-form__objective">
          <label htmlFor="sprint-objective">Objetivo</label>
          <textarea
            id="sprint-objective"
            name="sprint-objective"
            rows={3}
            value={formData.objective}
            onChange={(event) => onChange('objective', event.target.value)}
          />
        </div>
        <SearchCombobox
          id="sprint-milestoneId"
          label="Marco"
          placeholder="Pesquisar marco..."
          options={milestones}
          selectedOption={selectedMilestone}
          error={errors.milestoneId}
          help={
            milestones.length
              ? 'Opcional. Digite ao menos 2 caracteres para pesquisar.'
              : 'Opcional. A sprint pode ser criada sem marco.'
          }
          getOptionLabel={milestoneLabel}
          onSelect={(milestone) => onChange('milestoneId', String(milestone.id))}
          onClear={() => onChange('milestoneId', '')}
          emptyMessage="Nenhum marco encontrado."
        />
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
      </div>

      <SprintTaskSelector
        id="sprint-task-search"
        sprintId={editingSprintId}
        selectedTasks={selectedTasks}
        sprintNames={sprintNames}
        disabled={submitting}
        onSearch={onTaskSearch}
        onChange={onTasksChange}
      />

      <p className="field-help sprint-form__date-help">
        Novas sprints entram como planejadas. Os períodos não podem se sobrepor; o fim é exclusivo,
        então a próxima sprint pode começar exatamente no mesmo instante.
      </p>
      <div className="form-actions sprint-form__actions">
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
          {submitting ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar sprint'}
        </button>
      </div>
    </form>
  );
}
