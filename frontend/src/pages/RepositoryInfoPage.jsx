import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getProjectArtifacts } from '../api/api.js';
import { ProjectSectionNav } from '../components/ProjectSectionNav.jsx';

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

export function RepositoryInfoPage() {
  const { projectId } = useParams();
  const [repositoryData, setRepositoryData] = useState(null);
  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadArtifacts = useCallback(
    async (nextFilters = emptyFilters) => {
      setLoading(true);
      setError('');

      try {
        const data = await getProjectArtifacts(projectId, nextFilters);
        setRepositoryData(data);
        setAppliedFilters(nextFilters);
      } catch (requestError) {
        setRepositoryData(null);
        setError(
          getErrorMessage(
            requestError,
            'Não foi possível carregar os artefatos do repositório.'
          )
        );
      } finally {
        setLoading(false);
      }
    },
    [projectId]
  );

  useEffect(() => {
    loadArtifacts(emptyFilters);
  }, [loadArtifacts]);

  function handleFilterChange(name, value) {
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
  const shouldShowContent = !error || repositoryData;

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

      {error && <div className="message message-error">{error}</div>}

      {loading ? (
        <p className="empty-state">Carregando artefatos do repositório...</p>
      ) : shouldShowContent ? (
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
              <button className="button button-primary" type="submit">
                Aplicar filtros
              </button>
              <button className="button button-secondary" type="button" onClick={clearFilters}>
                Limpar filtros
              </button>
            </div>
          </form>

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
                          <a href={artifact.githubUrl} target="_blank" rel="noreferrer">
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
      ) : (
        <Link className="text-link" to={`/projects/${projectId}`}>
          Voltar para detalhes do projeto
        </Link>
      )}
    </main>
  );
}
