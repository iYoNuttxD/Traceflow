import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getProjectArtifacts } from '../index.js';
import { ProjectSectionNav } from '../../projects/index.js';
import { compactParams, ErrorState, LoadingState, useAbortableRequest } from '../../../shared/index.js';

const emptyFilters = {
  type: '',
  startDate: '',
  endDate: ''
};

const typeLabels = {
  commit: 'Commit',
  pull_request: 'Pull Request',
  issue: 'Issue'
};

function getErrorMessage(error, fallback) {
  return error.response?.data?.message || fallback;
}

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
    return artifact.metadata?.branch ? `Branch: ${artifact.metadata.branch}` : '-';
  }

  const number = artifact.metadata?.number ? `#${artifact.metadata.number}` : null;
  const state = artifact.metadata?.state || null;

  if (number && state) {
    return `${number} - ${state}`;
  }

  return number || state || '-';
}

function hasActiveFilters(filters) {
  return Boolean(filters.type || filters.startDate || filters.endDate);
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
  const [repositoryData, setRepositoryData] = useState(null);
  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadArtifacts = useCallback(
    async (nextFilters = emptyFilters) => {
      const validationError = validateFilters(nextFilters);
      if (validationError) {
        cancelArtifactsRequest();
        setLoading(false);
        setError(validationError);
        return;
      }

      const requestParams = compactParams(nextFilters);
      setLoading(true);
      setError('');
      let settled = false;

      try {
        const data = await runArtifactsRequest((signal) => getProjectArtifacts(projectId, requestParams, { signal }));
        if (!data) return;
        settled = true;
        setRepositoryData(data);
        setAppliedFilters({ ...emptyFilters, ...nextFilters });
      } catch (requestError) {
        settled = true;
        setRepositoryData(null);
        setError(
          getErrorMessage(
            requestError,
            'Não foi possível carregar os artefatos do repositório.'
          )
        );
      } finally {
        if (settled) setLoading(false);
      }
    },
    [cancelArtifactsRequest, projectId, runArtifactsRequest]
  );

  useEffect(() => {
    loadArtifacts(emptyFilters);
  }, [loadArtifacts]);

  function handleFilterChange(name, value) {
    cancelArtifactsRequest();
    setLoading(false);
    setFilters((current) => ({
      ...current,
      [name]: value
    }));
  }

  async function handleFilterSubmit(event) {
    event.preventDefault();
    await loadArtifacts(filters);
  }

  async function clearFilters() {
    setFilters(emptyFilters);
    await loadArtifacts(emptyFilters);
  }

  const project = repositoryData?.project;
  const summary = repositoryData?.summary || {};
  const artifacts = repositoryData?.artifacts || [];
  const showFilteredEmptyState = hasActiveFilters(appliedFilters);

  return (
    <main className="page-container repository-page">
      <Link className="back-link" to={`/projects/${projectId}`}>
        Voltar para o projeto
      </Link>

      <header className="page-header repository-header">
        <div>
          <span className="eyebrow">Projeto #{projectId}</span>
          <h1>Informações do Repositório</h1>
          <p>
            {project
              ? `Visualize commits, pull requests e issues importados do GitHub para ${project.name}.`
              : 'Visualize commits, pull requests e issues importados do GitHub para este projeto.'}
          </p>
        </div>
        <ProjectSectionNav projectId={projectId} activeSection="repository" />
      </header>

      <form className="repository-filters" onSubmit={handleFilterSubmit}>
        <label className="field">
          <span>Tipo de artefato</span>
          <select
            value={filters.type}
            onChange={(event) => handleFilterChange('type', event.target.value)}
          >
            <option value="">Todos</option>
            <option value="commit">Commits</option>
            <option value="pull_request">Pull Requests</option>
            <option value="issue">Issues</option>
          </select>
        </label>

        <label className="field">
          <span>Data inicial</span>
          <input
            type="date"
            value={filters.startDate}
            onChange={(event) => handleFilterChange('startDate', event.target.value)}
          />
        </label>

        <label className="field">
          <span>Data final</span>
          <input
            type="date"
            value={filters.endDate}
            onChange={(event) => handleFilterChange('endDate', event.target.value)}
          />
        </label>

        <div className="repository-filter-actions">
          <button className="button button-primary" type="submit" disabled={loading}>
            Aplicar filtros
          </button>
          <button className="button button-secondary" type="button" onClick={clearFilters} disabled={loading}>
            Limpar filtros
          </button>
        </div>
      </form>

      {loading ? (
        <LoadingState message="Carregando artefatos do repositório..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => loadArtifacts(filters)} />
      ) : (
        <>
          <section className="repository-summary">
            <article className="repository-summary-card">
              <span>Total de artefatos</span>
              <strong>{summary.total ?? 0}</strong>
            </article>
            <article className="repository-summary-card">
              <span>Commits</span>
              <strong>{summary.commits ?? 0}</strong>
            </article>
            <article className="repository-summary-card">
              <span>Pull Requests</span>
              <strong>{summary.pullRequests ?? 0}</strong>
            </article>
            <article className="repository-summary-card">
              <span>Issues</span>
              <strong>{summary.issues ?? 0}</strong>
            </article>
            <article className="repository-summary-card">
              <span>Completude</span>
              <strong>{formatCompleteness(summary.metadataCompletenessPercentage)}</strong>
            </article>
          </section>

          {artifacts.length === 0 ? (
            <p className="repository-empty empty-state">
              {showFilteredEmptyState
                ? 'Nenhum artefato encontrado para os filtros selecionados.'
                : 'Nenhum artefato GitHub foi importado para este projeto.'}
            </p>
          ) : (
            <div className="repository-table-wrapper">
              <table className="repository-table">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Título</th>
                    <th>Autor</th>
                    <th>Data</th>
                    <th>Estado/Número</th>
                    <th>Link</th>
                  </tr>
                </thead>
                <tbody>
                  {artifacts.map((artifact) => (
                    <tr key={`${artifact.type}-${artifact.id}`}>
                      <td data-label="Tipo">
                        <span className={`repository-badge repository-badge-${artifact.type}`}>
                          {getArtifactTypeLabel(artifact.type)}
                        </span>
                      </td>
                      <td data-label="Título">{artifact.title || '-'}</td>
                      <td data-label="Autor">{artifact.author || '-'}</td>
                      <td data-label="Data">{formatDate(artifact.date)}</td>
                      <td data-label="Estado/Número">{getArtifactStatus(artifact)}</td>
                      <td data-label="Link">
                        {artifact.githubUrl ? (
                          <a href={artifact.githubUrl} target="_blank" rel="noopener noreferrer">
                            Abrir no GitHub
                          </a>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}
