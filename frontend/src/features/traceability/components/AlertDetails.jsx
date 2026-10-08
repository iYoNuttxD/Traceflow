import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  ErrorState,
  FeedbackRegion,
  GithubExternalAction,
  LoadingState,
  normalizeApiError
} from '../../../shared/index.js';
import { useTestCaseScope } from '../../testCases/index.js';
import { dismissTraceabilityAlert, getTraceabilityAlert } from '../api/traceability.api.js';
import { formatInstant, taskStatusLabel } from '../model/alert-view.js';
import { AlertBadges, AlertFacts } from './AlertCard.jsx';
import { AlertDismissForm } from './AlertDismissForm.jsx';
import { AlertLinkTask } from './AlertLinkTask.jsx';
import '../styles/trace-alert.css';
import './AlertDetails.css';

function ContextRow({ label, children }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function TaskContext({ context }) {
  return (
    <>
      <ContextRow label="Status">{taskStatusLabel(context.status)}</ContextRow>
      <ContextRow label="Requisito">{context.requirement?.code || 'Sem requisito'}</ContextRow>
      <ContextRow label="Responsável">{context.responsible?.name || 'Sem responsável'}</ContextRow>
      <ContextRow label="Pull request vinculada">
        {context.pullRequest
          ? `PR #${context.pullRequest.number} · ${context.pullRequest.title}`
          : 'Nenhuma'}
      </ContextRow>
      <ContextRow label="Issues vinculadas">{context.issueCount}</ContextRow>
    </>
  );
}

function PullRequestContext({ context }) {
  return (
    <>
      <ContextRow label="Pull request">{`PR #${context.number} · ${context.title}`}</ContextRow>
      <ContextRow label="Branches">
        {`${context.sourceBranch || 'origem não informada'} → ${context.targetBranch || 'destino não informado'}`}
      </ContextRow>
      <ContextRow label="Mesclada em">{formatInstant(context.mergedAt)}</ContextRow>
    </>
  );
}

function IssueContext({ context }) {
  return (
    <>
      <ContextRow label="Issue">{`Issue #${context.number} · ${context.title}`}</ContextRow>
      <ContextRow label="Estado no GitHub">
        {context.state === 'closed' ? 'Fechada' : 'Aberta'}
      </ContextRow>
      <ContextRow label="Fechada em">
        {formatInstant(context.closedAt) || 'Não informado'}
      </ContextRow>
    </>
  );
}

const contexts = { TASK: TaskContext, PULL_REQUEST: PullRequestContext, ISSUE: IssueContext };

export function AlertDetails({ projectId, alertId, permissions = {}, onChanged }) {
  const scope = useTestCaseScope(`${projectId}:alert:${alertId}`);
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [view, setView] = useState('details');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState({});
  const read = useCallback(async () => {
    const token = scope.begin('alert');
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const response = await getTraceabilityAlert(projectId, alertId, {
        signal: token.controller.signal,
        fresh: true
      });
      if (scope.accepts('alert', token))
        setState({ loading: false, data: response.alert, error: null });
    } catch (failure) {
      if (scope.accepts('alert', token))
        setState((current) => ({
          ...current,
          loading: false,
          error: normalizeApiError(failure, 'Não foi possível carregar o alerta.')
        }));
    }
  }, [projectId, alertId, scope]);
  useEffect(() => {
    void read();
  }, [read]);

  async function afterMutation(success) {
    setView('details');
    setFeedback({ success });
    onChanged?.();
    await read();
  }

  async function dismiss(reason) {
    setBusy(true);
    setFeedback({});
    try {
      await dismissTraceabilityAlert(projectId, alertId, reason);
      await afterMutation('Alerta dispensado.');
    } catch (failure) {
      const error = normalizeApiError(failure, 'Não foi possível dispensar o alerta.');
      if (error.code === 'TRACEABILITY_ALERT_NOT_OPEN') {
        setView('details');
        setFeedback({ error: 'Este alerta já foi resolvido. A lista foi atualizada.' });
        onChanged?.();
        await read();
      } else setFeedback({ error: error.message });
    } finally {
      setBusy(false);
    }
  }

  const alert = state.data;
  if (!alert && state.loading) return <LoadingState message="Carregando alerta..." />;
  if (!alert) return <ErrorState message={state.error?.message} onRetry={read} />;

  const Context = contexts[alert.subject.type];
  const active = alert.status !== 'RESOLVED';
  const canLink =
    permissions.canLink && active && alert.subject.available && alert.subject.type !== 'TASK';
  const canDismiss = permissions.canManage && alert.status === 'OPEN';

  return (
    <div className="trace-alert-details">
      <FeedbackRegion success={feedback.success} error={feedback.error} />
      {state.error && <ErrorState message={state.error.message} onRetry={read} />}
      <AlertBadges alert={alert} />
      <p className="trace-alert-subject">
        <span className="trace-alert-subject__code">{alert.subject.code}</span>
        {alert.subject.title}
      </p>
      {!alert.subject.available && (
        <p className="trace-alert-notice">
          O item deste alerta foi excluído. Os dados exibidos são os da detecção.
        </p>
      )}
      <AlertFacts alert={alert} />
      {alert.context && Context && (
        <section aria-label="Contexto do alerta">
          <h4>Contexto</h4>
          <dl className="trace-alert-context">
            <Context context={alert.context} />
          </dl>
          {alert.subject.type === 'TASK' && alert.context.pendingCommitSuggestions > 0 && (
            <p className="trace-alert-notice">
              {alert.context.pendingCommitSuggestions === 1
                ? '1 sugestão de commit pendente para esta tarefa.'
                : `${alert.context.pendingCommitSuggestions} sugestões de commit pendentes para esta tarefa.`}
            </p>
          )}
        </section>
      )}
      {view === 'dismiss' && (
        <AlertDismissForm busy={busy} onSubmit={dismiss} onCancel={() => setView('details')} />
      )}
      {view === 'link' && (
        <AlertLinkTask
          projectId={projectId}
          alert={alert}
          onCancel={() => setView('details')}
          onLinked={(task) => afterMutation(`Vínculo salvo em TASK-${task.id}.`)}
        />
      )}
      {view === 'details' && (
        <div className="trace-alert-actions">
          {alert.subject.type === 'TASK' && alert.subject.available && (
            <Link
              className="button button-primary"
              to={`/projects/${projectId}/kanban?task=${alert.subject.id}`}
            >
              Abrir tarefa no Kanban
            </Link>
          )}
          {canLink && (
            <button type="button" className="button button-primary" onClick={() => setView('link')}>
              Vincular a uma tarefa
            </button>
          )}
          {canDismiss && (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setView('dismiss')}
            >
              Dispensar alerta
            </button>
          )}
          {alert.subject.githubUrl && <GithubExternalAction href={alert.subject.githubUrl} />}
        </div>
      )}
    </div>
  );
}
