import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { getProjectArtifacts } from '../index.js';
import { ProjectSectionNav, projectsApi } from '../../projects/index.js';
import { CollapsibleFilterPanel, SprintDialog } from '../../schedule/index.js';
import {
  compactParams,
  ContextualErrorPage,
  ErrorState,
  FeedbackRegion,
  GithubExternalAction,
  LoadingState,
  SelectControl,
  TraceFlowIcon,
  classifyPageError,
  getErrorRequestId,
  githubStateLabel,
  normalizeApiError,
  useAbortableRequest
} from '../../../shared/index.js';
import './RepositoryInfoScreen.css';

const AlertDetails = lazy(() =>
  import('../../traceability/index.js').then((module) => ({ default: module.AlertDetails }))
);

const emptyFilters = {
  type: '',
  branch: '',
  startDate: '',
  endDate: '',
  inconsistency: ''
};

const inconsistencyOptions = [
  ['', 'Todas'],
  ['OPEN', 'Sem tarefa vinculada (aberta)'],
  ['DISMISSED', 'Dispensadas'],
  ['RESOLVED', 'Resolvidas']
];

function filtersFromParams(params) {
  const type = params.get('tipo');
  const inconsistency = params.get('inconsistencia');
  return {
    ...emptyFilters,
    type: typeLabels[type] ? type : '',
    inconsistency: inconsistencyOptions.some(([value]) => value && value === inconsistency)
      ? inconsistency
      : ''
  };
}

function alertIdFromParams(params) {
  const value = params.get('alerta');
  return value && /^[1-9]\d{0,9}$/.test(value) ? Number(value) : null;
}

function formatDay(value) {
  return value ? new Intl.DateTimeFormat('pt-BR').format(new Date(value)) : '';
}

function inconsistencyText(inconsistency) {
  if (inconsistency.status === 'OPEN') return 'sem tarefa vinculada';
  if (inconsistency.status === 'DISMISSED')
    return `sem tarefa · dispensada em ${formatDay(inconsistency.dismissedAt)}`;
  return `inconsistência resolvida em ${formatDay(inconsistency.resolvedAt)}`;
}

function artifactReference(artifact, { capitalized = false } = {}) {
  const number = artifact.metadata?.number ? ` #${artifact.metadata.number}` : '';
  if (artifact.type !== 'issue') return `PR${number}`;
  return `${capitalized ? 'Issue' : 'issue'}${number}`;
}

const typeLabels = {
  commit: 'Commit',
  pull_request: 'Pull Request',
  issue: 'Issue'
};

function formatDate(value) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

function formatCompleteness(value) {
  return `${Number(value || 0).toLocaleString('pt-BR', {
    maximumFractionDigits: 2
  })}%`;
}

function getArtifactTypeLabel(type) {
  return typeLabels[type] || type;
}

function getArtifactStatus(artifact) {
  if (artifact.type === 'commit') {
    const branches = artifact.metadata?.branches || [];
    if (branches.length === 0) {
      return { primary: '-', secondary: 'Branches não informadas', title: '' };
    }
    return {
      primary:
        branches.length <= 2 ? branches.join(', ') : `${branches[0]} +${branches.length - 1}`,
      secondary: 'Branches',
      title: `Branches: ${branches.join(', ')}`
    };
  }

  const number = artifact.metadata?.number ? `#${artifact.metadata.number}` : null;
  const state = artifact.metadata?.state ? githubStateLabel(artifact.metadata.state) : null;
  const flow =
    artifact.type === 'pull_request' &&
    artifact.metadata?.sourceBranch &&
    artifact.metadata?.targetBranch
      ? `${artifact.metadata.sourceBranch} → ${artifact.metadata.targetBranch}`
      : null;
  return {
    primary: number && state ? `${number} · ${state}` : number || state || '-',
    secondary: flow || '',
    title: [number, state, flow].filter(Boolean).join(' · ')
  };
}

function artifactCountLabel(total) {
  return `${total} ${total === 1 ? 'artefato' : 'artefatos'}`;
}

function hasActiveFilters(filters) {
  return Boolean(
    filters.type || filters.branch || filters.startDate || filters.endDate || filters.inconsistency
  );
}

function isValidDate(value) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateFilters(filters) {
  if (!isValidDate(filters.startDate)) {
    return 'Data inicial inválida. Use o formato YYYY-MM-DD.';
  }

  if (!isValidDate(filters.endDate)) {
    return 'Data final inválida. Use o formato YYYY-MM-DD.';
  }

  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
    return 'A data inicial não pode ser posterior à data final.';
  }

  return '';
}

export function RepositoryInfoScreen() {
  const { projectId } = useParams();
  return <RepositoryInfoContent key={projectId} projectId={projectId} />;
}

function RepositoryInfoContent({ projectId }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { run: runArtifactsRequest, cancel: cancelArtifactsRequest } = useAbortableRequest();
  const { run: runProjectRequest } = useAbortableRequest();
  const projectRequest = useRef(null);
  const [initialFilters] = useState(() => filtersFromParams(searchParams));
  const filtersRef = useRef(initialFilters);
  const requestSequenceRef = useRef(0);
  const dialogReturnFocusRef = useRef(null);
  const catalogTitleRef = useRef(null);
  const [repositoryData, setRepositoryData] = useState(null);
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [dialog, setDialog] = useState(() => {
    const alertId = alertIdFromParams(searchParams);
    return alertId ? { alertId, title: 'Inconsistência' } : null;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pageError, setPageError] = useState(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);

  useEffect(
    () => () => {
      // StrictMode replays effects after aborting the first load. Its cancelled
      // promise cannot be reused by the next effect in the same mounted context.
      projectRequest.current = null;
    },
    []
  );

  // The keyed project context owns metadata; changing filters only cancels artifacts.
  const loadProject = useCallback(() => {
    if (!projectRequest.current) {
      const pending = runProjectRequest((signal) => projectsApi.get(projectId, { signal })).catch(
        (requestError) => {
          if (projectRequest.current === pending) projectRequest.current = null;
          throw requestError;
        }
      );
      projectRequest.current = pending;
    }
    return projectRequest.current;
  }, [projectId, runProjectRequest]);

  const loadArtifacts = useCallback(
    async (nextFilters = emptyFilters) => {
      const requestSequence = ++requestSequenceRef.current;
      const validationError = validateFilters(nextFilters);
      if (validationError) {
        cancelArtifactsRequest();
        setLoading(false);
        setError(validationError);
        setPageError(null);
        setRetryAfterSeconds(0);
        return;
      }

      const requestParams = compactParams(nextFilters);
      setLoading(true);
      setError('');
      setPageError(null);
      setRetryAfterSeconds(0);

      try {
        const data = await runArtifactsRequest(async (signal) => {
          const [artifactsData, projectResponse] = await Promise.all([
            getProjectArtifacts(projectId, requestParams, { signal }),
            loadProject()
          ]);
          return {
            ...artifactsData,
            project: projectResponse.data.project
          };
        });
        if (!data || requestSequence !== requestSequenceRef.current) return;
        setRepositoryData(data);
        setAppliedFilters({ ...emptyFilters, ...nextFilters });
      } catch (requestError) {
        if (requestSequence !== requestSequenceRef.current) return;
        setRepositoryData(null);
        const normalized = normalizeApiError(
          requestError,
          'Não foi possível carregar os artefatos do repositório.'
        );
        setError(normalized.message);
        setPageError(normalized);
        setRetryAfterSeconds(normalized.retryAfterSeconds || 0);
      } finally {
        if (requestSequence === requestSequenceRef.current) setLoading(false);
      }
    },
    [cancelArtifactsRequest, projectId, runArtifactsRequest, loadProject]
  );

  useEffect(() => {
    loadArtifacts(filtersRef.current);
  }, [loadArtifacts]);

  const typeParam = searchParams.get('tipo');
  const inconsistencyParam = searchParams.get('inconsistencia');
  const alertParam = searchParams.get('alerta');
  const paramsRef = useRef({ typeParam, inconsistencyParam, alertParam });
  useEffect(() => {
    const previous = paramsRef.current;
    paramsRef.current = { typeParam, inconsistencyParam, alertParam };
    if (previous.typeParam !== typeParam || previous.inconsistencyParam !== inconsistencyParam) {
      const fromParams = filtersFromParams(searchParams);
      const next = {
        ...filtersRef.current,
        type: fromParams.type,
        inconsistency: fromParams.inconsistency
      };
      filtersRef.current = next;
      setFilters(next);
      void loadArtifacts(next);
    }
    if (previous.alertParam !== alertParam) {
      const alertId = alertIdFromParams(searchParams);
      if (alertId) {
        dialogReturnFocusRef.current = null;
        setDialog({ alertId, title: 'Inconsistência' });
      }
    }
  }, [alertParam, inconsistencyParam, loadArtifacts, searchParams, typeParam]);

  function openInconsistency(artifact, trigger) {
    dialogReturnFocusRef.current = trigger;
    setDialog({
      alertId: artifact.inconsistency.alertId,
      title: 'Inconsistência'
    });
  }

  function closeInconsistency() {
    setDialog(null);
    if (!dialogReturnFocusRef.current) catalogTitleRef.current?.focus();
    if (searchParams.has('alerta')) {
      const next = new URLSearchParams(searchParams);
      next.delete('alerta');
      setSearchParams(next, { replace: true });
    }
  }

  function forgetStaleParams(nextFilters) {
    const params = new URLSearchParams(searchParams);
    for (const [param, field] of [
      ['tipo', 'type'],
      ['inconsistencia', 'inconsistency']
    ]) {
      if (params.has(param) && params.get(param) !== nextFilters[field]) {
        if (nextFilters[field]) params.set(param, nextFilters[field]);
        else params.delete(param);
      }
    }
    if (params.toString() === searchParams.toString()) return;
    paramsRef.current = {
      ...paramsRef.current,
      typeParam: params.get('tipo'),
      inconsistencyParam: params.get('inconsistencia')
    };
    setSearchParams(params, { replace: true });
  }

  function handleFilterChange(name, value) {
    const nextFilters = {
      ...filtersRef.current,
      [name]: value
    };
    filtersRef.current = nextFilters;
    setFilters(nextFilters);
    forgetStaleParams(nextFilters);
    void loadArtifacts(nextFilters);
  }

  function clearFilters() {
    filtersRef.current = emptyFilters;
    setFilters(emptyFilters);
    forgetStaleParams(emptyFilters);
    void loadArtifacts(emptyFilters);
  }

  const project = repositoryData?.project;
  const repository = repositoryData?.repository || { branches: [] };
  const summary = repositoryData?.summary || {};
  const artifacts = repositoryData?.artifacts || [];
  const showFilteredEmptyState = hasActiveFilters(appliedFilters);
  const activeFilterCount = Object.values(appliedFilters).filter(Boolean).length;

  if (!loading && !repositoryData && pageError) {
    return (
      <ContextualErrorPage
        type={classifyPageError(pageError)}
        description={pageError.message}
        requestId={getErrorRequestId(pageError)}
        retryAfterSeconds={pageError.retryAfterSeconds}
        onRetry={() => loadArtifacts(appliedFilters)}
      />
    );
  }

  return (
    <main className="page-container repository-page">
      <div className="repository-content">
        <header className="page-header repository-header">
          <div>
            <span className="eyebrow">Repositório</span>
            <h1>Repositório</h1>
            <p>
              Consulte os artefatos importados do GitHub para{' '}
              {project ? `o projeto ${project.name}` : 'este projeto'}.
            </p>
          </div>
        </header>
        <ProjectSectionNav projectId={projectId} activeSection="repository" />

        {!repositoryData && loading ? (
          <LoadingState message="Carregando artefatos do repositório..." />
        ) : repositoryData ? (
          <>
            {project.githubIntegration?.lastSyncStatus === 'FALHA' && (
              <FeedbackRegion warning="A última sincronização falhou. Os artefatos já importados continuam disponíveis." />
            )}
            <section className="repository-overview" aria-labelledby="repository-summary-title">
              <header>
                <div>
                  <span className="eyebrow">Resumo</span>
                  <h2 id="repository-summary-title">Visão geral do repositório</h2>
                </div>
                <div className="repository-overview__context">
                  <p>Estado atual dos artefatos importados do GitHub.</p>
                  {repository.defaultBranch && (
                    <span>Branch padrão: {repository.defaultBranch}</span>
                  )}
                </div>
              </header>
              <dl>
                {[
                  ['Branches', repository.branches?.length ?? 0],
                  ['Commits', summary.commits ?? 0],
                  ['Pull Requests', summary.pullRequests ?? 0],
                  ['Issues', summary.issues ?? 0],
                  [
                    'Completude',
                    summary.total > 0
                      ? formatCompleteness(summary.metadataCompletenessPercentage)
                      : 'Sem dados'
                  ]
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{project.githubIntegration ? value : 'Não disponível'}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <CollapsibleFilterPanel
              onClear={clearFilters}
              canClear={activeFilterCount > 0}
              clearDisabled={loading || !project.githubIntegration}
              id="repository-filters"
              className="repository-filters"
              title="Buscar e filtrar"
              resultLabel={
                project.githubIntegration
                  ? artifactCountLabel(summary.total ?? artifacts.length)
                  : 'Aguardando integração'
              }
              activeCount={activeFilterCount}
            >
              <fieldset className="repository-filter-form" disabled={!project.githubIntegration}>
                <div className="repository-filter-grid">
                  <label className="repository-filter-field">
                    <span>Inconsistência</span>
                    <SelectControl
                      value={filters.inconsistency}
                      onChange={(event) => handleFilterChange('inconsistency', event.target.value)}
                    >
                      {inconsistencyOptions.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </SelectControl>
                  </label>

                  <label className="repository-filter-field">
                    <span>Tipo de artefato</span>
                    <SelectControl
                      value={filters.type}
                      onChange={(event) => handleFilterChange('type', event.target.value)}
                    >
                      <option value="">Todos</option>
                      <option value="commit">Commits</option>
                      <option value="pull_request">Pull Requests</option>
                      <option value="issue">Issues</option>
                    </SelectControl>
                  </label>

                  <label className="repository-filter-field">
                    <span>Branch</span>
                    <SelectControl
                      value={filters.branch}
                      onChange={(event) => handleFilterChange('branch', event.target.value)}
                    >
                      <option value="">Todas as branches</option>
                      {(repository.branches || []).map((branch) => (
                        <option key={branch.name} value={branch.name}>
                          {branch.name}
                          {branch.isDefault ? ' — padrão' : ''}
                        </option>
                      ))}
                    </SelectControl>
                  </label>

                  <label className="repository-filter-field">
                    <span>Data inicial</span>
                    <input
                      type="date"
                      value={filters.startDate}
                      onChange={(event) => handleFilterChange('startDate', event.target.value)}
                    />
                  </label>

                  <label className="repository-filter-field">
                    <span>Data final</span>
                    <input
                      type="date"
                      value={filters.endDate}
                      onChange={(event) => handleFilterChange('endDate', event.target.value)}
                    />
                  </label>
                </div>

                {filters.type === 'issue' && filters.branch && (
                  <FeedbackRegion info="Issues pertencem ao repositório como um todo; o filtro de branch não se aplica a elas." />
                )}
              </fieldset>
            </CollapsibleFilterPanel>

            {loading ? (
              <LoadingState message="Carregando artefatos do repositório..." />
            ) : error ? (
              <ErrorState
                message={error}
                onRetry={() => loadArtifacts(filters)}
                retryAfterSeconds={retryAfterSeconds}
              />
            ) : (
              <section className="repository-catalog" aria-labelledby="repository-catalog-title">
                <header>
                  <h2 id="repository-catalog-title" ref={catalogTitleRef} tabIndex={-1}>
                    Artefatos do repositório
                  </h2>
                  <span aria-live="polite">
                    {project.githubIntegration
                      ? artifactCountLabel(summary.total ?? artifacts.length)
                      : 'Aguardando integração'}
                    {showFilteredEmptyState ? ' no conjunto filtrado' : ''}
                  </span>
                </header>

                {!project.githubIntegration ? (
                  <div
                    className="repository-empty-state"
                    aria-labelledby="repository-disconnected-title"
                  >
                    <h3 id="repository-disconnected-title">Nenhum repositório conectado</h3>
                    <p>Este projeto ainda não possui integração com o GitHub.</p>
                  </div>
                ) : artifacts.length === 0 ? (
                  <div className="repository-empty-state">
                    <h3>
                      {appliedFilters.inconsistency === 'OPEN'
                        ? 'Nenhuma PR ou issue sem tarefa vinculada.'
                        : showFilteredEmptyState
                          ? 'Nenhum artefato encontrado para estes filtros.'
                          : 'Nenhum artefato importado.'}
                    </h3>
                    <p>
                      {showFilteredEmptyState
                        ? 'Ajuste os critérios ou limpe os filtros para consultar outros artefatos.'
                        : 'Os commits, pull requests e issues aparecerão aqui após a sincronização do repositório.'}
                    </p>
                    {showFilteredEmptyState && (
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={clearFilters}
                      >
                        Limpar filtros
                      </button>
                    )}
                  </div>
                ) : (
                  <div
                    className="repository-table-scroll"
                    tabIndex="0"
                    role="region"
                    aria-label="Tabela de artefatos do repositório com rolagem horizontal"
                  >
                    <table className="repository-table">
                      <thead>
                        <tr>
                          <th>Tipo</th>
                          <th>Título</th>
                          <th>Autor</th>
                          <th>Data</th>
                          <th>Estado/Número</th>
                          <th>Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {artifacts.map((artifact) => {
                          const status = getArtifactStatus(artifact);
                          return (
                            <tr key={`${artifact.type}-${artifact.id}`}>
                              <td>
                                <span
                                  className={`repository-badge repository-badge-${artifact.type}`}
                                >
                                  {getArtifactTypeLabel(artifact.type)}
                                </span>
                              </td>
                              <td>
                                <span
                                  className="repository-artifact-title"
                                  title={artifact.title || undefined}
                                >
                                  {artifact.title || '-'}
                                </span>
                              </td>
                              <td>{artifact.author || '-'}</td>
                              <td className="repository-artifact-date">
                                {formatDate(artifact.date)}
                              </td>
                              <td>
                                <span
                                  className="repository-artifact-status"
                                  title={status.title || undefined}
                                >
                                  <strong>{status.primary}</strong>
                                  {status.secondary && <small>{status.secondary}</small>}
                                  {artifact.inconsistency && (
                                    <small
                                      className={
                                        artifact.inconsistency.status === 'OPEN'
                                          ? 'repository-artifact-gap'
                                          : 'repository-artifact-gap repository-artifact-gap--past'
                                      }
                                    >
                                      {artifact.inconsistency.status === 'OPEN' && (
                                        <TraceFlowIcon name="alert" />
                                      )}
                                      {inconsistencyText(artifact.inconsistency)}
                                    </small>
                                  )}
                                </span>
                              </td>
                              <td>
                                <div className="repository-artifact-actions">
                                  {artifact.inconsistency && (
                                    <button
                                      type="button"
                                      className="button button-secondary button-compact"
                                      aria-label={`Ver inconsistência da ${artifactReference(artifact)}`}
                                      onClick={(event) =>
                                        openInconsistency(artifact, event.currentTarget)
                                      }
                                    >
                                      Ver inconsistência
                                    </button>
                                  )}
                                  {artifact.githubUrl ? (
                                    <GithubExternalAction href={artifact.githubUrl} />
                                  ) : (
                                    <span className="repository-artifact-unavailable">—</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
          </>
        ) : null}
      </div>
      <SprintDialog
        open={Boolean(dialog)}
        title={dialog?.title || 'Inconsistência'}
        className="trace-alert-dialog"
        onClose={closeInconsistency}
        returnFocusRef={dialogReturnFocusRef}
      >
        {dialog && (
          <Suspense fallback={<LoadingState message="Carregando inconsistência..." />}>
            <AlertDetails
              key={dialog.alertId}
              projectId={projectId}
              alertId={dialog.alertId}
              onChanged={() => void loadArtifacts(filtersRef.current)}
            />
          </Suspense>
        )}
      </SprintDialog>
    </main>
  );
}
