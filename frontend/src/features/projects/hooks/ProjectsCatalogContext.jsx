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
  const [error, setError] = useState(null);
  const mountedRef = useRef(false);
  const initialRequestStartedRef = useRef(false);

  const refreshProjects = useCallback(async () => {
    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }

    try {
      const response = await projectsApi.list();
      const accessibleProjects = Array.isArray(response.data?.projects)
        ? response.data.projects
        : [];
      if (mountedRef.current) setProjects(accessibleProjects);
      return accessibleProjects;
    } catch (requestError) {
      const normalized = normalizeApiError(requestError, 'Não foi possível carregar os projetos.');
      if (mountedRef.current) {
        setError(normalized);
      }
      return [];
    } finally {
      if (mountedRef.current) setLoading(false);
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
    () => ({ projects, loading, error, refreshProjects }),
    [error, loading, projects, refreshProjects]
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
