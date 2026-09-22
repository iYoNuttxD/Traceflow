import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { normalizeApiError } from '../../../shared/index.js';
import { projectsApi } from '../api/projects.api.js';

const ProjectsCatalogContext = createContext(null);

export function ProjectsCatalogProvider({ children }) {
  const [projects, setProjects] = useState([]);
  const [deletedProjects, setDeletedProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const mountedRef = useRef(false);
  const initialRequestStartedRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const latestRequestIdRef = useRef(0);
  const confirmedMutationsRef = useRef(new Map());

  const refreshProjects = useCallback(async ({ fresh = false, mutation = null } = {}) => {
    const requestId = ++latestRequestIdRef.current;
    const initialLoad = !hasLoadedRef.current;

    if (mutation?.projectId && ['DELETED', 'RESTORED', 'PURGED'].includes(mutation.type)) {
      confirmedMutationsRef.current.set(mutation.projectId, mutation.type);
      if (mutation.type !== 'RESTORED') {
        setProjects((current) => current.filter(({ id }) => id !== mutation.projectId));
      }
      if (mutation.type !== 'DELETED') {
        setDeletedProjects((current) => current.filter(({ id }) => id !== mutation.projectId));
      }
    }

    if (mountedRef.current) {
      setLoading(initialLoad);
      setRefreshing(!initialLoad);
      setError(null);
    }

    try {
      const response = await projectsApi.list({ fresh: fresh || Boolean(mutation) });
      const receivedProjects = Array.isArray(response.data?.projects) ? response.data.projects : [];
      const receivedDeletedProjects = Array.isArray(response.data?.deletedProjects)
        ? response.data.deletedProjects
        : [];
      if (mountedRef.current && requestId === latestRequestIdRef.current) {
        const accessibleProjects = receivedProjects.filter(
          ({ id }) => !['DELETED', 'PURGED'].includes(confirmedMutationsRef.current.get(id))
        );
        const recoverableProjects = receivedDeletedProjects.filter(
          ({ id }) => !['RESTORED', 'PURGED'].includes(confirmedMutationsRef.current.get(id))
        );
        for (const [id, type] of confirmedMutationsRef.current) {
          const active = receivedProjects.some((project) => project.id === id);
          const deleted = receivedDeletedProjects.some((project) => project.id === id);
          if (
            (type === 'DELETED' && !active) ||
            (type === 'RESTORED' && !deleted) ||
            (type === 'PURGED' && !active && !deleted)
          ) {
            confirmedMutationsRef.current.delete(id);
          }
        }
        hasLoadedRef.current = true;
        setProjects(accessibleProjects);
        setDeletedProjects(recoverableProjects);
        return accessibleProjects;
      }
      return [];
    } catch (requestError) {
      if (mountedRef.current && requestId === latestRequestIdRef.current) {
        setError(normalizeApiError(requestError, 'Não foi possível carregar os projetos.'));
      }
      return [];
    } finally {
      if (mountedRef.current && requestId === latestRequestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!initialRequestStartedRef.current) {
      initialRequestStartedRef.current = true;
      void refreshProjects();
    }
    return () => {
      mountedRef.current = false;
    };
  }, [refreshProjects]);

  const value = useMemo(
    () => ({ projects, deletedProjects, loading, refreshing, error, refreshProjects }),
    [deletedProjects, error, loading, projects, refreshing, refreshProjects]
  );

  return (
    <ProjectsCatalogContext.Provider value={value}>{children}</ProjectsCatalogContext.Provider>
  );
}

export function useProjectsCatalog() {
  const context = useContext(ProjectsCatalogContext);
  if (!context) {
    throw new Error('useProjectsCatalog deve ser usado dentro de ProjectsCatalogProvider.');
  }
  return context;
}
