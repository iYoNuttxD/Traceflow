import { useCallback, useEffect, useRef, useState } from 'react';
import { scheduleApi } from '../api/schedule.api.js';
import { projectsApi } from '../../projects/index.js';
import { normalizeApiError } from '../../../shared/index.js';
import { useScopedAsyncCatalog } from './useScopedAsyncCatalog.js';

const mergeEntity = (items, saved) => {
  if (saved.deletedAt) return items.filter((item) => Number(item.id) !== Number(saved.id));
  const exists = items.some((item) => Number(item.id) === Number(saved.id));
  return exists
    ? items.map((item) => (Number(item.id) === Number(saved.id) ? { ...item, ...saved } : item))
    : [...items, saved];
};

export function useScheduleData(projectId) {
  const scope = useScopedAsyncCatalog(projectId);
  const deletedIds = useRef(new WeakMap());
  const [project, setProject] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [sprints, setSprints] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [currentMembership, setCurrentMembership] = useState(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [staleWarning, setStaleWarning] = useState('');
  const feedbackGeneration = useRef(0);

  const read = useCallback(
    async (name, operation, apply, context) => {
      const request = scope.beginRead(name, context);
      if (!request) return;
      try {
        const response = await operation(request.controller.signal);
        if (scope.isReadCurrent(name, request)) apply(response);
      } catch (error) {
        if (scope.isReadCurrent(name, request)) throw error;
      }
    },
    [scope]
  );

  const refreshSchedule = useCallback(
    (range = {}, context = scope.capture()) =>
      read(
        'schedule',
        (signal) => scheduleApi.getSchedule(projectId, range, { signal }),
        (response) => setSchedule(response.data),
        context
      ),
    [projectId, read, scope]
  );
  const refreshSprints = useCallback(
    (context = scope.capture()) =>
      read(
        'sprints',
        (signal) => scheduleApi.listSprints(projectId, {}, { signal }),
        (response) => setSprints(response.data.sprints || []),
        context
      ),
    [projectId, read, scope]
  );
  const refreshMilestones = useCallback(
    (context = scope.capture()) =>
      read(
        'milestones',
        (signal) => scheduleApi.listMilestones(projectId, {}, { signal }),
        (response) => setMilestones(response.data.milestones || []),
        context
      ),
    [projectId, read, scope]
  );

  const loadAll = useCallback(
    async (range = {}) => {
      const context = scope.capture();
      const request = scope.beginRead('load', context);
      if (!request) return;
      setLoading(true);
      setError('');
      setStaleWarning('');
      setForbidden(false);
      try {
        const queries = [
          [
            'project',
            (signal) => projectsApi.get(projectId, { signal }),
            (r) => setProject(r.data.project)
          ],
          [
            'membership',
            (signal) => scheduleApi.getMembership(projectId, { signal }),
            (r) => setCurrentMembership(r.data.currentMembership || null)
          ],
          [
            'schedule',
            (signal) => scheduleApi.getSchedule(projectId, range, { signal }),
            (r) => setSchedule(r.data)
          ],
          [
            'sprints',
            (signal) => scheduleApi.listSprints(projectId, {}, { signal }),
            (r) => setSprints(r.data.sprints || [])
          ],
          [
            'milestones',
            (signal) => scheduleApi.listMilestones(projectId, {}, { signal }),
            (r) => setMilestones(r.data.milestones || [])
          ]
        ];
        const commits = await Promise.all(
          queries.map(async ([name, fetch, apply]) => {
            const token = scope.beginRead(name, context);
            try {
              const response = await fetch(token.controller.signal);
              return () => {
                if (scope.isReadCurrent(name, token)) apply(response);
              };
            } catch (error) {
              if (scope.isReadCurrent(name, token)) throw error;
              return () => {};
            }
          })
        );
        if (scope.isReadCurrent('load', request)) commits.forEach((commit) => commit());
      } catch (requestError) {
        if (!scope.isReadCurrent('load', request)) return;
        if ([403, 404].includes(requestError.response?.status)) setForbidden(true);
        setError(
          normalizeApiError(requestError, 'Não foi possível carregar o cronograma.').message
        );
      } finally {
        if (scope.isReadCurrent('load', request)) setLoading(false);
      }
    },
    [projectId, scope]
  );

  useEffect(() => {
    setProject(null);
    setSchedule(null);
    setSprints([]);
    setMilestones([]);
    setCurrentMembership(null);
    setSuccess('');
    void loadAll();
  }, [loadAll]);

  // Confirm before applying a DTO. The receipt pins later reconciliation to these versions.
  const confirmMutation = useCallback(
    (context, resource, saved, affected) => {
      if (!scope.isCurrent(context)) return null;
      const deleted = deletedIds.current.get(context.state) || new Set();
      deletedIds.current.set(context.state, deleted);
      const identity = `${resource}:${Number(saved?.id)}`;
      if (saved && !saved.deletedAt && deleted.has(identity)) return null;
      if (saved?.deletedAt) deleted.add(identity);
      const receipt = scope.invalidate(context, affected || [resource, 'schedule']);
      if (!receipt) return null;
      if (saved && resource === 'sprints') setSprints((items) => mergeEntity(items, saved));
      if (saved && resource === 'milestones') setMilestones((items) => mergeEntity(items, saved));
      // Aggregates and associations are absent from mutation DTOs. Do not retain a stale
      // derived snapshot or restore it when reconciliation fails.
      setSchedule(null);
      return receipt;
    },
    [scope]
  );

  const feedback = useCallback(
    (message, context = scope.capture()) => {
      if (!scope.isCurrent(context)) return;
      feedbackGeneration.current += 1;
      setSuccess(message);
      setError('');
      setStaleWarning('');
    },
    [scope]
  );
  const fail = useCallback(
    (message, context = scope.capture()) => {
      if (!scope.isCurrent(context)) return;
      feedbackGeneration.current += 1;
      setSuccess('');
      setStaleWarning('');
      setError(message);
    },
    [scope]
  );
  const handleFailure = useCallback(
    (requestError, fallback, context) => {
      fail(normalizeApiError(requestError, fallback).message, context);
    },
    [fail]
  );
  const warn = useCallback(
    (message, context = scope.capture()) => {
      if (!scope.isCurrent(context)) return;
      feedbackGeneration.current += 1;
      setSuccess('');
      setError('');
      setStaleWarning(message);
    },
    [scope]
  );
  const settle = useCallback(
    async (message, refresh, context = scope.capture()) => {
      if (!scope.isCurrent(context)) return;
      feedback(message, context);
      const generation = feedbackGeneration.current;
      try {
        await refresh();
      } catch {
        if (!scope.isCurrent(context) || generation !== feedbackGeneration.current) return;
        setStaleWarning(
          'A ação foi concluída, mas os dados exibidos não puderam ser atualizados. Recarregue a página.'
        );
      }
    },
    [feedback, scope]
  );

  return {
    project,
    schedule,
    sprints,
    milestones,
    captureContext: scope.capture,
    isCurrentContext: scope.isCurrent,
    confirmMutation,
    somenteLeitura: currentMembership?.role === 'VIEWER',
    loading,
    forbidden,
    error,
    success,
    staleWarning,
    loadAll,
    refreshSchedule,
    refreshSprints,
    refreshMilestones,
    handleFailure,
    fail,
    warn,
    settle
  };
}
