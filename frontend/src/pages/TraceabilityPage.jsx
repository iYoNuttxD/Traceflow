import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getRequirementTraceability,
  getRequirementsTraceabilityMatrix
} from '../api/api.js';
import { Card } from '../components/Card.jsx';
import { ProjectSectionNav } from '../components/ProjectSectionNav.jsx';
import { TraceabilityFlow } from '../components/TraceabilityFlow.jsx';

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
  return error.response?.data?.message || fallback;
}

function formatPercentage(value) {
  return `${Number(value || 0).toLocaleString('pt-BR', {
    maximumFractionDigits: 2
  })}%`;
}

function formatRequirementStatus(status) {
  return requirementStatusLabels[status] || status || 'Não informado';
}

function formatImplementationStatus(status) {
  return implementationStatusLabels[status] || status || 'Não informado';
}

export function TraceabilityPage() {
  const { projectId } = useParams();
  const [matrixData, setMatrixData] = useState(null);
  const [selectedRequirementId, setSelectedRequirementId] = useState(null);
  const [requirementTraceability, setRequirementTraceability] = useState(null);
  const [loadingMatrix, setLoadingMatrix] = useState(true);
  const [loadingRequirement, setLoadingRequirement] = useState(false);
  const [matrixError, setMatrixError] = useState('');
  const [requirementError, setRequirementError] = useState('');

  const loadMatrix = useCallback(async () => {
    setLoadingMatrix(true);
    setMatrixError('');

    try {
      const data = await getRequirementsTraceabilityMatrix(projectId);
      setMatrixData(data);
    } catch (requestError) {
      setMatrixData(null);
      setMatrixError(
        getErrorMessage(
          requestError,
          'Não foi possível carregar a matriz de rastreabilidade.'
        )
      );
    } finally {
      setLoadingMatrix(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadMatrix();
  }, [loadMatrix]);

  async function handleSelectRequirement(requirementId) {
    setSelectedRequirementId(requirementId);
    setRequirementTraceability(null);
    setRequirementError('');
    setLoadingRequirement(true);

    try {
      const data = await getRequirementTraceability(projectId, requirementId);
      setRequirementTraceability(data);
    } catch (requestError) {
      setRequirementError(
        getErrorMessage(
          requestError,
          'Não foi possível carregar a cadeia de rastreabilidade do requisito.'
        )
      );
    } finally {
      setLoadingRequirement(false);
    }
  }

  const summary = matrixData?.summary || {};
  const requirements = matrixData?.requirements || [];

  return (
    <main className="page-container traceability-page">
      <Link className="back-link" to={`/projects/${projectId}`}>
        Voltar para o projeto
      </Link>

      <header className="page-header">
        <div>
          <span className="eyebrow">Projeto #{projectId}</span>
          <h1>Rastreabilidade</h1>
          <p>
            Acompanhe a evolução dos requisitos, tarefas e evidências técnicas do projeto.
          </p>
        </div>
        <ProjectSectionNav projectId={projectId} activeSection="traceability" />
      </header>

      {matrixError && <div className="message message-error">{matrixError}</div>}

      {loadingMatrix ? (
        <p className="empty-state">Carregando rastreabilidade...</p>
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
              <strong className="metric-value">
                {summary.implementedRequirements ?? 0}
              </strong>
            </Card>
            <Card title="Progresso médio">
              <strong className="metric-value">
                {formatPercentage(summary.averageProgressPercentage)}
              </strong>
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
                            {requirement.description && (
                              <span>{requirement.description}</span>
                            )}
                          </button>
                        </td>
                        <td>{formatRequirementStatus(requirement.status)}</td>
                        <td>
                          <div className="traceability-progress">
                            <span>{formatPercentage(requirement.progressPercentage)}</span>
                            <div className="traceability-progress-bar">
                              <span
                                style={{
                                  width: `${Math.min(
                                    Number(requirement.progressPercentage || 0),
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
                              requirement.hasTechnicalEvidence
                                ? 'status-ativo'
                                : 'status-pendente'
                            }`}
                          >
                            {requirement.hasTechnicalEvidence
                              ? 'Com evidência'
                              : 'Sem evidência'}
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

          <Card title="Fluxograma de rastreabilidade">
            <section className="traceability-flow-placeholder">
              {loadingRequirement && (
                <p className="empty-state">Carregando requisito selecionado...</p>
              )}

              {requirementError && (
                <div className="message message-error">{requirementError}</div>
              )}

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
