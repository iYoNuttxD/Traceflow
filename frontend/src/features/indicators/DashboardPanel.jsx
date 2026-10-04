import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { IndicatorsSummary } from './components/IndicatorsSummary.jsx';
import { CollapsibleFilterPanel } from '../schedule/index.js';
import { SelectControl } from '../../shared/index.js';
import '../../shared/styles/internal-tabs.css';
import { scheduleApi } from '../schedule/index.js';
import { normalizeApiError } from '../../shared/index.js';
import { indicatorsApi } from './api/indicators.api.js';
import { IndicatorCard } from './components/IndicatorCard.jsx';
import { ProjectHealth } from './components/ProjectHealth.jsx';
import {
  DASHBOARD_VIEWS,
  dashboardTimeZone,
  describeLimitation,
  presentationLimitations,
  formatDate,
  formatDateTime,
  indicatorVisualType,
  labelForField,
  presentationSections,
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
  UNAVAILABLE: 'Indicadores indisponíveis',
  UNKNOWN: 'Estado da visão desconhecido'
};

function querySelection(params) {
  const rawView = (params.get('view') ?? 'GENERAL').toUpperCase();
  return {
    view: VIEW_LABELS[rawView] ? rawView : 'GENERAL',
    startDate: params.get('startDate') ?? '',
    endDate: params.get('endDate') ?? '',
    timeZone: params.get('timeZone') ?? '',
    sprintId: params.get('sprintId') ?? ''
  };
}

function filtersForRequest(selection) {
  return {
    view: selection.view,
    includeProjectHealth: true,
    ...(selection.startDate ? { startDate: selection.startDate } : {}),
    ...(selection.endDate ? { endDate: selection.endDate } : {}),
    ...(selection.timeZone ? { timeZone: selection.timeZone } : {}),
    ...(selection.sprintId ? { sprintId: selection.sprintId } : {})
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

export function DashboardPanel({ projectId, refreshVersion = 0 }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const selection = querySelection(searchParams);
  const { view, startDate, endDate, timeZone, sprintId } = selection;
  const [draft, setDraft] = useState(selection);
  const [filterError, setFilterError] = useState('');
  const [catalogState, setCatalogState] = useState({ projectId: null, data: null, error: null });
  const [sprintState, setSprintState] = useState({ projectId: null, rows: [], error: null });
  const [dashboardState, setDashboardState] = useState({ identity: null, data: null, error: null });
  const [manualRefresh, setManualRefresh] = useState(0);
  const [catalogRefresh, setCatalogRefresh] = useState(0);
  const [sprintRefresh, setSprintRefresh] = useState(0);
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
    refreshVersion,
    manualRefresh
  ].join('|');

  useEffect(() => {
    setDraft({ startDate, endDate, timeZone, sprintId });
    setFilterError('');
  }, [projectId, startDate, endDate, timeZone, sprintId]);

  useEffect(() => {
    const generation = ++catalogGeneration.current;
    const controller = new AbortController();
    setCatalogState({ projectId, data: null, error: null });
    void indicatorsApi.catalog(projectId, { signal: controller.signal }).then(
      (response) => {
        if (catalogGeneration.current === generation && !controller.signal.aborted)
          setCatalogState({
            projectId,
            data: response.data.indicators,
            views: response.data.views,
            error: null
          });
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
  }, [projectId, sprintRefresh]);

  useEffect(() => {
    const generation = ++dashboardGeneration.current;
    const controller = new AbortController();
    setDashboardState({ identity, data: null, error: null });
    void indicatorsApi
      .dashboard(projectId, filtersForRequest({ view, startDate, endDate, timeZone, sprintId }), {
        signal: controller.signal
      })
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

  function updateFilter(key, value) {
    const updated = { ...draft, [key]: value };
    setDraft(updated);
    const next = new URLSearchParams(searchParams);
    next.delete('responsibleUserId');
    if (key === 'sprintId') {
      if (value) next.set('sprintId', value);
      else next.delete('sprintId');
    } else {
      if (Boolean(updated.startDate) !== Boolean(updated.endDate)) {
        setFilterError('Complete as duas datas para aplicar o período.');
        return;
      }
      if (updated.startDate && updated.startDate > updated.endDate) {
        setFilterError('A data inicial deve ser anterior ou igual à final.');
        return;
      }
      for (const field of ['startDate', 'endDate', 'timeZone']) next.delete(field);
      if (updated.startDate && updated.endDate) {
        next.set('startDate', updated.startDate);
        next.set('endDate', updated.endDate);
        next.set('timeZone', updated.timeZone || zone);
      }
    }
    setFilterError('');
    setSearchParams(next);
  }

  function clearFilters() {
    const next = new URLSearchParams(searchParams);
    for (const key of ['startDate', 'endDate', 'timeZone', 'sprintId', 'responsibleUserId'])
      next.delete(key);
    setDraft({
      view,
      startDate: '',
      endDate: '',
      timeZone: '',
      sprintId: ''
    });
    setFilterError('');
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
  const viewState = VIEW_STATES[dashboard?.viewState] ? dashboard.viewState : 'UNKNOWN';
  const activeFilterCount = Number(Boolean(startDate && endDate)) + Number(Boolean(sprintId));
  const selectedSprint = sprints.find((sprint) => String(sprint.id) === sprintId);
  const filterSummary = [
    startDate && endDate ? `${formatDate(startDate)}–${formatDate(endDate)}` : null,
    sprintId ? `${selectedSprint?.name ?? `Sprint ${sprintId}`}` : null
  ]
    .filter(Boolean)
    .join(' · ');
  const loading = !dashboard && !dashboardError;
  const periodInProgress = dashboard?.sections?.some((section) =>
    section.indicators.some((indicator) => indicator.limitations?.includes('PERIOD_NOT_COMPLETE'))
  );
  const visibleWarnings =
    dashboard?.warnings?.filter((warning) => !warning.code.includes('FILTER_')) ?? [];

  return (
    <section className="dashboard-panel" aria-label="Análise de indicadores">
      <IndicatorsSummary
        health={dashboard?.projectHealth}
        loading={loading}
        metadata={
          dashboard && (
            <>
              <span>
                {viewState !== 'AVAILABLE' ? `${VIEW_STATES[viewState]} · ` : ''}Atualizado em{' '}
                {formatDateTime(dashboard.generatedAt)}
              </span>
              {dashboard.context?.sprint && <span>{dashboard.context.sprint.name}</span>}
              {dashboard.freshness?.github?.sourceUpdatedAt && (
                <span>
                  GitHub atualizado em {formatDateTime(dashboard.freshness.github.sourceUpdatedAt)}
                </span>
              )}
            </>
          )
        }
      />
      <CollapsibleFilterPanel
        activeCount={activeFilterCount}
        resultLabel={filterSummary || 'Todos os dados disponíveis'}
        className="indicator-filters"
      >
        {(activeFilterCount > 0 || draft.startDate || draft.endDate) && (
          <div className="planning-filter-panel__actions">
            <button type="button" className="sprint-filters__clear" onClick={clearFilters}>
              Limpar filtros
            </button>
          </div>
        )}
        <div
          id="dashboard-indicator-filters"
          className="dashboard-panel__filters"
          role="group"
          aria-label="Filtros de indicadores"
        >
          <fieldset className="dashboard-panel__period">
            <legend>Período</legend>
            <label className="sprint-filter">
              <span>De</span>
              <input
                type="date"
                value={draft.startDate}
                onChange={(event) => updateFilter('startDate', event.target.value)}
              />
            </label>
            <label className="sprint-filter">
              <span>Até</span>
              <input
                type="date"
                value={draft.endDate}
                min={draft.startDate || undefined}
                onChange={(event) => updateFilter('endDate', event.target.value)}
              />
            </label>
          </fieldset>
          <label className="sprint-filter">
            <span>Sprint</span>
            <SelectControl
              value={draft.sprintId}
              onChange={(event) => updateFilter('sprintId', event.target.value)}
            >
              <option value="">Seleção automática</option>
              {sprints.map((sprint) => (
                <option key={sprint.id} value={sprint.id}>
                  {sprint.name} · {labelForField(sprint.status)}
                </option>
              ))}
            </SelectControl>
          </label>
          {filterError && (
            <p role="alert" className="dashboard-panel__filter-error">
              {filterError}
            </p>
          )}
          {sprintState.projectId === projectId && sprintState.error && (
            <div className="dashboard-panel__filter-error" role="alert">
              <p>{sprintState.error}</p>
              <button type="button" onClick={() => setSprintRefresh((value) => value + 1)}>
                Recarregar Sprints
              </button>
            </div>
          )}
        </div>
      </CollapsibleFilterPanel>
      <div className="dashboard-panel__toolbar">
        <div
          className="internal-tabs dashboard-panel__tabs"
          role="tablist"
          aria-label="Visões de indicadores"
        >
          {DASHBOARD_VIEWS.map(([view, label], index) => (
            <button
              className={`internal-tab${selection.view === view ? ' internal-tab--active' : ''}`}
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
        <div className="dashboard-panel__toolbar-actions">
          <button
            type="button"
            className="dashboard-panel__refresh"
            aria-label="Atualizar indicadores"
            title="Atualizar indicadores"
            disabled={loading}
            onClick={() => setManualRefresh((value) => value + 1)}
          >
            <span
              aria-hidden="true"
              className={
                loading
                  ? 'dashboard-panel__refresh-icon dashboard-panel__refresh-icon--loading'
                  : 'dashboard-panel__refresh-icon'
              }
            >
              ↻
            </span>
          </button>
        </div>
      </div>

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
            {periodInProgress && (
              <p className="dashboard-panel__period-note" role="status">
                Período em andamento. Os indicadores consideram os dados disponíveis até o momento
                da consulta.
              </p>
            )}
            {visibleWarnings.length > 0 && (
              <div className="dashboard-panel__warnings" role="status">
                {visibleWarnings.map((warning, index) => (
                  <p key={`${warning.code}-${index}`}>
                    {WARNING_LABELS[warning.code] ?? 'Há uma limitação nesta visão.'}
                  </p>
                ))}
              </div>
            )}
            {view === 'GENERAL' && (
              <ProjectHealth health={dashboard.projectHealth} catalogById={catalogById} />
            )}
            {presentationSections(view, dashboard.sections)
              .filter((section) => section.indicators.length)
              .map((section) => {
                const counts = new Map();
                for (const indicator of section.indicators)
                  for (const code of presentationLimitations(indicator).filter(
                    (code) => !code.includes('FILTER_')
                  ))
                    counts.set(code, (counts.get(code) ?? 0) + 1);
                const sharedLimitations = [...counts]
                  .filter(([, count]) => count > 1)
                  .map(([code]) => code);
                const periodPrompt = dashboard.warnings?.some(
                  (warning) => warning.code === 'PERIOD_REQUIRED_FOR_EVENT_INDICATORS'
                );
                const suppressedLimitations = [
                  ...sharedLimitations,
                  ...visibleWarnings.map((warning) => warning.code),
                  ...(periodPrompt ? ['PERIOD_REQUIRED'] : []),
                  ...(periodInProgress ? ['PERIOD_NOT_COMPLETE'] : [])
                ];
                const sectionLimitations = sharedLimitations.filter(
                  (code) =>
                    code !== 'PERIOD_REQUIRED' &&
                    code !== 'PERIOD_NOT_COMPLETE' &&
                    !visibleWarnings.some((warning) => warning.code === code)
                );
                const sectionNotices = sectionLimitations.map(describeLimitation);
                const compact = section.indicators.filter((indicator) =>
                  ['kpi-compact', 'kpi-progress'].includes(indicatorVisualType(indicator))
                );
                const detailed = section.indicators.filter(
                  (indicator) =>
                    !['kpi-compact', 'kpi-progress'].includes(indicatorVisualType(indicator))
                );
                const renderIndicator = (indicator) => (
                  <IndicatorCard
                    key={indicator.metricId}
                    indicator={indicator}
                    metadata={catalogById.get(indicator.metricId)}
                    sharedLimitations={suppressedLimitations}
                  />
                );
                return (
                  <section
                    className={`dashboard-panel__section dashboard-panel__section--${section.id}${compact.length === 0 && detailed.length === 1 && detailed[0].kind === 'SERIES' && detailed[0].points?.length === 1 ? ' dashboard-panel__section--snapshot' : ''}`}
                    key={section.id}
                    aria-labelledby={`dashboard-section-${section.id}`}
                  >
                    <div className="dashboard-panel__section-heading">
                      <h3 id={`dashboard-section-${section.id}`}>
                        {SECTION_LABELS[section.id] ?? 'Indicadores complementares'}
                      </h3>
                    </div>
                    {sectionNotices.length > 0 && (
                      <div className="dashboard-panel__section-notice">
                        {[...new Set(sectionNotices)].map((notice) => (
                          <p key={notice}>{notice}</p>
                        ))}
                      </div>
                    )}
                    {compact.length > 0 && (
                      <div
                        className="dashboard-panel__metric-grid"
                        style={{
                          '--metric-columns-wide':
                            compact.length <= 4 ? compact.length : compact.length <= 6 ? 3 : 4,
                          '--metric-columns-medium': Math.min(compact.length, 3),
                          '--metric-columns-small': Math.min(compact.length, 2)
                        }}
                      >
                        {compact.map(renderIndicator)}
                      </div>
                    )}
                    {detailed.length > 0 && (
                      <div className="dashboard-panel__detail-grid">
                        {detailed.map(renderIndicator)}
                      </div>
                    )}
                  </section>
                );
              })}
          </>
        )}
      </div>
    </section>
  );
}
