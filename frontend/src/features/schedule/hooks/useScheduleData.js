import { useCallback, useEffect, useState } from 'react';
import { scheduleApi } from '../api/schedule.api.js';
import { projectsApi } from '../../projects/index.js';
import { normalizeApiError, useAbortableRequest } from '../../../shared/index.js';

// Carga comum das três telas de cronograma — Sprints, Marcos e a agenda.
//
// Elas nasceram de uma tela só e continuam precisando exatamente do mesmo
// conjunto: as sprints trazem status e ações, os marcos trazem o agrupamento, e
// o agregado traz a composição e os pontos de cada sprint. Duplicar essa carga
// em três arquivos faria as três divergirem no primeiro ajuste.
//
// O que NÃO vive aqui é o estado de cada tela — painel aberto, sprint
// selecionada, mês do calendário. Esses são de cada uma, e centralizá-los
// devolveria a tela única por outro caminho.
export function useScheduleData(projectId) {
  const { run } = useAbortableRequest();

  const [project, setProject] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [sprints, setSprints] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [currentMembership, setCurrentMembership] = useState(null);

  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const reportFailure = useCallback((requestError, fallback) => {
    const normalized = normalizeApiError(requestError, fallback);
    // 403 e 404 recebem tratamento de acesso negado, como em Tarefas e Kanban.
    if ([403, 404].includes(requestError.response?.status)) setForbidden(true);
    setError(normalized.message);
  }, []);

  const loadAll = useCallback(
    async (range = {}) => {
      setLoading(true);
      setError('');
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
        if (!result) return;
        setProject(result.project);
        setSchedule(result.schedule);
        setSprints(result.sprints);
        setMilestones(result.milestones);
        setCurrentMembership(result.membership);
      } catch (requestError) {
        reportFailure(requestError, 'Não foi possível carregar o cronograma.');
      } finally {
        setLoading(false);
      }
    },
    [projectId, reportFailure, run]
  );

  // Recargas dirigidas: cada mutação rebusca apenas o que ela pode ter mudado,
  // em vez de recarregar a tela inteira.
  const refreshSchedule = useCallback(
    async (range = {}) => {
      const response = await scheduleApi.getSchedule(projectId, range);
      setSchedule(response.data);
    },
    [projectId]
  );

  const refreshSprints = useCallback(async () => {
    const response = await scheduleApi.listSprints(projectId);
    setSprints(response.data.sprints || []);
  }, [projectId]);

  const refreshMilestones = useCallback(async () => {
    const response = await scheduleApi.listMilestones(projectId);
    setMilestones(response.data.milestones || []);
  }, [projectId]);

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const feedback = useCallback((message) => {
    setSuccess(message);
    setError('');
  }, []);

  const handleFailure = useCallback((requestError, fallback) => {
    setSuccess('');
    setError(normalizeApiError(requestError, fallback).message);
  }, []);

  // Recusa decidida no cliente, antes de qualquer requisição. Passar por
  // `handleFailure` obrigaria a inventar um objeto de erro só para o
  // normalizador desmontá-lo de volta.
  const fail = useCallback((message) => {
    setSuccess('');
    setError(message);
  }, []);

  return {
    project,
    schedule,
    sprints,
    milestones,
    setSprints,
    setMilestones,
    // VIEWER só lê. Oferecer formulário e botão que o backend recusará com 403
    // transforma uma regra conhecida numa descoberta pelo erro.
    somenteLeitura: currentMembership?.role === 'VIEWER',
    loading,
    forbidden,
    error,
    success,
    loadAll,
    refreshSchedule,
    refreshSprints,
    refreshMilestones,
    feedback,
    handleFailure,
    fail
  };
}
