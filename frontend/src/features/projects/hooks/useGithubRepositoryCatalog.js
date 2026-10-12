import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeApiError, useAbortableRequest } from '../../../shared/index.js';
import { projectsApi } from '../api/projects.api.js';
import { normalizeRepository } from '../services/github-repository.js';

export function useGithubRepositoryCatalog({
  projectId: reconnectProjectId = null,
  enabled = true,
  purgedRepositoriesRef: purgedRef
} = {}) {
  const emptyPurged = useRef(new Map());
  const purgedRepositoriesRef = purgedRef || emptyPurged;
  const [installationsError, setInstallationsError] = useState('');
  const { run: runRepositoriesRequest } = useAbortableRequest();
  const { run: runInstallationsRequest } = useAbortableRequest();
  const [repositoryRequestState, setRepositoryRequestState] = useState({
    projectId: null,
    repositories: [],
    loading: false,
    error: ''
  });
  const [installations, setInstallations] = useState([]);
  const repositoryStateBelongsToContext =
    String(repositoryRequestState.projectId || '') === String(reconnectProjectId || '');
  const repositories = repositoryStateBelongsToContext ? repositoryRequestState.repositories : [];
  const loadingRepositories = repositoryStateBelongsToContext
    ? repositoryRequestState.loading
    : true;
  const repositoriesError = repositoryStateBelongsToContext ? repositoryRequestState.error : '';
  const loadRepositories = useCallback(
    ({ fresh = false } = {}) =>
      runRepositoriesRequest(async (signal) => {
        const requestedProjectId = reconnectProjectId || null;
        setRepositoryRequestState((current) => ({
          projectId: requestedProjectId,
          repositories:
            String(current.projectId || '') === String(requestedProjectId || '')
              ? current.repositories
              : [],
          loading: true,
          error: ''
        }));

        try {
          const response = await projectsApi.listAllGithubRepositories(reconnectProjectId, {
            signal,
            fresh
          });
          if (signal.aborted) return;
          const validRepositories = (response.data.repositories || [])
            .map((repository) => {
              const normalized = normalizeRepository(repository);
              const purgedProjectId = purgedRepositoriesRef.current.get(normalized.id);
              return purgedProjectId && normalized.pendingDeletion?.projectId === purgedProjectId
                ? {
                    ...normalized,
                    pendingDeletion: null,
                    alreadyConnected: false,
                    selectable: true
                  }
                : normalized;
            })
            .filter(
              (repository) =>
                repository.id &&
                repository.owner &&
                repository.name &&
                repository.fullName &&
                repository.url &&
                repository.defaultBranch &&
                repository.githubInstallationId
            );
          setRepositoryRequestState({
            projectId: requestedProjectId,
            repositories: validRepositories,
            loading: false,
            error: ''
          });
        } catch (requestError) {
          if (signal.aborted) throw requestError;
          setRepositoryRequestState({
            projectId: requestedProjectId,
            repositories: [],
            loading: false,
            error: normalizeApiError(
              requestError,
              'Não foi possível carregar os repositórios do GitHub.'
            ).message
          });
        } finally {
          if (!signal.aborted) {
            setRepositoryRequestState((current) =>
              String(current.projectId || '') === String(requestedProjectId || '')
                ? { ...current, loading: false }
                : current
            );
          }
        }
      }),
    [purgedRepositoriesRef, reconnectProjectId, runRepositoriesRequest]
  );

  const loadInstallations = useCallback(
    () =>
      runInstallationsRequest(async (signal) => {
        setInstallationsError('');
        try {
          const response = await projectsApi.listGithubInstallations({ signal });
          if (signal.aborted) return;
          setInstallations(response.data.installations || []);
        } catch (requestError) {
          if (signal.aborted) throw requestError;
          setInstallations([]);
          setInstallationsError(
            normalizeApiError(requestError, 'Não foi possível verificar a conexão com o GitHub.')
              .message
          );
        }
      }),
    [runInstallationsRequest]
  );

  useEffect(() => {
    if (!enabled) return;
    void loadInstallations();
    void loadRepositories();
  }, [enabled, loadInstallations, loadRepositories]);

  return {
    repositories,
    installations,
    loadingRepositories,
    repositoriesError,
    installationsError,
    loadRepositories,
    loadInstallations,
    setRepositoryRequestState
  };
}
