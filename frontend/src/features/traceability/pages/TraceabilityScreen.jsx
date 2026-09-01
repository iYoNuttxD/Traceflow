import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  getRequirementTraceability,
  getRequirementsTraceabilityMatrix
} from '../api/traceability.api.js';
import {
  Card,
  ContextualErrorPage,
  ErrorState,
  LoadingState,
  classifyPageError,
  getErrorRequestId,
  normalizeApiError,
  useAbortableRequest
} from '../../../shared/index.js';
import { ProjectSectionNav } from '../../projects/index.js';
import { TraceabilityFlow } from '../components/TraceabilityFlow.jsx';
import './TraceabilityScreen.css';

const requirementStatusLabels = {
  CADASTRADO: 'Cadastrado',
  APROVADO: 'Aprovado',
  EM_IMPLEMENTACAO: 'Em implementação',
  VALIDADO: 'Validado',
  CONCLUIDO: 'Concluído',
  PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em andamento',
  CANCELADO: 'Cancelado'
};

const implementationStatusLabels = {
  SEM_RASTREABILIDADE: 'Sem rastreabilidade',
  PLANEJADO: 'Planejado',
  EM_DESENVOLVIMENTO: 'Em desenvolvimento',
  IMPLEMENTADO: 'Implementado',
  CONCLUIDO: 'Concluído'
};

function getErrorMessage(error, fallback) {
  return normalizeApiError(error, fallback).message;
}

function formatPercentage(metric) {
  const percentage = metric?.percentage;
  if (percentage == null) return 'Sem dados';
  return `${Number(percentage).toLocaleString('pt-BR', {
    maximumFractionDigits: 2
  })}%`;
}

function formatRequirementStatus(status) {
  return requirementStatusLabels[status] || status || 'Não informado';
}

function formatImplementationStatus(status) {
  return implementationStatusLabels[status] || status || 'Não informado';
}

export function TraceabilityScreen() {
  const { projectId } = useParams();
  const { run: runMatrixRequest } = useAbortableRequest();
  const { run: runRequirementRequest } = useAbortableRequest();
  const [matrixData, setMatrixData] = useState(null);
  const [selectedRequirementId, setSelectedRequirementId] = useState(null);
  const [requirementTraceability, setRequirementTraceability] = useState(null);
  const [loadingMatrix, setLoadingMatrix] = useState(true);
  const [loadingRequirement, setLoadingRequirement] = useState(false);
  const [matrixError, setMatrixError] = useState(null);
  const [requirementError, setRequirementError] = useState('');
  const [page, setPage] = useState(1);

  const loadMatrix = useCallback(async () => {
    setLoadingMatrix(true);
    setMatrixError(null);
    let settled = false;

    try {
      const data = await runMatrixRequest((signal) =>
        getRequirementsTraceabilityMatrix(projectId, { page, limit: 20 }, { signal })
      );
      if (!data) return;
      settled = true;
      setMatrixData(data);
    } catch (requestError) {
      settled = true;
      setMatrixData(null);
      setMatrixError(
        normalizeApiError(requestError, 'Não foi possível carregar a matriz de rastreabilidade.')
      );
    } finally {
      if (settled) setLoadingMatrix(false);
    }
  }, [page, projectId, runMatrixRequest]);

  useEffect(() => {
    loadMatrix();
  }, [loadMatrix]);

  async function handleSelectRequirement(requirementId) {
    setSelectedRequirementId(requirementId);
    setRequirementTraceability(null);
    setRequirementError('');
    setLoadingRequirement(true);
    let settled = false;

    try {
      const data = await runRequirementRequest((signal) =>
        getRequirementTraceability(projectId, requirementId, {}, { signal })
      );
      if (!data) return;
      settled = true;
      setRequirementTraceability(data);
    } catch (requestError) {
      settled = true;
      setRequirementError(
        getErrorMessage(
          requestError,
          'Não foi possível carregar a cadeia de rastreabilidade do requisito.'
        )
      );
    } finally {
      if (settled) setLoadingRequirement(false);
    }
  }

  const summary = matrixData?.summary || {};
  const requirements = matrixData?.requirements || [];
  const pagination = matrixData?.pagination || {};

  if (!loadingMatrix && !matrixData && matrixError) {
    return (
      <ContextualErrorPage
        type={classifyPageError(matrixError)}
        description={matrixError.message}
        requestId={getErrorRequestId(matrixError)}
        retryAfterSeconds={matrixError.retryAfterSeconds}
        onRetry={loadMatrix}
      />
    );
  }

  return (
    <main className="page-container traceability-page">
      <Link className="back-link" to={`/projects/${projectId}`}>
        Voltar para o projeto
      </Link>

      <header className="page-header">
        <div>
          <span className="eyebrow">Projeto #{projectId}</span>
          <h1>Rastreabilidade</h1>
          <p>Acompanhe a evolução dos requisitos, tarefas e evidências técnicas do projeto.</p>
        </div>
        <ProjectSectionNav projectId={projectId} activeSection="traceability" />
      </header>

      {loadingMatrix ? (
        <LoadingState message="Carregando rastreabilidade..." />
      ) : matrixError ? (
        <ErrorState
          message={matrixError.message}
          onRetry={loadMatrix}
          retryAfterSeconds={matrixError.retryAfterSeconds}
        />
      ) : requirements.length === 0 ? (
        <Card title="Matriz de rastreabilidade">
          <p className="empty-state">Nenhum requisito cadastrado para este projeto.</p>
        </Card>
      ) : (
        <>
          <section className="traceability-summary-grid">
            <Card title="Total de requisitos">
              <strong className="metric-value">{summary.totalRequirements ?? 0}</strong>
            </Card>
            <Card title="Com tarefas">
              <strong className="metric-value">{summary.requirementsWithTasks ?? 0}</strong>
            </Card>
            <Card title="Com evidência técnica">
              <strong className="metric-value">
                {summary.requirementsWithTechnicalEvidence ?? 0}
              </strong>
            </Card>
            <Card title="Implementados">
              <strong className="metric-value">{summary.implementedRequirements ?? 0}</strong>
            </Card>
            <Card title="Progresso médio">
              <strong className="metric-value">{formatPercentage(summary.averageProgress)}</strong>
            </Card>
          </section>

          <Card title="Matriz de rastreabilidade dos requisitos">
            <div className="traceability-table-wrapper">
              <table className="traceability-table">
                <thead>
                  <tr>
                    <th>Requisito</th>
                    <th>Status</th>
                    <th>Progresso</th>
                    <th>Tarefas</th>
                    <th>Issues</th>
                    <th>PRs</th>
                    <th>Commits</th>
                    <th>Evidência</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {requirements.map((requirement) => {
                    const isSelected = selectedRequirementId === requirement.id;

                    return (
                      <tr
                        className={isSelected ? 'traceability-row-selected' : ''}
                        key={requirement.id}
                        onClick={() => handleSelectRequirement(requirement.id)}
                      >
                        <td>
                          <button className="traceability-row-button" type="button">
                            <strong>{requirement.title}</strong>
                            {requirement.description && <span>{requirement.description}</span>}
                          </button>
                        </td>
                        <td>{formatRequirementStatus(requirement.status)}</td>
                        <td>
                          <div className="traceability-progress">
                            <span>{formatPercentage(requirement.progress)}</span>
                            <div className="traceability-progress-bar">
                              <span
                                style={{
                                  width: `${Math.min(
                                    Number(requirement.progress?.percentage ?? 0),
                                    100
                                  )}%`
                                }}
                              />
                            </div>
                          </div>
                        </td>
                        <td>
                          {requirement.completedTasksCount}/{requirement.tasksCount}
                        </td>
                        <td>{requirement.issuesCount}</td>
                        <td>{requirement.pullRequestsCount}</td>
                        <td>{requirement.commitsCount}</td>
                        <td>
                          <span
                            className={`status-badge ${
                              requirement.hasTechnicalEvidence ? 'status-ativo' : 'status-pendente'
                            }`}
                          >
                            {requirement.hasTechnicalEvidence ? 'Com evidência' : 'Sem evidência'}
                          </span>
                        </td>
                        <td>{formatImplementationStatus(requirement.implementationStatus)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {pagination.totalPages > 1 && (
            <nav className="pagination-controls" aria-label="Paginação da matriz">
              <button
                className="button button-secondary"
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                Anterior
              </button>
              <span>
                Página {pagination.page} de {pagination.totalPages}
              </span>
              <button
                className="button button-secondary"
                type="button"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                Próxima
              </button>
            </nav>
          )}

          <Card title="Fluxograma de rastreabilidade">
            <section className="traceability-flow-placeholder">
              {loadingRequirement && (
                <p className="empty-state">Carregando requisito selecionado...</p>
              )}

              {requirementError && <div className="message message-error">{requirementError}</div>}

              {!selectedRequirementId && !loadingRequirement && (
                <p className="empty-state">
                  Selecione um requisito na matriz para visualizar sua cadeia rastreável.
                </p>
              )}

              {selectedRequirementId &&
                !loadingRequirement &&
                !requirementTraceability &&
                !requirementError && (
                  <p className="empty-state">
                    Nenhum dado de rastreabilidade foi carregado para este requisito.
                  </p>
                )}

              {requirementTraceability && !loadingRequirement && (
                <TraceabilityFlow traceability={requirementTraceability} />
              )}
            </section>
          </Card>
        </>
      )}
    </main>
  );
}
