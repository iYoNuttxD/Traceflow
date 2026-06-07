const statusOptions = [
  { value: 'ATIVO', label: 'Ativo' },
  { value: 'INATIVO', label: 'Inativo' },
  { value: 'ARQUIVADO', label: 'Arquivado' }
];

export const emptyProjectForm = {
  name: '',
  description: '',
  responsibleTeam: '',
  githubOwner: '',
  githubRepo: '',
  githubUrl: '',
  status: 'ATIVO'
};

function deriveGithubRepository(githubUrl) {
  try {
    const parsedUrl = new URL(githubUrl);
    const hostname = parsedUrl.hostname.toLowerCase();
    const pathParts = parsedUrl.pathname.split('/').filter(Boolean);

    if (
      !['github.com', 'www.github.com'].includes(hostname) ||
      pathParts.length !== 2
    ) {
      return { githubOwner: '', githubRepo: '' };
    }

    return {
      githubOwner: pathParts[0],
      githubRepo: pathParts[1].replace(/\.git$/i, '')
    };
  } catch {
    return { githubOwner: '', githubRepo: '' };
  }
}

export function updateProjectForm(currentForm, name, value) {
  if (name !== 'githubUrl') {
    return { ...currentForm, [name]: value };
  }

  return {
    ...currentForm,
    githubUrl: value,
    ...deriveGithubRepository(value)
  };
}

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
          onChange={(event) => onChange(event.target.name, event.target.value)}
          placeholder="Ex.: TRACEFLOW"
          required
        />
      </label>

      <label className="field field-full">
        <span>Descrição</span>
        <textarea
          name="description"
          value={formData.description}
          onChange={(event) => onChange(event.target.name, event.target.value)}
          rows="4"
          placeholder="Descreva brevemente o objetivo do projeto"
        />
      </label>

      <label className="field field-full">
        <span>Equipe responsável *</span>
        <input
          name="responsibleTeam"
          value={formData.responsibleTeam}
          onChange={(event) => onChange(event.target.name, event.target.value)}
          placeholder="Ex.: Equipe de Engenharia de Software"
          required
        />
      </label>

      <label className="field field-full">
        <span>URL do repositório GitHub *</span>
        <input
          name="githubUrl"
          type="url"
          value={formData.githubUrl}
          onChange={(event) => onChange(event.target.name, event.target.value)}
          placeholder="https://github.com/owner/repositorio"
          required
        />
      </label>

      <label className="field">
        <span>Owner do GitHub</span>
        <input
          name="githubOwner"
          value={formData.githubOwner}
          placeholder="Preenchido pela URL"
          readOnly
        />
      </label>

      <label className="field">
        <span>Nome do repositório GitHub</span>
        <input
          name="githubRepo"
          value={formData.githubRepo}
          placeholder="Preenchido pela URL"
          readOnly
        />
      </label>

      <label className="field">
        <span>Status</span>
        <select
          name="status"
          value={formData.status}
          onChange={(event) => onChange(event.target.name, event.target.value)}
        >
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
