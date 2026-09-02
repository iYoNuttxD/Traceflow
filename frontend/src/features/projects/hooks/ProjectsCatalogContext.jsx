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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const mountedRef = useRef(false);
  const initialRequestStartedRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const latestRequestIdRef = useRef(0);

  const refreshProjects = useCallback(async () => {
    const requestId = ++latestRequestIdRef.current;
    const initialLoad = !hasLoadedRef.current;

    if (mountedRef.current) {
      setLoading(initialLoad);
      setRefreshing(!initialLoad);
      setError(null);
    }

    try {
      const response = await projectsApi.list();
      const accessibleProjects = Array.isArray(response.data?.projects)
        ? response.data.projects
        : [];
      if (mountedRef.current && requestId === latestRequestIdRef.current) {
        hasLoadedRef.current = true;
        setProjects(accessibleProjects);
      }
      return accessibleProjects;
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
    () => ({ projects, loading, refreshing, error, refreshProjects }),
    [error, loading, projects, refreshing, refreshProjects]
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
