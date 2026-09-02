import { useCallback, useEffect, useRef, useState } from 'react';
import { scheduleApi } from '../api/schedule.api.js';
import { projectsApi } from '../../projects/index.js';
import { normalizeApiError, useAbortableRequest } from '../../../shared/index.js';

export function useScheduleData(projectId) {
  const { run } = useAbortableRequest();
  const { run: runSchedule, cancel: cancelSchedule } = useAbortableRequest();
  const { run: runSprints, cancel: cancelSprints } = useAbortableRequest();
  const { run: runMilestones, cancel: cancelMilestones } = useAbortableRequest();

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

  const generationRef = useRef(0);
  const projectRef = useRef(projectId);

  const isCurrent = useCallback((generation) => generation === generationRef.current, []);

  const reportFailure = useCallback((requestError, fallback) => {
    const normalized = normalizeApiError(requestError, fallback);
    if ([403, 404].includes(requestError.response?.status)) setForbidden(true);
    setError(normalized.message);
  }, []);

  const loadAll = useCallback(
    async (range = {}) => {
      generationRef.current += 1;
      const generation = generationRef.current;

      if (projectRef.current !== projectId) {
        projectRef.current = projectId;
        cancelSchedule();
        cancelSprints();
        cancelMilestones();
        setProject(null);
        setSchedule(null);
        setSprints([]);
        setMilestones([]);
        setCurrentMembership(null);
        setSuccess('');
      }

      setLoading(true);
      setError('');
      setStaleWarning('');
      setForbidden(false);
      try {
        const result = await run(async (signal) => {
          const [
            projectResponse,
            scheduleResponse,
            sprintsResponse,
            milestonesResponse,
            membershipResponse
          ] = await Promise.all([
            projectsApi.get(projectId, { signal }),
            scheduleApi.getSchedule(projectId, range, { signal }),
            scheduleApi.listSprints(projectId, {}, { signal }),
            scheduleApi.listMilestones(projectId, {}, { signal }),
            scheduleApi.getMembership(projectId, { signal })
          ]);
          return {
            project: projectResponse.data.project,
            schedule: scheduleResponse.data,
            sprints: sprintsResponse.data.sprints || [],
            milestones: milestonesResponse.data.milestones || [],
            membership: membershipResponse.data.currentMembership || null
          };
        });
        if (!result || !isCurrent(generation)) return;
        setProject(result.project);
        setSchedule(result.schedule);
        setSprints(result.sprints);
        setMilestones(result.milestones);
        setCurrentMembership(result.membership);
      } catch (requestError) {
        if (!isCurrent(generation)) return;
        reportFailure(requestError, 'Não foi possível carregar o cronograma.');
      } finally {
        if (isCurrent(generation)) setLoading(false);
      }
    },
    [projectId, reportFailure, run, isCurrent, cancelSchedule, cancelSprints, cancelMilestones]
  );

  const refreshSchedule = useCallback(
    async (range = {}) => {
      const generation = generationRef.current;
      const response = await runSchedule((signal) =>
        scheduleApi.getSchedule(projectId, range, { signal })
      );
      if (!response || !isCurrent(generation)) return;
      setSchedule(response.data);
    },
    [projectId, runSchedule, isCurrent]
  );

  const refreshSprints = useCallback(async () => {
    const generation = generationRef.current;
    const response = await runSprints((signal) =>
      scheduleApi.listSprints(projectId, {}, { signal })
    );
    if (!response || !isCurrent(generation)) return;
    setSprints(response.data.sprints || []);
  }, [projectId, runSprints, isCurrent]);

  const refreshMilestones = useCallback(async () => {
    const generation = generationRef.current;
    const response = await runMilestones((signal) =>
      scheduleApi.listMilestones(projectId, {}, { signal })
    );
    if (!response || !isCurrent(generation)) return;
    setMilestones(response.data.milestones || []);
  }, [projectId, runMilestones, isCurrent]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const feedback = useCallback((message) => {
    setSuccess(message);
    setError('');
    setStaleWarning('');
  }, []);

  const handleFailure = useCallback((requestError, fallback) => {
    setSuccess('');
    setStaleWarning('');
    setError(normalizeApiError(requestError, fallback).message);
  }, []);

  const fail = useCallback((message) => {
    setSuccess('');
    setStaleWarning('');
    setError(message);
  }, []);

  const settle = useCallback(
    async (message, refresh) => {
      feedback(message);
      try {
        await refresh();
      } catch {
        setStaleWarning(
          'A ação foi concluída, mas os dados exibidos não puderam ser atualizados. Recarregue a página.'
        );
      }
    },
    [feedback]
  );

  return {
    project,
    schedule,
    sprints,
    milestones,
    setSprints,
    setMilestones,
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
    feedback,
    handleFailure,
    fail,
    settle
  };
}
