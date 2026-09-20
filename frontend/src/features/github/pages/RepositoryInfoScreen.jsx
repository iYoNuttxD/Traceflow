import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { getProjectArtifacts } from '../index.js';
import { ProjectSectionNav } from '../../projects/index.js';
import { CollapsibleFilterPanel } from '../../schedule/index.js';
import {
  compactParams,
  ContextualErrorPage,
  ErrorState,
  FeedbackRegion,
  GithubExternalAction,
  LoadingState,
  SelectControl,
  classifyPageError,
  getErrorRequestId,
  normalizeApiError,
  useAbortableRequest
} from '../../../shared/index.js';
import './RepositoryInfoScreen.css';

const emptyFilters = {
  type: '',
  branch: '',
  startDate: '',
  endDate: ''
};

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
  const state = artifact.metadata?.state || null;
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
  return Boolean(filters.type || filters.branch || filters.startDate || filters.endDate);
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
  const { run: runArtifactsRequest, cancel: cancelArtifactsRequest } = useAbortableRequest();
  const filtersRef = useRef(emptyFilters);
  const requestSequenceRef = useRef(0);
  const [repositoryData, setRepositoryData] = useState(null);
  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pageError, setPageError] = useState(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);

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
        const data = await runArtifactsRequest((signal) =>
          getProjectArtifacts(projectId, requestParams, { signal })
        );
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
    [cancelArtifactsRequest, projectId, runArtifactsRequest]
  );

  useEffect(() => {
    loadArtifacts(emptyFilters);
  }, [loadArtifacts]);

  function handleFilterChange(name, value) {
    const nextFilters = {
      ...filtersRef.current,
      [name]: value
    };
    filtersRef.current = nextFilters;
    setFilters(nextFilters);
    void loadArtifacts(nextFilters);
  }

  function clearFilters() {
    filtersRef.current = emptyFilters;
    setFilters(emptyFilters);
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
          <ProjectSectionNav projectId={projectId} activeSection="repository" />
        </header>

        {!repositoryData && loading ? (
          <LoadingState message="Carregando artefatos do repositório..." />
        ) : repositoryData ? (
          <>
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
                  ['Completude', formatCompleteness(summary.metadataCompletenessPercentage)]
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <CollapsibleFilterPanel
              id="repository-filters"
              className="repository-filters"
              title="Filtrar artefatos"
              resultLabel={artifactCountLabel(summary.total ?? artifacts.length)}
              activeCount={activeFilterCount}
            >
              <div className="repository-filter-form">
                {activeFilterCount > 0 && (
                  <div className="planning-filter-panel__actions repository-filter-actions">
                    <button
                      className="button button-secondary button-compact"
                      type="button"
                      onClick={clearFilters}
                      disabled={loading}
                    >
                      Limpar filtros
                    </button>
                  </div>
                )}
                <div className="repository-filter-grid">
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
              </div>
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
                  <h2 id="repository-catalog-title">Artefatos do repositório</h2>
                  <span aria-live="polite">
                    {artifactCountLabel(summary.total ?? artifacts.length)}
                    {showFilteredEmptyState ? ' no conjunto filtrado' : ''}
                  </span>
                </header>

                {artifacts.length === 0 ? (
                  <div className="repository-empty-state">
                    <h3>
                      {showFilteredEmptyState
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
                                </span>
                              </td>
                              <td>
                                {artifact.githubUrl ? (
                                  <GithubExternalAction href={artifact.githubUrl} />
                                ) : (
                                  <span className="repository-artifact-unavailable">—</span>
                                )}
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
    </main>
  );
}
