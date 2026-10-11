import { GitHubRepositorySelector } from './GitHubRepositorySelector.jsx';
import { normalizeRepository } from '../services/github-repository.js';
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

export { normalizeRepository } from '../services/github-repository.js';

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
  installations = [],
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
  repositoryRequired = false,
  showRepositoryField = true,
  showStatusField = true
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
        <GitHubRepositorySelector
          repositories={repositories}
          installations={installations}
          loadingRepositories={loadingRepositories}
          repositoriesError={repositoriesError}
          repositoryEmptyMessage={repositoryEmptyMessage}
          repositoryDisabled={repositoryDisabled}
          onRetryRepositories={onRetryRepositories}
          onRepositoryChange={onRepositoryChange}
          submitting={submitting}
          repositoryContext={repositoryContext}
          repositoryRequired={repositoryRequired}
          currentRepositoryFullName={formData.selectedRepositoryFullName}
        />
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
