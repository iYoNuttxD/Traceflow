import { FormInput } from '../../../shared/index.js';
import { isTerminalSprint, sprintStatusLabels } from './schedule-display.js';

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
  onToggleSprint,
  onSubmit,
  onCancel
}) {
  const selecionadas = sprintIds.length;

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

      <fieldset className="schedule-form-checklist">
        <legend>Sprints do marco</legend>
        <p className="field-help">
          Marque as sprints que fazem parte deste marco. Sprints de outro marco serão movidas ao
          salvar; sprints congeladas não podem mudar de marco.
        </p>
        {sprints.length === 0 ? (
          <p className="empty-state">Nenhuma sprint cadastrada neste projeto.</p>
        ) : (
          <ul className="sprint-tasks-options">
            {sprints.map((sprint) => {
              const congelada = isTerminalSprint(sprint.status);
              const marcada = congelada
                ? sprint.milestoneId === editingMilestoneId
                : sprintIds.includes(sprint.id);
              const outroMarco =
                !congelada && sprint.milestoneId && sprint.milestoneId !== editingMilestoneId
                  ? milestoneNames[sprint.milestoneId] || 'outro marco'
                  : null;
              return (
                <li key={sprint.id}>
                  <label className={`checkbox-field ${congelada ? 'checkbox-field-disabled' : ''}`}>
                    <input
                      type="checkbox"
                      checked={marcada}
                      disabled={congelada || submitting}
                      onChange={() => onToggleSprint(sprint.id)}
                    />
                    <span>
                      {sprint.name} — {sprintStatusLabels[sprint.status] || sprint.status}
                      {congelada && (
                        <span className="checkbox-field-hint">
                          {sprint.status === 'CANCELADA'
                            ? 'Cancelada — não pode mudar de marco'
                            : 'Congelada — não pode mudar de marco'}
                        </span>
                      )}
                      {outroMarco && (
                        <span className="checkbox-field-hint">
                          Atualmente no marco {outroMarco} — marcar move a sprint para cá
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
          {selecionadas} {selecionadas === 1 ? 'sprint selecionada' : 'sprints selecionadas'}
        </p>
      </fieldset>

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
