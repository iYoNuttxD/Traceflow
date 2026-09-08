import { useCallback, useEffect, useRef, useState } from 'react';
import { membersApi } from '../../members/index.js';
import { tasksApi } from '../../tasks/index.js';
import { requirementsApi } from '../../requirements/index.js';
import { testCasesApi, useTestCaseScope } from '../../testCases/index.js';
import { normalizeApiError } from '../../../shared/index.js';
import { defectsApi } from '../api/defects.api.js';
import { filtersDefault, mergeItems } from '../model/defects.js';
export function useDefectOptions(projectId) {
  const scope = useTestCaseScope(projectId);
  const [members, setMembers] = useState([]),
    [membership, setMembership] = useState(null),
    [error, setError] = useState(null);
  const load = useCallback(async () => {
    const t = scope.begin('members');
    try {
      const d = await membersApi.list(projectId, { signal: t.controller.signal, fresh: true });
      if (scope.accepts('members', t)) {
        setMembers(d.members);
        setMembership(d.currentMembership);
        setError(null);
      }
    } catch (e) {
      if (scope.accepts('members', t)) setError(normalizeApiError(e));
    }
  }, [projectId, scope]);
  useEffect(() => {
    setMembers([]);
    setMembership(null);
    void load();
  }, [load]);
  const searchTasks = useCallback(
    async (search, signal) =>
      (await tasksApi.list(projectId, { search }, { signal, fresh: true })).data.tasks,
    [projectId]
  );
  const searchRequirements = useCallback(
    async (search, signal) =>
      (await requirementsApi.listByProject(projectId, { search }, { signal, fresh: true })).data
        .requirements,
    [projectId]
  );
  const searchCases = useCallback(
    async (search, signal) =>
      (await testCasesApi.list(projectId, { search, limit: 50 }, { signal })).items,
    [projectId]
  );
  return { members, membership, error, load, searchTasks, searchRequirements, searchCases };
}
export function useDefects(projectId) {
  const scope = useTestCaseScope(projectId);
  const [filters, setFilters] = useState({ ...filtersDefault }),
    [catalog, setCatalog] = useState({ items: [], total: 0, summary: null, page: 0 }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(null),
    [warning, setWarning] = useState('');
  const filterKey = JSON.stringify(filters),
    filterRef = useRef(filterKey),
    deleted = useRef(new Set());
  filterRef.current = filterKey;
  const load = useCallback(
    async (page = 1, refresh = false) => {
      const token = scope.begin('list'),
        key = filterKey;
      setLoading(true);
      setError(null);
      try {
        const d = await defectsApi.list(
          projectId,
          { ...JSON.parse(key), page, limit: 20 },
          { signal: token.controller.signal }
        );
        if (!scope.accepts('list', token) || filterRef.current !== key) return;
        setCatalog((old) => ({
          ...d,
          items: mergeItems(page > 1 ? old.items : [], d.items).filter(
            (v) => !deleted.current.has(v.id)
          )
        }));
        setWarning('');
      } catch (e) {
        if (scope.accepts('list', token)) {
          if (refresh)
            setWarning(
              'Alteração confirmada. Não foi possível atualizar a lista e os indicadores.'
            );
          else setError(normalizeApiError(e));
        }
      } finally {
        if (scope.accepts('list', token)) setLoading(false);
      }
    },
    [projectId, filterKey, scope]
  );
  useEffect(() => {
    const timer = setTimeout(() => void load(), filters.search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, filters.search]);
  const changeFilter = (key, value) => {
    scope.cancelRead('list');
    setCatalog((old) => ({ ...old, items: [], total: 0, page: 0 }));
    setLoading(true);
    setFilters((old) => ({ ...old, [key]: value }));
  };
  const clear = () => {
    scope.cancelRead('list');
    setCatalog((old) => ({ ...old, items: [], total: 0, page: 0 }));
    setFilters({ ...filtersDefault });
  };
  const confirmed = useCallback(
    (kind, saved, id) => {
      scope.invalidate();
      setLoading(false);
      setError(null);
      if (kind === 'delete') deleted.current.add(id);
      setCatalog((old) => ({
        ...old,
        items:
          kind === 'delete'
            ? old.items.filter((v) => v.id !== id)
            : saved
              ? mergeItems(old.items, [saved])
              : old.items
      }));
      setWarning('Alteração confirmada. Atualizando lista e indicadores…');
      void load(1, true);
    },
    [scope, load]
  );
  return { scope, filters, catalog, loading, error, warning, load, changeFilter, clear, confirmed };
}
