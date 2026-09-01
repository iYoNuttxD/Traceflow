import { useId } from 'react';
import './ProjectForm.css';

const statusOptions = [
  { value: 'ATIVO', label: 'Ativo' },
  { value: 'INATIVO', label: 'Inativo' },
  { value: 'ARQUIVADO', label: 'Arquivado' }
];

export const emptyProjectForm = {
  name: '',
  description: '',
  responsibleTeam: '',
  selectedOwner: '',
  selectedRepositoryName: '',
  selectedRepositoryUrl: '',
  selectedRepositoryId: '',
  selectedRepositoryFullName: '',
  selectedDefaultBranch: '',
  selectedInstallationId: '',
  status: 'ATIVO'
};

export function normalizeRepository(repository) {
  const fullName = repository.fullName || '';
  const githubRepositoryId = String(repository.githubRepositoryId || '');

  return {
    id: githubRepositoryId,
    githubRepositoryId,
    owner: typeof repository.owner === 'string' ? repository.owner : '',
    name: repository.name || '',
    fullName,
    url: repository.url || '',
    description: repository.description || '',
    private: repository.private === true,
    defaultBranch: repository.defaultBranch || '',
    alreadyConnected: repository.alreadyConnected === true,
    connectedToCurrentProject: repository.connectedToCurrentProject === true,
    selectable: repository.selectable !== false,
    githubInstallationId: String(repository.githubInstallationId || ''),
    accountLogin: repository.accountLogin || '',
    connectedProject: repository.connectedProject || null
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
    selectedOwner: normalizedRepository.owner,
    selectedRepositoryName: normalizedRepository.name,
    selectedRepositoryUrl: normalizedRepository.url,
    selectedRepositoryId: normalizedRepository.id,
    selectedRepositoryFullName: normalizedRepository.fullName,
    selectedDefaultBranch: normalizedRepository.defaultBranch,
    selectedInstallationId: normalizedRepository.githubInstallationId
  };
}

export function ProjectForm({
  formData,
  repositories = [],
  loadingRepositories = false,
  repositoriesError = '',
  repositoryEmptyMessage = 'A instalação não possui repositórios acessíveis.',
  repositoryDisabled = false,
  onRetryRepositories,
  onChange,
  onRepositoryChange,
  onSubmit,
  submitLabel,
  submitDisabled = false,
  submitting,
  repositoryContext,
  showRepositoryField = true,
  showStatusField = true
}) {
  const repositoryFieldId = useId();
  const currentRepositoryFullName = formData.selectedRepositoryFullName || '';
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

      {showRepositoryField && (
        <>
          <div className="field field-full project-form__repository-field">
            <div className="project-form__repository-heading">
              <label htmlFor={repositoryFieldId}>Repositório GitHub *</label>
              {repositoryContext}
            </div>
            <select
              id={repositoryFieldId}
              name="githubRepository"
              value={currentRepositoryFullName}
              onChange={(event) => onRepositoryChange(event.target.value)}
              disabled={repositoryDisabled || loadingRepositories || Boolean(repositoriesError)}
              required
            >
              <option value="">
                {loadingRepositories ? 'Carregando repositórios...' : 'Selecione um repositório'}
              </option>
              {!hasCurrentRepository && currentRepositoryFullName && (
                <option value={currentRepositoryFullName}>{currentRepositoryFullName}</option>
              )}
              {repositories.map((repository) => {
                const normalizedRepository = normalizeRepository(repository);

                return (
                  <option
                    key={normalizedRepository.id}
                    value={normalizedRepository.fullName}
                    disabled={!normalizedRepository.selectable}
                  >
                    {normalizedRepository.fullName}
                    {normalizedRepository.defaultBranch
                      ? ` — branch ${normalizedRepository.defaultBranch}`
                      : ''}
                    {normalizedRepository.private ? ' (privado)' : ''}
                    {normalizedRepository.alreadyConnected &&
                    !normalizedRepository.connectedToCurrentProject
                      ? ` — vinculado a ${normalizedRepository.connectedProject?.name || 'outro projeto'}`
                      : ''}
                    {normalizedRepository.connectedToCurrentProject
                      ? ' — conectado a este projeto'
                      : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {repositoriesError && (
            <div className="field-help field-error field-full" role="alert">
              <span>{repositoriesError}</span>
              {onRetryRepositories && (
                <button
                  className="button button-secondary button-compact"
                  type="button"
                  disabled={loadingRepositories}
                  onClick={onRetryRepositories}
                >
                  Tentar carregar novamente
                </button>
              )}
            </div>
          )}
          {!repositoryDisabled &&
            !loadingRepositories &&
            !repositoriesError &&
            repositories.length === 0 &&
            repositoryEmptyMessage && (
              <p className="field-help field-full">{repositoryEmptyMessage}</p>
            )}
          {formData.selectedRepositoryUrl && (
            <p className="field-help field-full">
              Repositório selecionado: <strong>{currentRepositoryFullName}</strong>
            </p>
          )}
        </>
      )}

      {showStatusField && (
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
      )}

      <div className="form-actions field-full">
        <button
          className="button button-primary"
          type="submit"
          disabled={submitting || submitDisabled}
          aria-busy={submitting}
        >
          {submitting ? 'Salvando...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
