import { useCallback, useEffect, useRef, useState } from 'react';
import { membersApi } from '../../members/index.js';
import { requirementsApi } from '../../requirements/index.js';
import { tasksApi } from '../../tasks/index.js';
import { normalizeApiError } from '../../../shared/index.js';
import { testCasesApi } from '../api/test-cases.api.js';
import { filterDefaults, mergeItems } from '../model/test-cases.js';
import { useTestCaseScope } from './useTestCaseScope.js';

export function useTestCases(projectId) {
  const scope = useTestCaseScope(projectId);
  const [filters, setFilters] = useState({ ...filterDefaults });
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState({ items: [], total: 0, summary: null, page: 0 });
  const [membership, setMembership] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [memberError, setMemberError] = useState(null);
  const [warning, setWarning] = useState('');
  const deleted = useRef(new Set());
  const filterKey = JSON.stringify({ ...filters, search: query });
  const filterRef = useRef(filterKey);
  // Invalidate at the event boundary, including the debounce interval.
  const changeFilter = useCallback(
    (key, value) => {
      scope.cancelRead('list');
      setCatalog((old) => ({ ...old, items: [], page: 0, total: 0 }));
      setLoading(true);
      setLoadingMore(false);
      setFilters((old) => ({ ...old, [key]: value }));
    },
    [scope]
  );
  const clearFilters = useCallback(() => {
    scope.cancelRead('list');
    setCatalog((old) => ({ ...old, items: [], page: 0, total: 0 }));
    setLoading(true);
    setLoadingMore(false);
    setFilters({ ...filterDefaults });
    setQuery('');
  }, [scope]);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(filters.search.trim()), 300);
    return () => clearTimeout(timer);
  }, [filters.search]);
  const loadMembers = useCallback(async () => {
    const token = scope.begin('members');
    setMemberError(null);
    try {
      const data = await membersApi.list(projectId, {
        signal: token.controller.signal,
        fresh: true
      });
      if (scope.accepts('members', token)) {
        setMembers(data.members);
        setMembership(data.currentMembership);
      }
    } catch (e) {
      if (scope.accepts('members', token)) setMemberError(normalizeApiError(e));
    }
  }, [projectId, scope]);
  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);
  const load = useCallback(
    async (page = 1, refresh = false) => {
      const token = scope.begin('list');
      const key = filterKey;
      if (page > 1) setLoadingMore(true);
      else if (!refresh) setLoading(true);
      setError(null);
      try {
        const data = await testCasesApi.list(
          projectId,
          { ...JSON.parse(key), page, limit: 20 },
          { signal: token.controller.signal }
        );
        if (!scope.accepts('list', token) || filterRef.current !== key) return;
        setCatalog((old) => ({
          ...data,
          items: mergeItems(page > 1 ? old.items : [], data.items).filter(
            (item) => !deleted.current.has(item.id)
          )
        }));
        setWarning('');
      } catch (e) {
        if (!scope.accepts('list', token) || filterRef.current !== key) return;
        if (refresh)
          setWarning(
            'Alteração confirmada. Não foi possível atualizar a lista e os indicadores. Tente atualizar.'
          );
        else setError(normalizeApiError(e, 'Não foi possível carregar os casos de teste.'));
      } finally {
        if (scope.accepts('list', token) && filterRef.current === key) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [projectId, filterKey, scope]
  );
  useEffect(() => {
    filterRef.current = filterKey;
    if (filters.search.trim() !== query) return;
    void load();
  }, [filterKey, filters.search, query, load]);
  const confirmed = useCallback(
    (kind, saved, id) => {
      scope.invalidate();
      setLoading(false);
      setLoadingMore(false);
      setError(null);
      setCatalog((old) => {
        if (kind === 'delete') {
          deleted.current.add(id);
          return {
            ...old,
            items: old.items.filter((item) => item.id !== id),
            total: Math.max(0, old.total - 1)
          };
        }
        if (kind === 'execute')
          return {
            ...old,
            items: old.items.map((item) =>
              item.id === id
                ? {
                    ...item,
                    latestExecution: { ...saved, testedReference: saved.testedReferenceSnapshot }
                  }
                : item
            )
          };
        return { ...old, items: mergeItems(old.items, [saved]) };
      });
      setWarning('Alteração confirmada. Atualizando lista e indicadores…');
      void load(1, true);
    },
    [load, scope]
  );
  const searchRequirements = useCallback(
    async (search, signal) =>
      (await requirementsApi.listByProject(projectId, { search }, { signal, fresh: true })).data
        .requirements,
    [projectId]
  );
  const searchTasks = useCallback(
    async (search, signal) =>
      (await tasksApi.list(projectId, { search }, { signal, fresh: true })).data.tasks,
    [projectId]
  );
  return {
    scope,
    filters,
    changeFilter,
    clearFilters,
    catalog,
    membership,
    members,
    memberError,
    loadMembers,
    loading,
    loadingMore,
    error,
    warning,
    load,
    confirmed,
    searchRequirements,
    searchTasks
  };
}
