import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  api,
  getProjectPullRequestCoverage,
  getProjectPullRequests,
  linkTaskPullRequest,
  projectMembersApi,
  unlinkTaskPullRequest
} from '../api/api.js';
import { Card } from '../components/Card.jsx';
import {
  TaskForm,
  emptyTaskForm,
  taskFormToPayload,
  taskToFormData
} from '../components/TaskForm.jsx';

const statusLabels = {
  A_FAZER: 'A Fazer',
  EM_ANDAMENTO: 'Em Andamento',
  CONCLUIDO: 'Concluído'
};

const priorityLabels = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  CRITICA: 'Crítica'
};

function getErrorMessage(error, fallback) {
  return error.response?.data?.message || fallback;
}

function formatDate(value) {
  if (!value) {
    return 'Não informado';
  }

  return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function formatDateTime(value) {
  return new Date(value).toLocaleString('pt-BR');
}

function formatPullRequestLabel(pullRequest) {
  if (!pullRequest) {
    return 'Sem PR vinculado';
  }

  return `#${pullRequest.number} — ${pullRequest.title}`;
}

export function TasksPage() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [pullRequests, setPullRequests] = useState([]);
  const [pullRequestCoverage, setPullRequestCoverage] = useState(null);
  const [projectMembers, setProjectMembers] = useState([]);
  const [formData, setFormData] = useState(emptyTaskForm);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [period, setPeriod] = useState({ startDate: '', endDate: '' });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadTaskData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [
        projectResponse,
        tasksResponse,
        metricsResponse,
        pullRequestsResponse,
        coverageResponse,
        membersResponse
      ] = await Promise.all([
        api.get(`/projects/${projectId}`),
        api.get(`/projects/${projectId}/tasks`),
        api.get(`/projects/${projectId}/tasks/metrics`),
        getProjectPullRequests(projectId),
        getProjectPullRequestCoverage(projectId),
        projectMembersApi.listProjectMembers(projectId).catch((requestError) => {
          setError(
            getErrorMessage(
              requestError,
              'Não foi possível carregar os membros do projeto.'
            )
          );
          return { data: { members: [] } };
        })
      ]);

      setProject(projectResponse.data.project);
      setTasks(tasksResponse.data.tasks);
      setMetrics(metricsResponse.data);
      setPullRequests(pullRequestsResponse.pullRequests || []);
      setPullRequestCoverage(coverageResponse);
      setProjectMembers(membersResponse.data.members || []);
    } catch (requestError) {
      setError(
        getErrorMessage(requestError, 'Não foi possível carregar as tarefas do projeto.')
      );
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadTaskData();
  }, [loadTaskData]);

  function handleFormChange(name, value) {
    setFormData((current) => ({ ...current, [name]: value }));
  }

  function resetForm() {
    setEditingTaskId(null);
    setFormData(emptyTaskForm);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const selectedPullRequestId = formData.pullRequestId
        ? Number(formData.pullRequestId)
        : null;
      const editingTask = editingTaskId
        ? tasks.find((task) => String(task.id) === String(editingTaskId))
        : null;
      const hadPullRequestLinked = Boolean(
        editingTask?.pullRequestId || editingTask?.pullRequest
      );
      const payload = taskFormToPayload(formData, Boolean(editingTaskId));
      const response = editingTaskId
        ? await api.put(`/tasks/${editingTaskId}`, payload)
        : await api.post(`/projects/${projectId}/tasks`, payload);
      const savedTask = response.data.task;

      if (selectedPullRequestId) {
        await linkTaskPullRequest(savedTask.id, selectedPullRequestId);
      } else if (hadPullRequestLinked) {
        await unlinkTaskPullRequest(savedTask.id);
      }

      setSuccess(response.data.message);
      setPeriod({ startDate: '', endDate: '' });
      resetForm();
      await loadTaskData();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível salvar a tarefa.'));
    } finally {
      setSubmitting(false);
    }
  }

  function startEditing(task) {
    setEditingTaskId(task.id);
    setFormData(taskToFormData(task));
    setError('');
    setSuccess('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleUnlinkPullRequest(taskId) {
    setError('');
    setSuccess('');

    try {
      const response = await unlinkTaskPullRequest(taskId);
      setSuccess(response.message || 'Pull request removido da tarefa.');
      await loadTaskData();
    } catch (requestError) {
      setError(
        getErrorMessage(requestError, 'Não foi possível remover o vínculo com o pull request.')
      );
    }
  }

  async function handleMetricsSubmit(event) {
    event.preventDefault();
    setError('');

    try {
      const params = {};

      if (period.startDate) {
        params.startDate = period.startDate;
      }

      if (period.endDate) {
        params.endDate = period.endDate;
      }

      const response = await api.get(`/projects/${projectId}/tasks/metrics`, { params });
      setMetrics(response.data);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível consultar a métrica.'));
    }
  }

  async function clearMetricsPeriod() {
    setPeriod({ startDate: '', endDate: '' });
    setError('');

    try {
      const response = await api.get(`/projects/${projectId}/tasks/metrics`);
      setMetrics(response.data);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível consultar a métrica.'));
    }
  }

  if (loading) {
    return (
      <main className="page-container">
        <p className="empty-state">Carregando tarefas...</p>
      </main>
    );
  }

  return (
    <main className="page-container">
      <Link className="back-link" to={`/projects/${projectId}`}>
        ← Voltar para o projeto
      </Link>

      <header className="page-header">
        <div>
          <span className="eyebrow">Projeto #{projectId}</span>
          <h1>Tarefas do projeto</h1>
          <p>
            {project
              ? `Planejamento e acompanhamento das tarefas de ${project.name}.`
              : 'Cadastre e acompanhe as tarefas associadas ao projeto.'}
          </p>
        </div>
        <Link className="button button-secondary link-button" to={`/projects/${projectId}/kanban`}>
          Ver Kanban
        </Link>
      </header>

      {error && <div className="message message-error">{error}</div>}
      {success && <div className="message message-success">{success}</div>}

      <div className="task-summary">
        <Card title="Total de tarefas cadastradas">
          <strong className="metric-value">{tasks.length}</strong>
        </Card>

        <Card title="Volume de planejamento">
          <strong className="metric-value">{metrics?.totalTasksCreated ?? 0}</strong>
          <p className="metric-description">
            {metrics?.startDate || metrics?.endDate
              ? `Tarefas criadas entre ${metrics.startDate || 'o início'} e ${metrics.endDate || 'hoje'}.`
              : 'Quantidade total de tarefas cadastradas no projeto.'}
          </p>
          <form className="metrics-form task-period-filter" onSubmit={handleMetricsSubmit}>
            <label className="field">
              <span>Data inicial</span>
              <input
                type="date"
                value={period.startDate}
                onChange={(event) =>
                  setPeriod((current) => ({ ...current, startDate: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Data final</span>
              <input
                type="date"
                value={period.endDate}
                onChange={(event) =>
                  setPeriod((current) => ({ ...current, endDate: event.target.value }))
                }
              />
            </label>
            <button className="button button-secondary" type="submit">
              Consultar período
            </button>
            {(metrics?.startDate || metrics?.endDate) && (
              <button
                className="button button-secondary metrics-clear"
                type="button"
                onClick={clearMetricsPeriod}
              >
                Limpar período
              </button>
            )}
          </form>
        </Card>

        <Card title="Cobertura com Pull Requests">
          <strong className="metric-value">
            {pullRequestCoverage?.coveragePercentage ?? 0}%
          </strong>
          <p className="metric-description">
            {pullRequestCoverage
              ? `${pullRequestCoverage.linkedTasks} de ${pullRequestCoverage.totalTasks} tarefas possuem PR vinculado.`
              : 'Percentual de tarefas vinculadas a pull requests.'}
          </p>
        </Card>
      </div>

      <div className="tasks-layout">
        <Card title={editingTaskId ? 'Editar tarefa' : 'Cadastrar tarefa'}>
          <TaskForm
            formData={formData}
            onChange={handleFormChange}
            onSubmit={handleSubmit}
            onCancel={resetForm}
            submitting={submitting}
            editing={Boolean(editingTaskId)}
            pullRequests={pullRequests}
            projectMembers={projectMembers}
          />
        </Card>

        <Card title="Tarefas cadastradas">
          {tasks.length === 0 ? (
            <p className="empty-state">Nenhuma tarefa cadastrada ainda.</p>
          ) : (
            <div className="task-list">
              {tasks.map((task) => (
                <article className="task-item" key={task.id}>
                  <div className="task-item-header">
                    <div>
                      <span className={`priority-badge priority-${task.priority.toLowerCase()}`}>
                        {priorityLabels[task.priority]}
                      </span>
                      <h3>{task.title}</h3>
                    </div>
                    <span className={`status-badge status-${task.status.toLowerCase()}`}>
                      {statusLabels[task.status]}
                    </span>
                  </div>

                  <p>{task.description || 'Sem descrição cadastrada.'}</p>

                  <dl className="task-details">
                    <div>
                      <dt>Responsável</dt>
                      <dd>{task.responsible || 'Não informado'}</dd>
                    </div>
                    <div>
                      <dt>Prazo</dt>
                      <dd>{formatDate(task.deadline)}</dd>
                    </div>
                    <div>
                      <dt>Esforço estimado</dt>
                      <dd>{task.estimatedEffort ?? 'Não informado'}</dd>
                    </div>
                    <div>
                      <dt>Esforço realizado</dt>
                      <dd>{task.actualEffort ?? 'Não informado'}</dd>
                    </div>
                    <div>
                      <dt>Criada em</dt>
                      <dd>{formatDateTime(task.createdAt)}</dd>
                    </div>
                  </dl>

                  <div className="task-pr-card">
                    <span>Pull request vinculado</span>
                    {task.pullRequest ? (
                      <>
                        {task.pullRequest.githubUrl ? (
                          <a
                            className="task-pr-link"
                            href={task.pullRequest.githubUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {formatPullRequestLabel(task.pullRequest)}
                          </a>
                        ) : (
                          <strong>{formatPullRequestLabel(task.pullRequest)}</strong>
                        )}
                        <p className="task-pr-meta">
                          Status: {task.pullRequest.state || 'não informado'}
                        </p>
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => handleUnlinkPullRequest(task.id)}
                        >
                          Remover PR
                        </button>
                      </>
                    ) : (
                      <p className="task-pr-meta">Sem PR vinculado.</p>
                    )}
                  </div>

                  <div className="task-actions">
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => startEditing(task)}
                    >
                      Editar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
