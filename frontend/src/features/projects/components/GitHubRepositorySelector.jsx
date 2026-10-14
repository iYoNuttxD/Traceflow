import { useId, useState } from 'react';
import { normalizeRepository } from '../services/github-repository.js';
import './GitHubRepositorySelector.css';

export function GitHubRepositorySelector({
  repositories = [],
  installations = [],
  loadingRepositories = false,
  repositoriesError = '',
  repositoryEmptyMessage = 'A instalação não possui repositórios acessíveis.',
  repositoryDisabled = false,
  onRetryRepositories,
  onRepositoryChange,
  submitting = false,
  repositoryContext,
  repositoryRequired = false,
  currentRepositoryFullName = ''
}) {
  const repositoryFieldId = useId();
  const [installationId, setInstallationId] = useState('');
  const [search, setSearch] = useState('');
  const hasCurrentRepository = repositories.some(
    (repository) => repository.fullName === currentRepositoryFullName
  );
  const visibleRepositories = repositories.filter(
    (repository) =>
      repository.fullName === currentRepositoryFullName ||
      ((!installationId || String(repository.githubInstallationId) === installationId) &&
        repository.fullName.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  );
  return (
    <div className="github-repository-selector field-full">
      {installations.length > 1 && (
        <label className="field">
          <span>Conta GitHub</span>
          <select
            value={installationId}
            disabled={submitting}
            onChange={(event) => {
              setInstallationId(event.target.value);
              setSearch('');
              onRepositoryChange('');
            }}
          >
            <option value="">Todas as contas autorizadas</option>
            {installations.map((installation) => (
              <option
                key={installation.githubInstallationId}
                value={installation.githubInstallationId}
              >
                {installation.accountLogin}
              </option>
            ))}
          </select>
        </label>
      )}
      {repositories.length > 0 && (
        <label className="field">
          <span>Buscar repositório</span>
          <input
            type="search"
            value={search}
            disabled={submitting}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nome ou organização"
          />
        </label>
      )}
      <div className="field field-full github-repository-selector__field">
        <div className="github-repository-selector__heading">
          <label htmlFor={repositoryFieldId}>
            Repositório GitHub {repositoryRequired ? '*' : '(opcional)'}
          </label>
          {repositoryContext}
        </div>
        <select
          id={repositoryFieldId}
          name="githubRepository"
          value={currentRepositoryFullName}
          onChange={(event) => onRepositoryChange(event.target.value)}
          disabled={
            submitting || repositoryDisabled || loadingRepositories || Boolean(repositoriesError)
          }
          required={repositoryRequired}
          aria-describedby={repositoryRequired ? undefined : `${repositoryFieldId}-help`}
        >
          <option value="">
            {loadingRepositories
              ? 'Carregando repositórios...'
              : repositoryRequired
                ? 'Selecione um repositório'
                : 'Não vincular repositório agora'}
          </option>
          {!hasCurrentRepository && currentRepositoryFullName && (
            <option value={currentRepositoryFullName}>{currentRepositoryFullName}</option>
          )}
          {visibleRepositories.map((repository) => {
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
                !normalizedRepository.connectedToCurrentProject &&
                !normalizedRepository.pendingDeletion
                  ? ` — vinculado a ${normalizedRepository.connectedProject?.name || 'outro projeto'}`
                  : ''}
                {normalizedRepository.pendingDeletion?.projectName
                  ? ' — programado para exclusão'
                  : normalizedRepository.pendingDeletion?.restricted
                    ? ' — indisponível'
                    : ''}
                {normalizedRepository.connectedToCurrentProject
                  ? ' — conectado a este projeto'
                  : ''}
              </option>
            );
          })}
        </select>
        {!repositoryRequired && (
          <p className="field-help" id={`${repositoryFieldId}-help`}>
            Você pode cadastrar o projeto sem GitHub ou selecionar um repositório autorizado agora.
          </p>
        )}
        {!repositoryRequired && currentRepositoryFullName && (
          <button
            type="button"
            className="button button-secondary button-compact"
            disabled={submitting}
            onClick={() => onRepositoryChange('')}
          >
            Não vincular repositório agora
          </button>
        )}
      </div>

      {repositories.length > 0 && visibleRepositories.length === 0 && (
        <p className="field-help" role="status">
          Nenhum repositório corresponde à busca.
        </p>
      )}
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
        repositoryEmptyMessage && <p className="field-help field-full">{repositoryEmptyMessage}</p>}
      {currentRepositoryFullName && (
        <p className="field-help field-full">
          Repositório selecionado: <strong>{currentRepositoryFullName}</strong>
        </p>
      )}
    </div>
  );
}
