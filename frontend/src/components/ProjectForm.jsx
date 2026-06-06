const statusOptions = [
  { value: 'ATIVO', label: 'Ativo' },
  { value: 'INATIVO', label: 'Inativo' },
  { value: 'ARQUIVADO', label: 'Arquivado' }
];

export const emptyProjectForm = {
  name: '',
  description: '',
  githubOwner: '',
  githubRepo: '',
  githubUrl: '',
  status: 'ATIVO'
};

export function ProjectForm({
  formData,
  onChange,
  onSubmit,
  submitLabel,
  submitting
}) {
  return (
    <form className="project-form" onSubmit={onSubmit}>
      <label className="field field-full">
        <span>Nome do projeto *</span>
        <input
          name="name"
          value={formData.name}
          onChange={onChange}
          placeholder="Ex.: TRACEFLOW"
          required
        />
      </label>

      <label className="field field-full">
        <span>Descrição</span>
        <textarea
          name="description"
          value={formData.description}
          onChange={onChange}
          rows="4"
          placeholder="Descreva brevemente o objetivo do projeto"
        />
      </label>

      <label className="field">
        <span>Owner do GitHub</span>
        <input
          name="githubOwner"
          value={formData.githubOwner}
          onChange={onChange}
          placeholder="Ex.: joaovitor"
        />
      </label>

      <label className="field">
        <span>Nome do repositório GitHub</span>
        <input
          name="githubRepo"
          value={formData.githubRepo}
          onChange={onChange}
          placeholder="Ex.: traceflow"
        />
      </label>

      <label className="field field-full">
        <span>URL do repositório GitHub</span>
        <input
          name="githubUrl"
          type="url"
          value={formData.githubUrl}
          onChange={onChange}
          placeholder="https://github.com/owner/repositorio"
        />
      </label>

      <label className="field">
        <span>Status</span>
        <select name="status" value={formData.status} onChange={onChange}>
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div className="form-actions field-full">
        <button className="button button-primary" type="submit" disabled={submitting}>
          {submitting ? 'Salvando...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
