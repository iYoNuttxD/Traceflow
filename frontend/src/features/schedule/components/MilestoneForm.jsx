import { FormInput } from '../../../shared/index.js';
import { isTerminalSprint } from './schedule-display.js';

const emptyForm = { title: '', description: '', dueDate: '', sprintId: '' };

export { emptyForm as emptyMilestoneForm };

// Validacao no cliente e apenas UX; a fonte de verdade e o backend.
export function validateMilestoneForm(formData) {
  const errors = {};
  if (!formData.title.trim()) errors.title = 'Informe o título do marco.';
  if (!formData.dueDate) errors.dueDate = 'Informe a data prevista.';
  if (!formData.sprintId) errors.sprintId = 'Selecione a sprint do marco.';
  return errors;
}

export function MilestoneForm({
  formData,
  sprints = [],
  errors = {},
  editing = false,
  submitting = false,
  onChange,
  onSubmit,
  onCancel
}) {
  // Sprint encerrada é registro: não recebe marco novo, e o backend recusa com
  // 409. Oferecê-la na lista seria propor uma escolha que não existe.
  //
  // A sprint já selecionada permanece na lista mesmo se encerrada — senão o
  // campo abriria vazio numa edição e o formulário perderia o valor atual sem
  // que o usuário tivesse mexido nele.
  const selecionavel = (sprint) =>
    !isTerminalSprint(sprint.status) || String(sprint.id) === String(formData.sprintId);
  const disponiveis = sprints.filter(selecionavel);

  // Sem sprint nao ha marco (ADR-010 D02). Dizer isso antes do envio evita um
  // formulario que so revela o impedimento no 400 do backend.
  const semSprints = disponiveis.length === 0;
  const todasEncerradas = semSprints && sprints.length > 0;
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
        label="Data prevista"
        name="milestone-dueDate"
        type="datetime-local"
        value={formData.dueDate}
        required
        error={errors.dueDate}
        onChange={(event) => onChange('dueDate', event.target.value)}
      />
      <div className="form-field">
        <label htmlFor="milestone-sprintId">
          Sprint
          <span aria-hidden="true"> *</span>
        </label>
        <select
          id="milestone-sprintId"
          name="milestone-sprintId"
          value={formData.sprintId}
          required
          aria-required="true"
          aria-invalid={Boolean(errors.sprintId)}
          aria-describedby={errors.sprintId ? 'milestone-sprintId-error' : undefined}
          disabled={semSprints}
          onChange={(event) => onChange('sprintId', event.target.value)}
        >
          <option value="">Selecione a sprint</option>
          {disponiveis.map((sprint) => (
            <option key={sprint.id} value={sprint.id}>
              {sprint.name}
            </option>
          ))}
        </select>
        {semSprints && (
          <span className="field-help">
            {todasEncerradas
              ? 'Todas as sprints do projeto estão encerradas. Um marco precisa de um período ainda em aberto.'
              : 'Cadastre uma sprint antes: todo marco pertence a um período de desenvolvimento.'}
          </span>
        )}
        {errors.sprintId && (
          <span id="milestone-sprintId-error" className="field-error" role="alert">
            {errors.sprintId}
          </span>
        )}
      </div>
      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={submitting}>
          {submitting ? 'Salvando...' : editing ? 'Salvar marco' : 'Cadastrar marco'}
        </button>
        {editing && (
          <button className="button button-secondary" type="button" onClick={onCancel}>
            Cancelar edição
          </button>
        )}
      </div>
    </form>
  );
}
