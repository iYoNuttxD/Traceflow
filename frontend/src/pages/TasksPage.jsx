import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  api,
  getProjectCommitCoverage,
  getProjectCommits,
  getProjectIssueCoverage,
  getProjectIssues,
  getProjectPullRequestCoverage,
  getProjectPullRequests,
  linkTaskCommit,
  linkTaskIssue,
  linkTaskPullRequest,
  projectMembersApi,
  unlinkTaskCommit,
  unlinkTaskIssue,
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

function formatIssueLabel(issue) {
  if (!issue) {
    return 'Issue não encontrada';
  }

  return `#${issue.number} — ${issue.title}`;
}

export function TasksPage() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [pullRequests, setPullRequests] = useState([]);
  const [pullRequestOptions, setPullRequestOptions] = useState([]);
  const [commitResults, setCommitResults] = useState([]);
  const [commitOptions, setCommitOptions] = useState([]);
  const [issueResults, setIssueResults] = useState([]);
  const [issueOptions, setIssueOptions] = useState([]);
  const [pullRequestCoverage, setPullRequestCoverage] = useState(null);
  const [commitCoverage, setCommitCoverage] = useState(null);
  const [issueCoverage, setIssueCoverage] = useState(null);
  const [projectMembers, setProjectMembers] = useState([]);
  const [formData, setFormData] = useState(emptyTaskForm);
  const [editingTaskId, setEditingTaskId] = useState(null);
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
        pullRequestsResponse,
        commitCoverageResponse,
        issueCoverageResponse,
        coverageResponse,
        membersResponse
      ] = await Promise.all([
        api.get(`/projects/${projectId}`),
        api.get(`/projects/${projectId}/tasks`),
        getProjectPullRequests(projectId),
        getProjectCommitCoverage(projectId),
        getProjectIssueCoverage(projectId),
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
      setPullRequests(pullRequestsResponse.pullRequests || []);
      setPullRequestOptions(pullRequestsResponse.pullRequests || []);
      setCommitCoverage(commitCoverageResponse);
      setIssueCoverage(issueCoverageResponse);
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

  const searchIssues = useCallback(
    async (search) => {
      try {
        const response = await getProjectIssues(projectId, { search });
        setIssueResults(response.issues || []);
        setIssueOptions((current) => {
          const nextOptions = [...current];

          for (const issue of response.issues || []) {
            if (!nextOptions.some((item) => String(item.id) === String(issue.id))) {
              nextOptions.push(issue);
            }
          }

          return nextOptions;
        });
      } catch (requestError) {
        setError(getErrorMessage(requestError, 'Não foi possível carregar as issues do projeto.'));
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

  function handleSelectIssue(issue) {
    setIssueOptions((current) =>
      current.some((item) => String(item.id) === String(issue.id))
        ? current
        : [issue, ...current]
    );
    setFormData((current) => {
      const issueIds = current.issueIds || [];

      if (issueIds.some((issueId) => String(issueId) === String(issue.id))) {
        return current;
      }

      return {
        ...current,
        issueIds: [...issueIds, String(issue.id)]
      };
    });
  }

  function handleRemoveIssueFromForm(issueId) {
    setFormData((current) => ({
      ...current,
      issueIds: (current.issueIds || []).filter(
        (currentIssueId) => String(currentIssueId) !== String(issueId)
      )
    }));
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
      const selectedIssueIds = (formData.issueIds || []).map(Number);
      const editingTask = editingTaskId
        ? tasks.find((task) => String(task.id) === String(editingTaskId))
        : null;
      const hadPullRequestLinked = Boolean(
        editingTask?.pullRequestId || editingTask?.pullRequest
      );
      const previousCommitIds = (editingTask?.commits || []).map((commit) => commit.id);
      const previousIssueIds = (editingTask?.issues || []).map((issue) => issue.id);
      const payload = taskFormToPayload(formData, Boolean(editingTaskId));
      const response = editingTaskId
        ? await api.put(`/tasks/${editingTaskId}`, payload)
        : await api.post(`/projects/${projectId}/tasks`, payload);
      const savedTask = response.data.task;
      let pullRequestWarning = '';
      let commitWarning = '';
      let issueWarning = '';

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

      try {
        const issuesToLink = selectedIssueIds.filter(
          (issueId) => !previousIssueIds.includes(issueId)
        );
        const issuesToUnlink = previousIssueIds.filter(
          (issueId) => !selectedIssueIds.includes(issueId)
        );

        for (const issueId of issuesToLink) {
          await linkTaskIssue(savedTask.id, issueId);
        }

        for (const issueId of issuesToUnlink) {
          await unlinkTaskIssue(savedTask.id, issueId);
        }
      } catch (issueError) {
        issueWarning = getErrorMessage(
          issueError,
          'Tarefa salva, mas não foi possível atualizar os vínculos com issues.'
        );
      }

      setSuccess(response.data.message);
      resetForm();
      await loadTaskData();
      if (pullRequestWarning || commitWarning || issueWarning) {
        setError(
          [pullRequestWarning, commitWarning, issueWarning].filter(Boolean).join(' ')
        );
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
    if (task.issues?.length) {
      setIssueOptions((current) => {
        const nextIssues = [...current];

        for (const issue of task.issues) {
          if (!nextIssues.some((item) => String(item.id) === String(issue.id))) {
            nextIssues.unshift(issue);
          }
        }

        return nextIssues;
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

  async function handleUnlinkIssue(taskId, issueId) {
    setError('');
    setSuccess('');

    try {
      const response = await unlinkTaskIssue(taskId, issueId);
      setSuccess(response.message || 'Issue removida da tarefa.');
      await loadTaskData();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível remover a issue da tarefa.'));
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
  const selectedIssues = (formData.issueIds || [])
    .map(
      (issueId) =>
        issueOptions.find((issue) => String(issue.id) === String(issueId)) ||
        editingTask?.issues?.find((issue) => String(issue.id) === String(issueId))
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

        <Card title="Cobertura com issues">
          <strong className="metric-value">{issueCoverage?.coveragePercentage ?? 0}%</strong>
          <p className="metric-description">
            {issueCoverage
              ? `${issueCoverage.linkedTasks} de ${issueCoverage.totalTasks} tarefas possuem pelo menos uma issue vinculada.`
              : 'Percentual de tarefas vinculadas a issues.'}
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
            selectedIssues={selectedIssues}
            commitResults={commitResults}
            issueResults={issueResults}
            onPullRequestSearch={searchPullRequests}
            onCommitSearch={searchCommits}
            onIssueSearch={searchIssues}
            onSelectPullRequest={handleSelectPullRequest}
            onClearPullRequest={handleClearPullRequest}
            onSelectCommit={handleSelectCommit}
            onRemoveCommit={handleRemoveCommitFromForm}
            onSelectIssue={handleSelectIssue}
            onRemoveIssue={handleRemoveIssueFromForm}
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

                    <div className="task-traceability-group">
                      <strong>Issues</strong>
                      {task.issues?.length ? (
                        <div className="task-traceability-list">
                          {task.issues.map((issue) => (
                            <div className="task-traceability-item" key={issue.id}>
                              {issue.githubUrl ? (
                                <a
                                  className="task-pr-link"
                                  href={issue.githubUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {formatIssueLabel(issue)}
                                </a>
                              ) : (
                                <span>{formatIssueLabel(issue)}</span>
                              )}
                              <button
                                className="traceability-remove-button"
                                type="button"
                                onClick={() => handleUnlinkIssue(task.id, issue.id)}
                                aria-label="Remover issue vinculada"
                                title="Remover issue"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="task-pr-meta">Sem issues vinculadas.</p>
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
