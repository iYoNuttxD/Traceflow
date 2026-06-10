import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  api,
  getProjectCommitCoverage,
  getProjectCommits,
  getProjectPullRequestCoverage,
  getProjectPullRequests,
  linkTaskCommit,
  linkTaskPullRequest,
  projectMembersApi,
  unlinkTaskCommit,
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

function formatCommitLabel(commit) {
  const shortHash = commit.shortHash || commit.hash?.slice(0, 7) || `#${commit.id}`;

  return `${shortHash} — ${commit.message || 'Sem mensagem'}`;
}

export function TasksPage() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [pullRequests, setPullRequests] = useState([]);
  const [pullRequestOptions, setPullRequestOptions] = useState([]);
  const [commitResults, setCommitResults] = useState([]);
  const [commitOptions, setCommitOptions] = useState([]);
  const [pullRequestCoverage, setPullRequestCoverage] = useState(null);
  const [commitCoverage, setCommitCoverage] = useState(null);
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
        commitCoverageResponse,
        coverageResponse,
        membersResponse
      ] = await Promise.all([
        api.get(`/projects/${projectId}`),
        api.get(`/projects/${projectId}/tasks`),
        api.get(`/projects/${projectId}/tasks/metrics`),
        getProjectPullRequests(projectId),
        getProjectCommitCoverage(projectId),
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
      setPullRequestOptions(pullRequestsResponse.pullRequests || []);
      setCommitCoverage(commitCoverageResponse);
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

  const searchPullRequests = useCallback(
    async (search) => {
      try {
        const response = await getProjectPullRequests(projectId, { search });
        setPullRequests(response.pullRequests || []);
        setPullRequestOptions((current) => {
          const nextOptions = [...current];

          for (const pullRequest of response.pullRequests || []) {
            if (!nextOptions.some((item) => String(item.id) === String(pullRequest.id))) {
              nextOptions.push(pullRequest);
            }
          }

          return nextOptions;
        });
      } catch (requestError) {
        setError(
          getErrorMessage(requestError, 'Não foi possível carregar os pull requests do projeto.')
        );
      }
    },
    [projectId]
  );

  const searchCommits = useCallback(
    async (search) => {
      try {
        const response = await getProjectCommits(projectId, { search });
        setCommitResults(response.commits || []);
        setCommitOptions((current) => {
          const nextOptions = [...current];

          for (const commit of response.commits || []) {
            if (!nextOptions.some((item) => String(item.id) === String(commit.id))) {
              nextOptions.push(commit);
            }
          }

          return nextOptions;
        });
      } catch (requestError) {
        setError(getErrorMessage(requestError, 'Não foi possível carregar os commits do projeto.'));
      }
    },
    [projectId]
  );

  function handleFormChange(name, value) {
    setFormData((current) => ({ ...current, [name]: value }));
  }

  function addPullRequestOption(pullRequest) {
    setPullRequestOptions((current) =>
      current.some((item) => String(item.id) === String(pullRequest.id))
        ? current
        : [pullRequest, ...current]
    );
  }

  function handleSelectPullRequest(pullRequest) {
    addPullRequestOption(pullRequest);
    handleFormChange('pullRequestId', String(pullRequest.id));
  }

  function handleClearPullRequest() {
    handleFormChange('pullRequestId', '');
  }

  function handleSelectCommit(commit) {
    setCommitOptions((current) =>
      current.some((item) => String(item.id) === String(commit.id))
        ? current
        : [commit, ...current]
    );
    setFormData((current) => {
      const commitIds = current.commitIds || [];

      if (commitIds.some((commitId) => String(commitId) === String(commit.id))) {
        return current;
      }

      return {
        ...current,
        commitIds: [...commitIds, String(commit.id)]
      };
    });
  }

  function handleRemoveCommitFromForm(commitId) {
    setFormData((current) => ({
      ...current,
      commitIds: (current.commitIds || []).filter(
        (currentCommitId) => String(currentCommitId) !== String(commitId)
      )
    }));
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
      const selectedCommitIds = (formData.commitIds || []).map(Number);
      const editingTask = editingTaskId
        ? tasks.find((task) => String(task.id) === String(editingTaskId))
        : null;
      const hadPullRequestLinked = Boolean(
        editingTask?.pullRequestId || editingTask?.pullRequest
      );
      const previousCommitIds = (editingTask?.commits || []).map((commit) => commit.id);
      const payload = taskFormToPayload(formData, Boolean(editingTaskId));
      const response = editingTaskId
        ? await api.put(`/tasks/${editingTaskId}`, payload)
        : await api.post(`/projects/${projectId}/tasks`, payload);
      const savedTask = response.data.task;
      let pullRequestWarning = '';
      let commitWarning = '';

      try {
        if (selectedPullRequestId) {
          await linkTaskPullRequest(savedTask.id, selectedPullRequestId);
        } else if (hadPullRequestLinked) {
          await unlinkTaskPullRequest(savedTask.id);
        }
      } catch (pullRequestError) {
        pullRequestWarning = getErrorMessage(
          pullRequestError,
          'Tarefa salva, mas não foi possível atualizar o vínculo com o pull request.'
        );
      }

      try {
        const commitsToLink = selectedCommitIds.filter(
          (commitId) => !previousCommitIds.includes(commitId)
        );
        const commitsToUnlink = previousCommitIds.filter(
          (commitId) => !selectedCommitIds.includes(commitId)
        );

        for (const commitId of commitsToLink) {
          await linkTaskCommit(savedTask.id, commitId);
        }

        for (const commitId of commitsToUnlink) {
          await unlinkTaskCommit(savedTask.id, commitId);
        }
      } catch (commitError) {
        commitWarning = getErrorMessage(
          commitError,
          'Tarefa salva, mas não foi possível atualizar os vínculos com commits.'
        );
      }

      setSuccess(response.data.message);
      setPeriod({ startDate: '', endDate: '' });
      resetForm();
      await loadTaskData();
      if (pullRequestWarning || commitWarning) {
        setError([pullRequestWarning, commitWarning].filter(Boolean).join(' '));
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível salvar a tarefa.'));
    } finally {
      setSubmitting(false);
    }
  }

  function startEditing(task) {
    setEditingTaskId(task.id);
    setFormData(taskToFormData(task));
    if (task.pullRequest) {
      addPullRequestOption(task.pullRequest);
    }
    if (task.commits?.length) {
      setCommitOptions((current) => {
        const nextCommits = [...current];

        for (const commit of task.commits) {
          if (!nextCommits.some((item) => String(item.id) === String(commit.id))) {
            nextCommits.unshift(commit);
          }
        }

        return nextCommits;
      });
    }
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

  async function handleUnlinkCommit(taskId, commitId) {
    setError('');
    setSuccess('');

    try {
      const response = await unlinkTaskCommit(taskId, commitId);
      setSuccess(response.message || 'Commit removido da tarefa.');
      await loadTaskData();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível remover o commit da tarefa.'));
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

  const editingTask = editingTaskId
    ? tasks.find((task) => String(task.id) === String(editingTaskId))
    : null;
  const selectedPullRequest =
    pullRequestOptions.find(
      (pullRequest) => String(pullRequest.id) === String(formData.pullRequestId)
    ) ||
    editingTask?.pullRequest ||
    null;
  const selectedCommits = (formData.commitIds || [])
    .map(
      (commitId) =>
        commitOptions.find((commit) => String(commit.id) === String(commitId)) ||
        editingTask?.commits?.find((commit) => String(commit.id) === String(commitId))
    )
    .filter(Boolean);

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
            <button
              className="button button-secondary"
              type="submit"
              aria-label="Consultar período"
            >
              Consultar
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

        <Card title="Cobertura com commits">
          <strong className="metric-value">{commitCoverage?.coveragePercentage ?? 0}%</strong>
          <p className="metric-description">
            {commitCoverage
              ? `${commitCoverage.linkedTasks} de ${commitCoverage.totalTasks} tarefas possuem pelo menos um commit vinculado.`
              : 'Percentual de tarefas vinculadas a commits.'}
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
            selectedPullRequest={selectedPullRequest}
            selectedCommits={selectedCommits}
            commitResults={commitResults}
            onPullRequestSearch={searchPullRequests}
            onCommitSearch={searchCommits}
            onSelectPullRequest={handleSelectPullRequest}
            onClearPullRequest={handleClearPullRequest}
            onSelectCommit={handleSelectCommit}
            onRemoveCommit={handleRemoveCommitFromForm}
          />
        </Card>
      </div>

      <section className="tasks-list-section">
        <Card title="Tarefas cadastradas">
          {tasks.length === 0 ? (
            <p className="empty-state">Nenhuma tarefa cadastrada ainda.</p>
          ) : (
            <div className="task-list tasks-list-grid">
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
                    <span>Rastreabilidade</span>
                    <div className="task-traceability-group">
                      <strong>Pull request</strong>
                      {task.pullRequest ? (
                        <div className="task-traceability-item">
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
                            <span>{formatPullRequestLabel(task.pullRequest)}</span>
                          )}
                          <button
                            className="traceability-remove-button"
                            type="button"
                            onClick={() => handleUnlinkPullRequest(task.id)}
                            aria-label="Remover pull request vinculado"
                            title="Remover pull request"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <p className="task-pr-meta">Sem PR vinculado.</p>
                      )}
                    </div>

                    <div className="task-traceability-group">
                      <strong>Commits</strong>
                      {task.commits?.length ? (
                        <div className="task-traceability-list">
                          {task.commits.map((commit) => (
                            <div className="task-traceability-item" key={commit.id}>
                              {commit.githubUrl ? (
                                <a
                                  className="task-pr-link"
                                  href={commit.githubUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {formatCommitLabel(commit)}
                                </a>
                              ) : (
                                <span>{formatCommitLabel(commit)}</span>
                              )}
                              <button
                                className="traceability-remove-button"
                                type="button"
                                onClick={() => handleUnlinkCommit(task.id, commit.id)}
                                aria-label="Remover commit vinculado"
                                title="Remover commit"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="task-pr-meta">Sem commits vinculados.</p>
                      )}
                    </div>
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
      </section>
    </main>
  );
}
