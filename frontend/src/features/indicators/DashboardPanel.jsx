import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { scheduleApi } from '../schedule/index.js';
import { normalizeApiError } from '../../shared/index.js';
import { indicatorsApi } from './api/indicators.api.js';
import { IndicatorCard } from './components/IndicatorCard.jsx';
import {
  DASHBOARD_VIEWS,
  dashboardTimeZone,
  formatDateTime,
  SECTION_LABELS,
  VIEW_LABELS
} from './dashboard-display.js';
import './DashboardPanel.css';

const WARNING_LABELS = {
  PERIOD_REQUIRED_FOR_EVENT_INDICATORS: 'Escolha um período para consultar indicadores de eventos.',
  PERIOD_FILTER_NOT_APPLIED_TO_VIEW:
    'Esta visão não possui indicadores que usem o período solicitado.',
  SPRINT_FILTER_NOT_APPLIED_TO_VIEW:
    'O filtro de Sprint não foi aplicado aos indicadores desta visão.',
  RESPONSIBLE_FILTER_NOT_APPLIED_TO_VIEW:
    'O recorte por responsável ainda não é aplicado com segurança nesta visão.',
  SOURCE_UNAVAILABLE: 'Parte das fontes está temporariamente indisponível.'
};

const VIEW_STATES = {
  AVAILABLE: 'Indicadores disponíveis',
  PARTIAL: 'Visão com dados parciais',
  NO_DATA: 'Ainda não há dados elegíveis',
  UNAVAILABLE: 'Indicadores indisponíveis'
};

function querySelection(params) {
  const rawView = (params.get('view') ?? 'GENERAL').toUpperCase();
  return {
    view: VIEW_LABELS[rawView] ? rawView : 'GENERAL',
    startDate: params.get('startDate') ?? '',
    endDate: params.get('endDate') ?? '',
    timeZone: params.get('timeZone') ?? '',
    sprintId: params.get('sprintId') ?? '',
    responsibleUserId: params.get('responsibleUserId') ?? ''
  };
}

function filtersForRequest(selection) {
  return {
    view: selection.view,
    ...(selection.startDate ? { startDate: selection.startDate } : {}),
    ...(selection.endDate ? { endDate: selection.endDate } : {}),
    ...(selection.timeZone ? { timeZone: selection.timeZone } : {}),
    ...(selection.sprintId ? { sprintId: selection.sprintId } : {}),
    ...(selection.responsibleUserId ? { responsibleUserId: selection.responsibleUserId } : {})
  };
}

function LoadingDashboard() {
  return (
    <div className="dashboard-panel__skeleton" role="status" aria-label="Carregando indicadores">
      {[0, 1, 2, 3].map((index) => (
        <span key={index} />
      ))}
    </div>
  );
}

export function DashboardPanel({ projectId, members = [], refreshVersion = 0 }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const selection = querySelection(searchParams);
  const { view, startDate, endDate, timeZone, sprintId, responsibleUserId } = selection;
  const [draft, setDraft] = useState(selection);
  const [filterError, setFilterError] = useState('');
  const [catalogState, setCatalogState] = useState({ projectId: null, data: null, error: null });
  const [sprintState, setSprintState] = useState({ projectId: null, rows: [], error: null });
  const [dashboardState, setDashboardState] = useState({ identity: null, data: null, error: null });
  const [manualRefresh, setManualRefresh] = useState(0);
  const [catalogRefresh, setCatalogRefresh] = useState(0);
  const dashboardGeneration = useRef(0);
  const catalogGeneration = useRef(0);
  const sprintGeneration = useRef(0);
  const zone = dashboardTimeZone();
  const identity = [
    projectId,
    view,
    startDate,
    endDate,
    timeZone,
    sprintId,
    responsibleUserId,
    refreshVersion,
    manualRefresh
  ].join('|');

  useEffect(() => {
    setDraft({ view, startDate, endDate, timeZone, sprintId, responsibleUserId });
    setFilterError('');
  }, [view, startDate, endDate, timeZone, sprintId, responsibleUserId]);

  useEffect(() => {
    const generation = ++catalogGeneration.current;
    const controller = new AbortController();
    setCatalogState({ projectId, data: null, error: null });
    void indicatorsApi.catalog(projectId, { signal: controller.signal }).then(
      (response) => {
        if (catalogGeneration.current === generation && !controller.signal.aborted)
          setCatalogState({ projectId, data: response.data.indicators, error: null });
      },
      (error) => {
        if (catalogGeneration.current === generation && !controller.signal.aborted)
          setCatalogState({
            projectId,
            data: null,
            error: normalizeApiError(error, 'Não foi possível carregar o catálogo de indicadores.')
          });
      }
    );
    return () => controller.abort();
  }, [projectId, catalogRefresh]);

  useEffect(() => {
    const generation = ++sprintGeneration.current;
    const controller = new AbortController();
    setSprintState({ projectId, rows: [], error: null });
    void scheduleApi.listSprints(projectId, {}, { signal: controller.signal }).then(
      (response) => {
        if (sprintGeneration.current === generation && !controller.signal.aborted)
          setSprintState({ projectId, rows: response.data.sprints ?? [], error: null });
      },
      () => {
        if (sprintGeneration.current === generation && !controller.signal.aborted)
          setSprintState({
            projectId,
            rows: [],
            error: 'Não foi possível carregar as Sprints para o filtro.'
          });
      }
    );
    return () => controller.abort();
  }, [projectId]);

  useEffect(() => {
    const generation = ++dashboardGeneration.current;
    const controller = new AbortController();
    setDashboardState({ identity, data: null, error: null });
    void indicatorsApi
      .dashboard(
        projectId,
        filtersForRequest({ view, startDate, endDate, timeZone, sprintId, responsibleUserId }),
        { signal: controller.signal }
      )
      .then(
        (response) => {
          if (dashboardGeneration.current === generation && !controller.signal.aborted)
            setDashboardState({ identity, data: response.data, error: null });
        },
        (error) => {
          if (dashboardGeneration.current === generation && !controller.signal.aborted)
            setDashboardState({
              identity,
              data: null,
              error: normalizeApiError(error, 'Não foi possível carregar os indicadores.')
            });
        }
      );
    return () => controller.abort();
  }, [
    projectId,
    view,
    startDate,
    endDate,
    timeZone,
    sprintId,
    responsibleUserId,
    refreshVersion,
    manualRefresh,
    identity
  ]);

  function selectView(view) {
    const next = new URLSearchParams(searchParams);
    if (view === 'GENERAL') next.delete('view');
    else next.set('view', view.toLowerCase());
    setSearchParams(next);
  }

  function handleTabKeyDown(event, index) {
    const count = DASHBOARD_VIEWS.length;
    const nextIndex =
      event.key === 'ArrowRight'
        ? (index + 1) % count
        : event.key === 'ArrowLeft'
          ? (index - 1 + count) % count
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? count - 1
              : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    selectView(DASHBOARD_VIEWS[nextIndex][0]);
    event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[nextIndex]?.focus();
  }

  function applyFilters(event) {
    event.preventDefault();
    if (Boolean(draft.startDate) !== Boolean(draft.endDate)) {
      setFilterError('Informe as duas datas do período ou deixe ambas vazias.');
      return;
    }
    if (draft.startDate && draft.startDate > draft.endDate) {
      setFilterError('A data inicial deve ser anterior ou igual à final.');
      return;
    }
    const next = new URLSearchParams(searchParams);
    for (const key of ['startDate', 'endDate', 'timeZone', 'sprintId', 'responsibleUserId'])
      next.delete(key);
    if (draft.startDate && draft.endDate) {
      next.set('startDate', draft.startDate);
      next.set('endDate', draft.endDate);
      next.set('timeZone', draft.timeZone || zone);
    }
    if (draft.sprintId) next.set('sprintId', draft.sprintId);
    if (draft.responsibleUserId) next.set('responsibleUserId', draft.responsibleUserId);
    setFilterError('');
    setSearchParams(next);
  }

  function clearFilters() {
    const next = new URLSearchParams(searchParams);
    for (const key of ['startDate', 'endDate', 'timeZone', 'sprintId', 'responsibleUserId'])
      next.delete(key);
    setSearchParams(next);
  }

  const dashboard = dashboardState.identity === identity ? dashboardState.data : null;
  const dashboardError = dashboardState.identity === identity ? dashboardState.error : null;
  const catalog = catalogState.projectId === projectId ? catalogState.data : null;
  const catalogError = catalogState.projectId === projectId ? catalogState.error : null;
  const sprints = sprintState.projectId === projectId ? sprintState.rows : [];
  const catalogById = new Map((catalog ?? []).map((item) => [item.metricId, item]));
  const missingMetadata = dashboard?.sections?.some((section) =>
    section.indicators.some((indicator) => !catalogById.has(indicator.metricId))
  );
  const requestedFilters = dashboard?.requestedFilters ?? {
    period: null,
    sprintId: null,
    responsibleUserId: null
  };

  return (
    <section className="dashboard-panel" aria-labelledby="dashboard-panel-title">
      <header className="dashboard-panel__header">
        <div>
          <p className="dashboard-panel__eyebrow">Acompanhamento do projeto</p>
          <h2 id="dashboard-panel-title">Indicadores</h2>
          <p>Progresso, entrega e qualidade em um só lugar.</p>
        </div>
        <button
          type="button"
          className="dashboard-panel__refresh"
          onClick={() => setManualRefresh((value) => value + 1)}
        >
          Atualizar indicadores
        </button>
      </header>

      <div className="dashboard-panel__tabs" role="tablist" aria-label="Visões de indicadores">
        {DASHBOARD_VIEWS.map(([view, label], index) => (
          <button
            key={view}
            id={`dashboard-tab-${view.toLowerCase()}`}
            type="button"
            role="tab"
            aria-selected={selection.view === view}
            aria-controls="dashboard-view-content"
            tabIndex={selection.view === view ? 0 : -1}
            onClick={() => selectView(view)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
          >
            {label}
          </button>
        ))}
      </div>

      <form
        className="dashboard-panel__filters"
        onSubmit={applyFilters}
        aria-label="Filtros de indicadores"
      >
        <div className="dashboard-panel__filter-heading">
          <strong>Filtros</strong>
          <span>Período opcional · fuso {draft.timeZone || zone}</span>
        </div>
        <label>
          De
          <input
            type="date"
            value={draft.startDate}
            onChange={(event) =>
              setDraft((current) => ({ ...current, startDate: event.target.value }))
            }
          />
        </label>
        <label>
          Até
          <input
            type="date"
            value={draft.endDate}
            min={draft.startDate || undefined}
            onChange={(event) =>
              setDraft((current) => ({ ...current, endDate: event.target.value }))
            }
          />
        </label>
        <label>
          Sprint
          <select
            value={draft.sprintId}
            onChange={(event) =>
              setDraft((current) => ({ ...current, sprintId: event.target.value }))
            }
          >
            <option value="">Seleção automática</option>
            {sprints.map((sprint) => (
              <option key={sprint.id} value={sprint.id}>
                {sprint.name} · {sprint.status}
              </option>
            ))}
          </select>
        </label>
        <label>
          Responsável
          <select
            value={draft.responsibleUserId}
            onChange={(event) =>
              setDraft((current) => ({ ...current, responsibleUserId: event.target.value }))
            }
          >
            <option value="">Todos</option>
            {members
              .filter((member) => member.userId && member.user?.name)
              .map((member) => (
                <option key={member.id} value={member.userId}>
                  {member.user.name}
                  {member.isActive ? '' : ' · inativo'}
                </option>
              ))}
          </select>
        </label>
        <div className="dashboard-panel__filter-actions">
          <button type="submit">Aplicar filtros</button>
          <button type="button" onClick={clearFilters}>
            Limpar
          </button>
        </div>
        {filterError && (
          <p role="alert" className="dashboard-panel__filter-error">
            {filterError}
          </p>
        )}
        {sprintState.error && <p className="dashboard-panel__filter-error">{sprintState.error}</p>}
      </form>

      <div
        id="dashboard-view-content"
        role="tabpanel"
        aria-labelledby={`dashboard-tab-${selection.view.toLowerCase()}`}
        className="dashboard-panel__body"
      >
        {catalogError && (
          <div className="dashboard-panel__error" role="alert">
            <p>Não foi possível carregar o catálogo de indicadores.</p>
            <button type="button" onClick={() => setCatalogRefresh((value) => value + 1)}>
              Tentar novamente
            </button>
          </div>
        )}
        {dashboardError && (
          <div className="dashboard-panel__error" role="alert">
            <p>Não foi possível carregar os indicadores.</p>
            <button type="button" onClick={() => setManualRefresh((value) => value + 1)}>
              Tentar novamente
            </button>
          </div>
        )}
        {!catalogError && !dashboardError && (!dashboard || !catalog) && <LoadingDashboard />}
        {dashboard && catalog && missingMetadata && (
          <p role="alert">
            O catálogo não corresponde aos indicadores desta visão. Atualize a página.
          </p>
        )}
        {dashboard && catalog && !missingMetadata && (
          <>
            <div className="dashboard-panel__overview">
              <span
                className={`dashboard-panel__view-state dashboard-panel__view-state--${dashboard.viewState.toLowerCase()}`}
              >
                {VIEW_STATES[dashboard.viewState] ?? dashboard.viewState}
              </span>
              <span>Montado em {formatDateTime(dashboard.generatedAt)}</span>
              {dashboard.context?.sprint && <span>Sprint: {dashboard.context.sprint.name}</span>}
              {dashboard.freshness?.github?.sourceUpdatedAt && (
                <span>
                  GitHub atualizado em {formatDateTime(dashboard.freshness.github.sourceUpdatedAt)}
                </span>
              )}
            </div>
            {dashboard.warnings?.length > 0 && (
              <div className="dashboard-panel__warnings" role="status">
                {dashboard.warnings.map((warning, index) => (
                  <p key={`${warning.code}-${index}`}>
                    {WARNING_LABELS[warning.code] ?? 'Há uma limitação nesta visão.'}
                  </p>
                ))}
              </div>
            )}
            {dashboard.sections.map((section) => (
              <section
                className="dashboard-panel__section"
                key={section.id}
                aria-labelledby={`dashboard-section-${section.id}`}
              >
                <h3 id={`dashboard-section-${section.id}`}>
                  {SECTION_LABELS[section.id] ?? section.id}
                </h3>
                <div className="dashboard-panel__grid">
                  {section.indicators.map((indicator) => (
                    <IndicatorCard
                      key={indicator.metricId}
                      indicator={indicator}
                      metadata={catalogById.get(indicator.metricId)}
                      requestedFilters={requestedFilters}
                    />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </section>
  );
}
