import { useCallback, useEffect, useRef, useState } from 'react';
import { githubApi } from '../../github/index.js';
import { normalizeApiError, useAbortableRequest, useCountdown } from '../../../shared/index.js';
import { projectsApi } from '../api/projects.api.js';

export const isActiveGithubRun = (run) => ['QUEUED', 'RUNNING'].includes(run?.status);

// The screen is keyed by project ID. A generation also invalidates reads within that screen
// when a mutation starts, so an older GET cannot undo a confirmed connection or setting.
export function useProjectGithubIntegration(project, onIntegrationChange) {
  const [integration, setIntegration] = useState(project.githubIntegration || null);
  const [run, setRun] = useState(null);
  const [initialSyncError, setInitialSyncError] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [refreshWarning, setRefreshWarning] = useState('');
  const [statusError, setStatusError] = useState('');
  const [checkingStatus, setCheckingStatus] = useState(Boolean(project.githubIntegration));
  const [refreshing, setRefreshing] = useState(false);
  const [revision, setRevision] = useState(0);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const cooldown = useCountdown(retryAfterSeconds);
  const generation = useRef(0);
  const mounted = useRef(true);
  const lock = useRef(false);
  const runRef = useRef(run);
  runRef.current = run;
  const onChangeRef = useRef(onIntegrationChange);
  onChangeRef.current = onIntegrationChange;
  const { run: readProject, cancel: cancelProject } = useAbortableRequest();
  const { run: readStatus, cancel: cancelStatus } = useAbortableRequest();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, []);

  const applyIntegration = useCallback((value) => {
    setIntegration(value);
    onChangeRef.current?.(value);
  }, []);

  const refresh = useCallback(async () => {
    const version = generation.current;
    setRefreshing(true);
    try {
      const response = await readProject((signal) =>
        projectsApi.get(project.id, { signal, fresh: true })
      );
      if (!response || !mounted.current || version !== generation.current) return;
      applyIntegration(response.data.project.githubIntegration);
      setRefreshWarning('');
    } catch (value) {
      if (!mounted.current || version !== generation.current) return;
      setRefreshWarning(
        'Não foi possível atualizar os dados agora. A última ação confirmada foi preservada.'
      );
      setRetryAfterSeconds(normalizeApiError(value).retryAfterSeconds || 0);
    } finally {
      if (mounted.current && version === generation.current) setRefreshing(false);
    }
  }, [applyIntegration, project.id, readProject]);

  const hasIntegration = Boolean(integration);
  useEffect(() => {
    if (!hasIntegration || busy) return undefined;
    const version = generation.current;
    let cancelled = false;
    let timer;
    async function probe() {
      if (document.visibilityState === 'hidden') return;
      try {
        const result = await readStatus((signal) =>
          githubApi.syncStatus(project.id, { signal, fresh: true })
        );
        if (!result || cancelled || !mounted.current || version !== generation.current) return;
        const previous = runRef.current;
        const wasActive = isActiveGithubRun(previous);
        const changed = previous?.id !== result.run?.id || previous?.status !== result.run?.status;
        runRef.current = result.run;
        setRun(result.run);
        setStatusError('');
        setCheckingStatus(false);
        if (changed && (isActiveGithubRun(result.run) || result.run?.status === 'FAILED')) {
          setSuccess('');
          if (isActiveGithubRun(result.run)) setInitialSyncError('');
        }
        if (
          !isActiveGithubRun(result.run) &&
          (wasActive || changed) &&
          ['SUCCEEDED', 'FAILED'].includes(result.run?.status)
        ) {
          if (result.run?.status === 'SUCCEEDED') {
            setSuccess('Sincronização GitHub concluída com sucesso.');
            setInitialSyncError('');
          }
          await refresh();
        }
        if (!cancelled)
          timer = window.setTimeout(
            () => void probe(),
            isActiveGithubRun(result.run) ? 2500 : 15000
          );
      } catch (value) {
        if (cancelled || !mounted.current || version !== generation.current) return;
        const normalized = normalizeApiError(
          value,
          'Não foi possível consultar o progresso da sincronização.'
        );
        setStatusError(normalized.message);
        setRetryAfterSeconds(normalized.retryAfterSeconds || 0);
      }
    }
    function onVisibility() {
      window.clearTimeout(timer);
      cancelStatus();
      if (document.visibilityState !== 'hidden') void probe();
    }
    document.addEventListener('visibilitychange', onVisibility);
    void probe();
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      cancelled = true;
      window.clearTimeout(timer);
      cancelStatus();
    };
  }, [busy, cancelStatus, hasIntegration, project.id, readStatus, refresh, revision]);

  async function mutate(kind, operation) {
    if (lock.current || cooldown > 0) return false;
    lock.current = true;
    generation.current += 1;
    cancelProject();
    cancelStatus();
    setRefreshing(false);
    setBusy(kind);
    setError('');
    setSuccess('');
    setRetryAfterSeconds(0);
    try {
      const result = await operation();
      if (!mounted.current) return false;
      if (kind === 'settings') {
        // This mutation owns only the preference, not concurrent worker metadata.
        setIntegration((current) => ({
          ...current,
          autoSyncEnabled: result.project.githubIntegration.autoSyncEnabled,
          nextSyncAt: result.project.githubIntegration.nextSyncAt
        }));
        setSuccess('Preferência de sincronização automática salva.');
      } else if (kind === 'connect') {
        applyIntegration(result.project.githubIntegration);
        setRun(result.initialSync?.run || null);
        runRef.current = result.initialSync?.run || null;
        setInitialSyncError(
          result.initialSync?.status === 'FAILED'
            ? 'O repositório foi vinculado, mas não foi possível iniciar a sincronização.'
            : ''
        );
        setSuccess('Repositório vinculado com sucesso.');
      } else {
        setRun(result.run);
        runRef.current = result.run;
        setInitialSyncError('');
        setSuccess(
          result.run?.status === 'SUCCEEDED'
            ? 'Sincronização GitHub concluída com sucesso.'
            : result.run?.status === 'FAILED'
              ? ''
              : 'Sincronização solicitada. Aguarde a conclusão.'
        );
      }
      // Reconciliation has its own failure boundary; it never rejects the mutation.
      void refresh();
      return true;
    } catch (value) {
      if (mounted.current) {
        const normalized = normalizeApiError(value, 'Não foi possível concluir esta ação.');
        setError(normalized.message);
        setRetryAfterSeconds(normalized.retryAfterSeconds || 0);
      }
      return false;
    } finally {
      lock.current = false;
      if (mounted.current) {
        setBusy('');
        setRevision((value) => value + 1);
      }
    }
  }

  return {
    integration,
    run,
    busy,
    error,
    success,
    refreshWarning,
    statusError,
    checkingStatus,
    refreshing,
    initialSyncError,
    cooldown,
    retryAfterSeconds,
    refresh,
    retryStatus: () => setRevision((value) => value + 1),
    connect: (repository) =>
      mutate('connect', () =>
        githubApi.connectProject(project.id, {
          githubInstallationId: repository.githubInstallationId,
          githubRepositoryId: repository.githubRepositoryId
        })
      ),
    sync: () =>
      isActiveGithubRun(runRef.current)
        ? false
        : mutate('sync', () => githubApi.syncProject(project.id)),
    saveAutomatic: (enabled) =>
      mutate('settings', () => githubApi.updateSyncSettings(project.id, enabled))
  };
}
