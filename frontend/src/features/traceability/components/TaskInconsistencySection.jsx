import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  ErrorState,
  FeedbackRegion,
  TraceFlowIcon,
  normalizeApiError
} from '../../../shared/index.js';
import { dismissTraceabilityAlert, getTraceabilityAlert } from '../api/traceability.api.js';
import { useSubjectAlerts } from '../hooks/useSubjectAlerts.js';
import {
  NO_REPOSITORY_MESSAGE,
  alertFactText,
  alertTypeLabel,
  formatInstant
} from '../model/alert-view.js';
import { AlertDismissForm } from './AlertDismissForm.jsx';
import { AlertHistoryList, AlertHistoryToggle } from './AlertHistory.jsx';
import './TaskInconsistencySection.css';

function useOpenAlert(projectId, alertId) {
  const [state, setState] = useState({ loading: Boolean(alertId), data: null, error: null });
  const sequenceRef = useRef(0);
  const read = useCallback(async () => {
    const sequence = ++sequenceRef.current;
    if (!alertId) {
      setState({ loading: false, data: null, error: null });
      return;
    }
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await getTraceabilityAlert(projectId, alertId, { fresh: true });
      if (sequence === sequenceRef.current) setState({ loading: false, data, error: null });
    } catch (failure) {
      if (sequence === sequenceRef.current)
        setState({
          loading: false,
          data: null,
          error: normalizeApiError(failure, 'Não foi possível carregar a inconsistência.')
        });
    }
  }, [projectId, alertId]);
  useEffect(() => {
    void read();
    return () => {
      sequenceRef.current += 1;
    };
  }, [read]);
  return { ...state, read };
}

export function TaskInconsistencySection({
  projectId,
  taskId,
  openAlertId,
  focusOnLoad = false,
  canLink = false,
  onLinkCommit,
  onChanged
}) {
  const id = useId();
  const headingRef = useRef(null);
  const focusedRef = useRef(false);
  const current = useOpenAlert(projectId, openAlertId);
  const history = useSubjectAlerts(projectId, { taskId });
  const [view, setView] = useState('details');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState({});

  const alert = current.data?.alert?.status === 'OPEN' ? current.data.alert : null;
  const permissions = current.data?.permissions || {};
  const entries = history.alerts.filter((item) => item.id !== alert?.id);
  const historyTotal = Math.max(
    0,
    history.total - (history.alerts.some((item) => item.id === alert?.id) ? 1 : 0)
  );

  useEffect(() => {
    if (!focusOnLoad || focusedRef.current || !alert) return undefined;
    const frame = window.requestAnimationFrame(() => {
      focusedRef.current = true;
      headingRef.current?.scrollIntoView?.({ block: 'start' });
      headingRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusOnLoad, alert]);

  async function dismiss(reason) {
    setBusy(true);
    setFeedback({});
    try {
      await dismissTraceabilityAlert(projectId, alert.id, reason);
      setView('details');
      setFeedback({ success: 'Inconsistência dispensada. O registro continua no histórico.' });
    } catch (failure) {
      const error = normalizeApiError(failure, 'Não foi possível dispensar a inconsistência.');
      if (error.code !== 'TRACEABILITY_ALERT_NOT_OPEN') {
        setFeedback({ error: error.message, retryAfterSeconds: error.retryAfterSeconds });
        return;
      }
      setView('details');
      setFeedback({ error: 'Esta inconsistência já foi resolvida.' });
    } finally {
      setBusy(false);
    }
    onChanged?.();
    void current.read();
    void history.reload();
  }

  const historyId = `${id}-history`;

  if (!alert) {
    const feedbackRegion = (feedback.success || feedback.error) && (
      <FeedbackRegion
        success={feedback.success}
        error={feedback.error}
        retryAfterSeconds={feedback.retryAfterSeconds}
      />
    );
    if (openAlertId && current.loading && !feedbackRegion)
      return (
        <p className="trace-inconsistency__loading" role="status">
          Carregando inconsistência...
        </p>
      );
    if (openAlertId && current.error && !feedbackRegion)
      return (
        <ErrorState
          message={current.error.message}
          retryAfterSeconds={current.error.retryAfterSeconds}
          onRetry={current.read}
        />
      );
    if (!history.error && history.total === 0) return feedbackRegion || null;
    return (
      <>
        {feedbackRegion}
        <section className="trace-inconsistency-history" aria-labelledby={`${id}-history-title`}>
          <h4 id={`${id}-history-title`}>Inconsistências anteriores</h4>
          {history.error ? (
            <ErrorState
              message={history.error.message}
              retryAfterSeconds={history.error.retryAfterSeconds}
              onRetry={history.reload}
            />
          ) : (
            <AlertHistoryToggle
              controls={historyId}
              expanded={historyOpen}
              total={history.total}
              onToggle={() => setHistoryOpen((open) => !open)}
            />
          )}
          {historyOpen && !history.error && (
            <AlertHistoryList
              id={historyId}
              entries={history.alerts}
              total={history.total}
              error={null}
              emptyText="Nenhuma inconsistência anterior desta tarefa."
              onRetry={history.reload}
            />
          )}
        </section>
      </>
    );
  }

  const context = alert.context || {};
  const disconnected = context.integrationConnected === false;

  return (
    <section className="trace-inconsistency" aria-labelledby={`${id}-title`}>
      <h4 id={`${id}-title`} ref={headingRef} tabIndex={-1}>
        <TraceFlowIcon name="alert" />
        Inconsistência: {alertTypeLabel(alert.type).toLocaleLowerCase('pt-BR')}
      </h4>
      <p>
        {alertFactText(alert)} · detectada em {formatInstant(alert.detectedAt)}.
      </p>
      {disconnected ? (
        <p>
          {NO_REPOSITORY_MESSAGE}{' '}
          <Link to={`/projects/${projectId}/repository`}>Abrir o repositório do projeto</Link>
        </p>
      ) : (
        <p>Vincule o commit que entregou a tarefa ou dispense com uma justificativa.</p>
      )}
      {context.pendingCommitSuggestions > 0 && (
        <p>
          {context.pendingCommitSuggestions === 1
            ? '1 sugestão de commit pendente para esta tarefa.'
            : `${context.pendingCommitSuggestions} sugestões de commit pendentes para esta tarefa.`}
        </p>
      )}
      <FeedbackRegion
        success={feedback.success}
        error={feedback.error}
        retryAfterSeconds={feedback.retryAfterSeconds}
      />
      {view === 'dismiss' ? (
        <AlertDismissForm busy={busy} onSubmit={dismiss} onCancel={() => setView('details')} />
      ) : (
        <div className="trace-alert-actions">
          {canLink && !disconnected && onLinkCommit && (
            <button
              type="button"
              className="button button-primary button-compact"
              onClick={onLinkCommit}
            >
              Vincular commit
            </button>
          )}
          {permissions.canManage && (
            <button
              type="button"
              className="button button-secondary button-compact"
              onClick={() => setView('dismiss')}
            >
              Dispensar
            </button>
          )}
          <AlertHistoryToggle
            controls={historyId}
            expanded={historyOpen}
            total={historyTotal}
            disabled={!history.loaded && !history.error}
            onToggle={() => setHistoryOpen((open) => !open)}
          />
        </div>
      )}
      {historyOpen && view !== 'dismiss' && (
        <AlertHistoryList
          id={historyId}
          entries={entries}
          total={historyTotal}
          error={history.error}
          emptyText="Nenhuma inconsistência anterior desta tarefa."
          onRetry={history.reload}
        />
      )}
    </section>
  );
}
