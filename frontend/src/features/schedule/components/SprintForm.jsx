import { FormInput } from '../../../shared/index.js';

const emptyForm = { name: '', objective: '', startDate: '', endDate: '', milestoneId: '' };

export { emptyForm as emptySprintForm };

// Validacao no cliente e apenas UX; a fonte de verdade e o backend.
export function validateSprintForm(formData, { editing = false } = {}) {
  const errors = {};
  if (!formData.name.trim()) errors.name = 'Informe o nome da sprint.';
  // Obrigatório só na criação, como no backend (ADR-011 D02): a edição de uma
  // sprint legada sem marco não pode ser bloqueada por uma regra que ela é
  // anterior a — o formulário ficaria intransponível.
  if (!editing && !formData.milestoneId) errors.milestoneId = 'Selecione o marco da sprint.';
  if (!formData.startDate) errors.startDate = 'Informe o início da sprint.';
  if (!formData.endDate) errors.endDate = 'Informe o fim da sprint.';
  // Comparação de texto continua valendo: o formato de `datetime-local` é
  // lexicograficamente ordenável. O fim é exclusivo, então igual também é erro.
  if (formData.startDate && formData.endDate && formData.startDate >= formData.endDate) {
    errors.endDate = 'O início precisa ser anterior ao fim.';
  }
  return errors;
}

export function SprintForm({
  formData,
  milestones = [],
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
      {/* datetime-local, e nao date: a sprint guarda o instante exato, e um
          campo só de data descartaria a hora que o usuário informou. */}
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
      <p className="field-help">
        Novas sprints entram como planejadas. As datas não podem sobrepor outra sprint — o fim é
        exclusivo, então a seguinte pode começar exatamente neste instante.
      </p>
      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={submitting}>
          {submitting ? 'Salvando...' : editing ? 'Salvar sprint' : 'Cadastrar sprint'}
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
