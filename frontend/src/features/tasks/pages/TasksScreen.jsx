import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  deleteTask,
  linkTaskCommit,
  linkTaskIssue,
  linkTaskToPullRequest,
  linkTaskRequirement,
  tasksApi,
  unlinkTaskCommit,
  unlinkTaskIssue,
  unlinkTaskFromPullRequest,
  unlinkTaskRequirement
} from '../api/tasks.api.js';
import { projectMembersApi } from '../../members/index.js';
import { requirementsApi } from '../../requirements/index.js';
import { scheduleApi } from '../../schedule/index.js';
import { projectsApi } from '../../projects/index.js';
import { getProjectCommits, getProjectIssues, getProjectPullRequests } from '../../github/index.js';
import {
  getProjectCommitCoverage,
  getProjectIssueCoverage,
  getProjectPullRequestCoverage
} from '../../traceability/index.js';
import { Card, useAbortableRequest, useConfirm } from '../../../shared/index.js';
import { ProjectSectionNav } from '../../projects/index.js';
import {
  TaskForm,
  emptyTaskForm,
  taskFormToPayload,
  taskToFormData
} from '../components/TaskForm.jsx';
import { TaskMetrics } from '../components/TaskMetrics.jsx';
import { TaskList } from '../components/TaskList.jsx';

function getErrorMessage(error, fallback) {
  return error.response?.data?.message || fallback;
}

export function TasksScreen() {
  const confirm = useConfirm();
  const { projectId } = useParams();
  const { run: runPullRequestSearch } = useAbortableRequest();
  const { run: runRequirementSearch } = useAbortableRequest();
  const { run: runCommitSearch, cancel: cancelCommitSearch } = useAbortableRequest();
  const { run: runIssueSearch } = useAbortableRequest();
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [requirementOptions, setRequirementOptions] = useState([]);
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
  const [sprints, setSprints] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [formData, setFormData] = useState(emptyTaskForm);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [deletingTaskId, setDeletingTaskId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const loadedProjectIdRef = useRef(null);
  const loadTaskData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [
        projectResponse,
        tasksResponse,
        requirementsResponse,
        pullRequestsResponse,
        commitCoverageResponse,
        issueCoverageResponse,
        coverageResponse,
        membersResponse,
        sprintsResponse,
        milestonesResponse
      ] = await Promise.all([
        projectsApi.get(projectId),
        tasksApi.list(projectId),
        requirementsApi.listByProject(projectId),
        getProjectPullRequests(projectId),
        getProjectCommitCoverage(projectId),
        getProjectIssueCoverage(projectId),
        getProjectPullRequestCoverage(projectId),
        projectMembersApi.listProjectMembers(projectId).catch((requestError) => {
          setError(
            getErrorMessage(requestError, 'Não foi possível carregar os membros do projeto.')
          );
          return { data: { members: [] } };
        }),
        scheduleApi.listSprints(projectId).catch(() => ({ data: { sprints: [] } })),
        scheduleApi.listMilestones(projectId).catch(() => ({ data: { milestones: [] } }))
      ]);

      setProject(projectResponse.data.project);
      setTasks(tasksResponse.data.tasks);
      setRequirements(requirementsResponse.data.requirements || []);
      setRequirementOptions(requirementsResponse.data.requirements || []);
      setPullRequests(pullRequestsResponse.pullRequests || []);
      setPullRequestOptions(pullRequestsResponse.pullRequests || []);
      setCommitCoverage(commitCoverageResponse);
      setIssueCoverage(issueCoverageResponse);
      setPullRequestCoverage(coverageResponse);
      setProjectMembers(membersResponse.data.members || []);
      setSprints(sprintsResponse.data.sprints || []);
      setMilestones(milestonesResponse.data.milestones || []);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível carregar as tarefas do projeto.'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (loadedProjectIdRef.current === projectId) return;
    loadedProjectIdRef.current = projectId;
    void loadTaskData();
  }, [loadTaskData, projectId]);

  const searchPullRequests = useCallback(
    async (search) => {
      try {
        const response = await runPullRequestSearch((signal) =>
          getProjectPullRequests(projectId, { search }, { signal })
        );
        if (!response) return;
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
    [projectId, runPullRequestSearch]
  );

  const searchRequirements = useCallback(
    async (search) => {
      try {
        const response = await runRequirementSearch((signal) =>
          requirementsApi.listByProject(projectId, { search }, { signal })
        );
        if (!response) return;
        const foundRequirements = response.data.requirements || [];
        setRequirements(foundRequirements);
        setRequirementOptions((current) => {
          const nextOptions = [...current];

          for (const requirement of foundRequirements) {
            if (!nextOptions.some((item) => String(item.id) === String(requirement.id))) {
              nextOptions.push(requirement);
            }
          }

          return nextOptions;
        });
      } catch (requestError) {
        setError(getErrorMessage(requestError, 'Não foi possível carregar os requisitos.'));
      }
    },
    [projectId, runRequirementSearch]
  );

  const searchCommits = useCallback(
    async (search) => {
      try {
        const response = await runCommitSearch((signal) =>
          getProjectCommits(projectId, { search }, { signal })
        );
        if (!response) return;
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
    [projectId, runCommitSearch]
  );

  const clearCommitSearch = useCallback(() => {
    cancelCommitSearch();
    setCommitResults([]);
  }, [cancelCommitSearch]);

  const searchIssues = useCallback(
    async (search) => {
      try {
        const response = await runIssueSearch((signal) =>
          getProjectIssues(projectId, { search }, { signal })
        );
        if (!response) return;
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
    [projectId, runIssueSearch]
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

  function addRequirementOption(requirement) {
    setRequirementOptions((current) =>
      current.some((item) => String(item.id) === String(requirement.id))
        ? current
        : [requirement, ...current]
    );
  }

  function handleSelectRequirement(requirement) {
    addRequirementOption(requirement);
    handleFormChange('requirementId', String(requirement.id));
  }

  function handleClearRequirement() {
    handleFormChange('requirementId', '');
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
      current.some((item) => String(item.id) === String(commit.id)) ? current : [commit, ...current]
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
      current.some((item) => String(item.id) === String(issue.id)) ? current : [issue, ...current]
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
    clearCommitSearch();
  }

  function handleSuggestionConfirmed(commit) {
    handleSelectCommit(commit);
    setTasks((current) =>
      current.map((task) => {
        if (String(task.id) !== String(editingTaskId)) return task;
        const commits = task.commits || [];
        return commits.some((item) => String(item.id) === String(commit.id))
          ? task
          : { ...task, commits: [...commits, commit] };
      })
    );
    setSuccess('Sugestão confirmada e commit vinculado à tarefa.');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const selectedPullRequestId = formData.pullRequestId ? Number(formData.pullRequestId) : null;
      const selectedRequirementId = formData.requirementId ? Number(formData.requirementId) : null;
      const selectedCommitIds = (formData.commitIds || []).map(Number);
      const selectedIssueIds = (formData.issueIds || []).map(Number);
      const editingTask = editingTaskId
        ? tasks.find((task) => String(task.id) === String(editingTaskId))
        : null;
      const hadPullRequestLinked = Boolean(editingTask?.pullRequestId || editingTask?.pullRequest);
      const hadRequirementLinked = Boolean(editingTask?.requirementId || editingTask?.requirement);
      const previousCommitIds = (editingTask?.commits || []).map((commit) => commit.id);
      const previousIssueIds = (editingTask?.issues || []).map((issue) => issue.id);
      const payload = taskFormToPayload(formData, Boolean(editingTaskId));
      const response = editingTaskId
        ? await tasksApi.update(editingTaskId, payload)
        : await tasksApi.create(projectId, payload);
      const savedTask = response.data.task;
      let pullRequestWarning = '';
      let requirementWarning = '';
      let commitWarning = '';
      let issueWarning = '';
      let sprintWarning = '';

      try {
        const selectedSprintId = formData.sprintId ? Number(formData.sprintId) : null;
        const currentSprintId = savedTask.sprintId ?? null;
        if (selectedSprintId !== currentSprintId) {
          if (selectedSprintId) await scheduleApi.linkTaskSprint(savedTask.id, selectedSprintId);
          else await scheduleApi.unlinkTaskSprint(savedTask.id);
        }
      } catch (sprintError) {
        sprintWarning = getErrorMessage(
          sprintError,
          'Tarefa salva, mas não foi possível atualizar o vínculo com a sprint.'
        );
      }

      try {
        if (selectedRequirementId) {
          await linkTaskRequirement(savedTask.id, selectedRequirementId);
        } else if (hadRequirementLinked) {
          await unlinkTaskRequirement(savedTask.id);
        }
      } catch (requirementError) {
        requirementWarning = getErrorMessage(
          requirementError,
          'Tarefa salva, mas não foi possível atualizar o vínculo com o requisito.'
        );
      }

      try {
        if (selectedPullRequestId) {
          await linkTaskToPullRequest(savedTask.id, selectedPullRequestId);
        } else if (hadPullRequestLinked) {
          await unlinkTaskFromPullRequest(savedTask.id);
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
      if (
        requirementWarning ||
        pullRequestWarning ||
        commitWarning ||
        issueWarning ||
        sprintWarning
      ) {
        setError(
          [requirementWarning, pullRequestWarning, commitWarning, issueWarning, sprintWarning]
            .filter(Boolean)
            .join(' ')
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
    if (task.requirement) {
      addRequirementOption(task.requirement);
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
      const response = await unlinkTaskFromPullRequest(taskId);
      setSuccess(response.message || 'Pull request removido da tarefa.');
      await loadTaskData();
    } catch (requestError) {
      setError(
        getErrorMessage(requestError, 'Não foi possível remover o vínculo com o pull request.')
      );
    }
  }

  async function handleUnlinkRequirement(taskId) {
    setError('');
    setSuccess('');

    try {
      const response = await unlinkTaskRequirement(taskId);
      setSuccess(response.message || 'Vínculo com requisito removido.');
      await loadTaskData();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível remover o requisito da tarefa.'));
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

  async function handleDeleteTask(task) {
    const confirmed = await confirm({
      title: 'Excluir tarefa',
      description:
        'Esta ação não poderá ser desfeita. Os vínculos com requisito, pull request, commits, issues e movimentações do Kanban serão removidos, mas os artefatos importados do GitHub serão mantidos.',
      confirmLabel: 'Excluir tarefa'
    });

    if (!confirmed) {
      return;
    }

    setDeletingTaskId(task.id);
    setError('');
    setSuccess('');

    try {
      const response = await deleteTask(task.id);

      if (String(editingTaskId) === String(task.id)) {
        resetForm();
      }

      setSuccess(response.message || 'Tarefa excluída com sucesso.');
      await loadTaskData();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível excluir a tarefa.'));
    } finally {
      setDeletingTaskId(null);
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
  const selectedRequirement =
    requirementOptions.find(
      (requirement) => String(requirement.id) === String(formData.requirementId)
    ) ||
    editingTask?.requirement ||
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
        <ProjectSectionNav projectId={projectId} activeSection="tasks" />
      </header>

      {error && <div className="message message-error">{error}</div>}
      {success && <div className="message message-success">{success}</div>}

      <TaskMetrics
        total={tasks.length}
        pullRequestCoverage={pullRequestCoverage}
        commitCoverage={commitCoverage}
        issueCoverage={issueCoverage}
      />

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
            requirements={requirements}
            sprints={sprints}
            selectedRequirement={selectedRequirement}
            selectedPullRequest={selectedPullRequest}
            selectedCommits={selectedCommits}
            selectedIssues={selectedIssues}
            commitResults={commitResults}
            issueResults={issueResults}
            onRequirementSearch={searchRequirements}
            onPullRequestSearch={searchPullRequests}
            onCommitSearch={searchCommits}
            onCommitSearchClear={clearCommitSearch}
            onIssueSearch={searchIssues}
            onSelectRequirement={handleSelectRequirement}
            onClearRequirement={handleClearRequirement}
            onSelectPullRequest={handleSelectPullRequest}
            onClearPullRequest={handleClearPullRequest}
            onSelectCommit={handleSelectCommit}
            onRemoveCommit={handleRemoveCommitFromForm}
            onSuggestionConfirmed={handleSuggestionConfirmed}
            projectId={projectId}
            taskId={editingTaskId}
            onSelectIssue={handleSelectIssue}
            onRemoveIssue={handleRemoveIssueFromForm}
          />
        </Card>
      </div>

      <TaskList
        tasks={tasks}
        sprints={sprints}
        milestones={milestones}
        deletingTaskId={deletingTaskId}
        onEdit={startEditing}
        onDelete={handleDeleteTask}
        onUnlinkRequirement={handleUnlinkRequirement}
        onUnlinkPullRequest={handleUnlinkPullRequest}
        onUnlinkCommit={handleUnlinkCommit}
        onUnlinkIssue={handleUnlinkIssue}
      />
    </main>
  );
}
