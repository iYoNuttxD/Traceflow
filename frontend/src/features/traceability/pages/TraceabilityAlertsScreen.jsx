import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import {
  ContextualErrorPage,
  EmptyState,
  ErrorState,
  FeedbackRegion,
  LoadingState,
  SelectControl,
  classifyPageError,
  getErrorRequestId,
  normalizeApiError
} from '../../../shared/index.js';
import { ProjectSectionNav } from '../../projects/index.js';
import { CollapsibleFilterPanel, SprintDialog } from '../../schedule/index.js';
import { reconcileTraceabilityAlerts } from '../api/traceability.api.js';
import { AlertCard } from '../components/AlertCard.jsx';
import { AlertDetails } from '../components/AlertDetails.jsx';
import { TraceabilitySubnav } from '../components/TraceabilitySubnav.jsx';
import { useAlertSummary } from '../hooks/useAlertSummary.js';
import { useTraceabilityAlerts } from '../hooks/useTraceabilityAlerts.js';
import {
  ALERT_STATUSES,
  ALERT_TYPES,
  activeAlertFilterCount,
  alertEmptyTitle,
  alertSummarySentence,
  alertTypeLabel,
  reconcileMessage
} from '../model/alert-view.js';
import '../styles/trace-alert.css';
import './TraceabilityAlertsScreen.css';

export function TraceabilityAlertsScreen() {
  const { projectId } = useParams();
  return <ProjectAlerts key={projectId} projectId={projectId} />;
}

function AlertFilters({ filters, onChange, onClear, count }) {
  const activeCount = activeAlertFilterCount(filters);
  return (
    <CollapsibleFilterPanel
      className="sprint-filters"
      resultLabel={count === undefined ? '' : `${count} ${count === 1 ? 'alerta' : 'alertas'}`}
      activeCount={activeCount}
    >
      {activeCount > 0 && (
        <div className="planning-filter-panel__actions">
          <button type="button" className="sprint-filters__clear" onClick={onClear}>
            Limpar filtros
          </button>
        </div>
      )}
      <div className="trace-alert-filter-grid">
        <label className="sprint-filter">
          <span>Situação</span>
          <SelectControl
            value={filters.status}
            onChange={(event) => onChange('status', event.target.value)}
          >
            {Object.entries(ALERT_STATUSES).map(([value, status]) => (
              <option key={value} value={value}>
                {status.filter}
              </option>
            ))}
          </SelectControl>
        </label>
        <label className="sprint-filter">
          <span>Tipo</span>
          <SelectControl
            value={filters.type}
            onChange={(event) => onChange('type', event.target.value)}
          >
            <option value="">Todos</option>
            {Object.keys(ALERT_TYPES).map((type) => (
              <option key={type} value={type}>
                {alertTypeLabel(type)}
              </option>
            ))}
          </SelectControl>
        </label>
      </div>
    </CollapsibleFilterPanel>
  );
}

function ProjectAlerts({ projectId }) {
  const alerts = useTraceabilityAlerts(projectId);
  const { summary, reload: reloadSummary } = useAlertSummary(projectId);
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState({});
  const [reconciling, setReconciling] = useState(false);
  const returnFocusRef = useRef(null);
  const listHeadingRef = useRef(null);
  const reloadAlerts = alerts.reload;
  const permissions = alerts.data?.permissions || summary?.permissions || {};
  const refresh = useCallback(() => {
    void reloadAlerts();
    void reloadSummary();
  }, [reloadAlerts, reloadSummary]);
  const closeDetails = useCallback(() => setSelected(null), []);
  useEffect(() => {
    if (selected || !returnFocusRef.current) return;
    if (!returnFocusRef.current.isConnected) listHeadingRef.current?.focus();
    returnFocusRef.current = null;
  }, [selected]);

  async function reconcile() {
    setReconciling(true);
    setFeedback({});
    try {
      const response = await reconcileTraceabilityAlerts(projectId);
      setFeedback({ success: reconcileMessage(response.result) });
      refresh();
    } catch (failure) {
      const error = normalizeApiError(failure, 'Não foi possível reprocessar os alertas.');
      setFeedback({ error: error.message, retryAfterSeconds: error.retryAfterSeconds });
    } finally {
      setReconciling(false);
    }
  }

  if (!alerts.loading && !alerts.data && alerts.error)
    return (
      <ContextualErrorPage
        type={classifyPageError(alerts.error)}
        description={alerts.error.message}
        requestId={getErrorRequestId(alerts.error)}
        retryAfterSeconds={alerts.error.retryAfterSeconds}
        onRetry={alerts.retry}
      />
    );

  return (
    <main className="page-container sprints-screen traceability-page">
      <div className="trace-alerts-content" inert={selected ? true : undefined}>
        <header className="page-header sprints-screen__header">
          <div>
            <span className="eyebrow">Rastreabilidade</span>
            <h1>Alertas de rastreabilidade</h1>
            <p>
              Inconsistências entre tarefas e artefatos do GitHub, detectadas e resolvidas pelo
              servidor conforme a regra documentada.
            </p>
          </div>
          <ProjectSectionNav projectId={projectId} activeSection="traceability" />
        </header>
        <TraceabilitySubnav
          projectId={projectId}
          active="alerts"
          openAlerts={summary?.open.total}
        />
        <FeedbackRegion
          success={feedback.success}
          error={feedback.error}
          retryAfterSeconds={feedback.retryAfterSeconds}
        />
        <section className="sprints-summary trace-alert-summary" aria-label="Resumo dos alertas">
          <p className="trace-alert-summary__sentence" aria-live="polite">
            {summary ? alertSummarySentence(summary) : 'Carregando resumo dos alertas...'}
          </p>
          {summary && !summary.rules.taskWithoutCommitActive && (
            <p className="trace-alert-notice">
              O alerta de tarefa concluída sem commit fica ativo quando o projeto tem um repositório
              GitHub integrado.
            </p>
          )}
          {permissions.canManage && (
            <div className="trace-alert-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={reconcile}
                disabled={reconciling}
                aria-busy={reconciling || undefined}
              >
                Reprocessar alertas
              </button>
            </div>
          )}
        </section>
        <AlertFilters
          filters={alerts.filters}
          onChange={alerts.change}
          onClear={alerts.clear}
          count={alerts.data?.pagination.total}
        />
        <section className="sprint-grid-section" aria-label="Alertas">
          <header className="sprint-grid-section__heading">
            <h2 ref={listHeadingRef} tabIndex={-1}>
              Alertas
            </h2>
          </header>
          <div className="sprint-grid" role="list">
            {alerts.data?.alerts.map((alert) => (
              <div role="listitem" key={alert.id}>
                <AlertCard
                  alert={alert}
                  onOpen={(item, trigger) => {
                    returnFocusRef.current = trigger;
                    setSelected(item);
                  }}
                />
              </div>
            ))}
          </div>
          {alerts.loading && <LoadingState message="Carregando alertas..." />}
          {alerts.error && (
            <ErrorState
              message={alerts.error.message}
              retryAfterSeconds={alerts.error.retryAfterSeconds}
              onRetry={alerts.retry}
            />
          )}
          {!alerts.loading && !alerts.error && alerts.data?.alerts.length === 0 && (
            <EmptyState title={alertEmptyTitle(alerts.filters)} />
          )}
          {alerts.data?.pagination.page < alerts.data?.pagination.totalPages && !alerts.error && (
            <button
              type="button"
              className="button button-secondary trace-alert-load-more"
              disabled={alerts.loading}
              onClick={alerts.more}
            >
              Carregar mais alertas
            </button>
          )}
        </section>
      </div>
      <SprintDialog
        open={Boolean(selected)}
        title={selected ? `Alerta · ${selected.subject.code}` : 'Alerta'}
        description={selected ? alertTypeLabel(selected.type) : undefined}
        size="wide"
        onClose={closeDetails}
        returnFocusRef={returnFocusRef}
      >
        {selected && (
          <AlertDetails
            key={selected.id}
            projectId={projectId}
            alertId={selected.id}
            permissions={permissions}
            onChanged={refresh}
          />
        )}
      </SprintDialog>
    </main>
  );
}
