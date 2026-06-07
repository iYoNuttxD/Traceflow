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

export function normalizeRepository(repository) {
  const fullName = repository.fullName || repository.full_name || '';
  const [fullNameOwner, fullNameRepo] = fullName.split('/');
  const owner =
    repository.owner?.login ||
    (typeof repository.owner === 'string' ? repository.owner : '') ||
    fullNameOwner ||
    '';
  const name = repository.name || fullNameRepo || '';
  const url = repository.url || repository.html_url || '';

  return {
    id: String(repository.githubRepositoryId || repository.id || fullName || url),
    owner,
    name,
    fullName: fullName || (owner && name ? `${owner}/${name}` : ''),
    url,
    description: repository.description || '',
    private: repository.private === true,
    defaultBranch: repository.defaultBranch || repository.default_branch || ''
  };
}

export function updateProjectForm(currentForm, name, value) {
  return { ...currentForm, [name]: value };
}

export function applyRepositoryToProjectForm(currentForm, repository) {
  const normalizedRepository = normalizeRepository(repository);

  return {
    ...currentForm,
    name: currentForm.name.trim() ? currentForm.name : normalizedRepository.name,
    githubOwner: normalizedRepository.owner,
    githubRepo: normalizedRepository.name,
    githubUrl: normalizedRepository.url
  };
}

export function ProjectForm({
  formData,
  repositories,
  loadingRepositories,
  repositoriesError,
  onChange,
  onRepositoryChange,
  onSubmit,
  submitLabel,
  submitting
}) {
  const currentRepositoryFullName =
    formData.githubOwner && formData.githubRepo
      ? `${formData.githubOwner}/${formData.githubRepo}`
      : '';
  const hasCurrentRepository = repositories.some(
    (repository) => normalizeRepository(repository).fullName === currentRepositoryFullName
  );

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
        <span>Área ou equipe responsável *</span>
        <input
          name="responsibleTeam"
          value={formData.responsibleTeam}
          onChange={(event) => onChange(event.target.name, event.target.value)}
          placeholder="Ex.: Equipe de desenvolvimento, Squad acadêmica, Grupo TCC"
          required
        />
      </label>

      <label className="field field-full">
        <span>Repositório GitHub *</span>
        <select
          name="githubRepository"
          value={currentRepositoryFullName}
          onChange={(event) => onRepositoryChange(event.target.value)}
          disabled={loadingRepositories || Boolean(repositoriesError)}
          required
        >
          <option value="">
            {loadingRepositories
              ? 'Carregando repositórios...'
              : 'Selecione um repositório'}
          </option>
          {!hasCurrentRepository && currentRepositoryFullName && (
            <option value={currentRepositoryFullName}>{currentRepositoryFullName}</option>
          )}
          {repositories.map((repository) => {
            const normalizedRepository = normalizeRepository(repository);

            return (
              <option key={normalizedRepository.id} value={normalizedRepository.fullName}>
                {normalizedRepository.fullName}
                {normalizedRepository.private ? ' (privado)' : ''}
              </option>
            );
          })}
        </select>
      </label>

      {repositoriesError && (
        <p className="field-help field-error field-full">{repositoriesError}</p>
      )}
      {!loadingRepositories && !repositoriesError && repositories.length === 0 && (
        <p className="field-help field-full">
          Nenhum repositório GitHub encontrado para este usuário.
        </p>
      )}
      {formData.githubUrl && (
        <p className="field-help field-full">
          Repositório selecionado: <strong>{currentRepositoryFullName}</strong>
        </p>
      )}

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
