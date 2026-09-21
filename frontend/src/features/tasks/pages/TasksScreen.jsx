import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';
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
import { membersApi } from '../../members/index.js';
import { requirementsApi } from '../../requirements/index.js';
import { CollapsibleFilterPanel, scheduleApi, SprintDialog } from '../../schedule/index.js';
import { projectsApi, ProjectSectionNav } from '../../projects/index.js';
import { getProjectCommits, getProjectIssues, getProjectPullRequests } from '../../github/index.js';
import {
  ContextualErrorPage,
  FeedbackRegion,
  LoadingState,
  ResponsibleCombobox,
  SelectControl,
  classifyPageError,
  getErrorRequestId,
  normalizeApiError,
  useConfirm
} from '../../../shared/index.js';
import {
  TaskForm,
  emptyTaskForm,
  taskFormToPayload,
  taskToFormData
} from '../components/TaskForm.jsx';
import { TaskDetailsPanel } from '../components/TaskDetailsPanel.jsx';
import { TaskMetrics } from '../components/TaskMetrics.jsx';
import { TaskList } from '../components/TaskList.jsx';
import { priorityLabels, statusLabels } from '../components/kanban-display.js';
import './TasksScreen.css';

const EMPTY_FILTERS = Object.freeze({
  search: '',
  status: '',
  priority: '',
  responsibleUserId: '',
  sprintId: ''
});

function getErrorMessage(error, fallback) {
  return normalizeApiError(error, fallback).message;
}

function normalized(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

export function TasksScreen() {
  const confirm = useConfirm();
  const { projectId } = useParams();
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
  const [projectMembers, setProjectMembers] = useState([]);
  const [currentMembership, setCurrentMembership] = useState(null);
  const [sprints, setSprints] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [formData, setFormData] = useState(emptyTaskForm);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [deletingTaskId, setDeletingTaskId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [pageError, setPageError] = useState(null);
  const [success, setSuccess] = useState('');
  const loadSequenceRef = useRef(0);
  const loadControllerRef = useRef(null);
  const detailsSequenceRef = useRef(0);
  const detailsControllerRef = useRef(null);
  const formReturnFocusRef = useRef(null);
  const detailsReturnFocusRef = useRef(null);

  const canWrite = Boolean(currentMembership && currentMembership.role !== 'VIEWER');

  const loadTaskData = useCallback(
    async ({ showLoading = true } = {}) => {
      const sequence = ++loadSequenceRef.current;
      loadControllerRef.current?.abort();
      const controller = new AbortController();
      loadControllerRef.current = controller;
      if (showLoading) setLoading(true);
      setPageError(null);

      try {
        const options = { signal: controller.signal };
        const [
          projectResponse,
          tasksResponse,
          requirementsResponse,
          pullRequestsResponse,
          membersResponse,
          sprintsResponse,
          milestonesResponse
        ] = await Promise.all([
          projectsApi.get(projectId, options),
          tasksApi.list(projectId, {}, options),
          requirementsApi.listByProject(projectId, {}, options),
          getProjectPullRequests(projectId, {}, options),
          membersApi.list(projectId, options).catch((requestError) => ({
            members: [],
            currentMembership: null,
            requestError
          })),
          scheduleApi.listSprints(projectId, {}, options).catch(() => ({ data: { sprints: [] } })),
          scheduleApi
            .listMilestones(projectId, {}, options)
            .catch(() => ({ data: { milestones: [] } }))
        ]);

        if (controller.signal.aborted || sequence !== loadSequenceRef.current) return;
        setProject(projectResponse.data.project);
        setTasks(tasksResponse.data.tasks || []);
        setRequirements(requirementsResponse.data.requirements || []);
        setRequirementOptions(requirementsResponse.data.requirements || []);
        setPullRequests(pullRequestsResponse.pullRequests || []);
        setPullRequestOptions(pullRequestsResponse.pullRequests || []);
        setProjectMembers(membersResponse.members || []);
        setCurrentMembership(membersResponse.currentMembership || null);
        setSprints(sprintsResponse.data.sprints || []);
        setMilestones(milestonesResponse.data.milestones || []);
        if (membersResponse.requestError) {
          setError(
            getErrorMessage(
              membersResponse.requestError,
              'Não foi possível carregar os membros do projeto.'
            )
          );
        }
      } catch (requestError) {
        if (controller.signal.aborted || sequence !== loadSequenceRef.current) return;
        setPageError(
          normalizeApiError(requestError, 'Não foi possível carregar as tarefas do projeto.')
        );
      } finally {
        if (sequence === loadSequenceRef.current) {
          setLoading(false);
          loadControllerRef.current = null;
        }
      }
    },
    [projectId]
  );

  useEffect(() => {
    void loadTaskData();
    return () => {
      loadSequenceRef.current += 1;
      loadControllerRef.current?.abort();
      detailsSequenceRef.current += 1;
      detailsControllerRef.current?.abort();
    };
  }, [loadTaskData, projectId]);

  const searchPullRequests = useCallback(
    async (search, signal) => {
      const response = await getProjectPullRequests(projectId, { search }, { signal });
      const found = response.pullRequests || [];
      setPullRequests(found);
      setPullRequestOptions((current) => {
        const next = [...current];
        for (const pullRequest of found) {
          if (!next.some((item) => String(item.id) === String(pullRequest.id))) {
            next.push(pullRequest);
          }
        }
        return next;
      });
      return found;
    },
    [projectId]
  );

  const searchRequirements = useCallback(
    async (search, signal) => {
      const response = await requirementsApi.listByProject(projectId, { search }, { signal });
      const found = response.data.requirements || [];
      setRequirements(found);
      setRequirementOptions((current) => {
        const next = [...current];
        for (const requirement of found) {
          if (!next.some((item) => String(item.id) === String(requirement.id))) {
            next.push(requirement);
          }
        }
        return next;
      });
      return found;
    },
    [projectId]
  );

  const searchCommits = useCallback(
    async (search, signal) => {
      const response = await getProjectCommits(projectId, { search }, { signal });
      const found = response.commits || [];
      setCommitResults(found);
      setCommitOptions((current) => {
        const next = [...current];
        for (const commit of found) {
          if (!next.some((item) => String(item.id) === String(commit.id))) next.push(commit);
        }
        return next;
      });
      return found;
    },
    [projectId]
  );

  const clearCommitSearch = useCallback(() => {
    setCommitResults([]);
  }, []);

  const searchIssues = useCallback(
    async (search, signal) => {
      const response = await getProjectIssues(projectId, { search }, { signal });
      const found = response.issues || [];
      setIssueResults(found);
      setIssueOptions((current) => {
        const next = [...current];
        for (const issue of found) {
          if (!next.some((item) => String(item.id) === String(issue.id))) next.push(issue);
        }
        return next;
      });
      return found;
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

  function handleSelectPullRequest(pullRequest) {
    addPullRequestOption(pullRequest);
    handleFormChange('pullRequestId', String(pullRequest.id));
  }

  function handleSelectCommit(commit) {
    setCommitOptions((current) =>
      current.some((item) => String(item.id) === String(commit.id)) ? current : [commit, ...current]
    );
    setFormData((current) => ({
      ...current,
      commitIds: (current.commitIds || []).some((id) => String(id) === String(commit.id))
        ? current.commitIds
        : [...(current.commitIds || []), String(commit.id)]
    }));
  }

  function handleSelectIssue(issue) {
    setIssueOptions((current) =>
      current.some((item) => String(item.id) === String(issue.id)) ? current : [issue, ...current]
    );
    setFormData((current) => ({
      ...current,
      issueIds: (current.issueIds || []).some((id) => String(id) === String(issue.id))
        ? current.issueIds
        : [...(current.issueIds || []), String(issue.id)]
    }));
  }

  function closeForm() {
    if (submitting) return;
    setFormOpen(false);
    setEditingTaskId(null);
    setFormData(emptyTaskForm);
    setCommitResults([]);
  }

  function openCreate(trigger) {
    formReturnFocusRef.current = trigger?.currentTarget || trigger || null;
    setEditingTaskId(null);
    setFormData(emptyTaskForm);
    setError('');
    setWarning('');
    setSuccess('');
    setFormOpen(true);
  }

  function startEditing(task, trigger) {
    formReturnFocusRef.current = trigger || null;
    setEditingTaskId(task.id);
    setFormData(taskToFormData(task));
    if (task.pullRequest) addPullRequestOption(task.pullRequest);
    if (task.requirement) addRequirementOption(task.requirement);
    setCommitOptions((current) => [
      ...(task.commits || []).filter(
        (commit) => !current.some((item) => String(item.id) === String(commit.id))
      ),
      ...current
    ]);
    setIssueOptions((current) => [
      ...(task.issues || []).filter(
        (issue) => !current.some((item) => String(item.id) === String(issue.id))
      ),
      ...current
    ]);
    setError('');
    setWarning('');
    setSuccess('');
    setFormOpen(true);
  }

  function handleSuggestionConfirmed(commit) {
    handleSelectCommit(commit);
    setTasks((current) =>
      current.map((task) =>
        String(task.id) === String(editingTaskId) &&
        !(task.commits || []).some((item) => String(item.id) === String(commit.id))
          ? { ...task, commits: [...(task.commits || []), commit] }
          : task
      )
    );
    setSuccess('Sugestão confirmada e commit vinculado à tarefa.');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setWarning('');
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
      const response = editingTaskId
        ? await tasksApi.update(editingTaskId, taskFormToPayload(formData))
        : await tasksApi.create(projectId, taskFormToPayload(formData));
      const savedTask = response.data.task;
      const warnings = [];

      try {
        const sprintId = formData.sprintId ? Number(formData.sprintId) : null;
        if (sprintId !== (savedTask.sprintId ?? null)) {
          if (sprintId) await scheduleApi.linkTaskSprint(savedTask.id, sprintId);
          else await scheduleApi.unlinkTaskSprint(savedTask.id);
        }
      } catch (requestError) {
        warnings.push(
          getErrorMessage(
            requestError,
            'Tarefa salva, mas não foi possível atualizar o vínculo com a sprint.'
          )
        );
      }

      try {
        if (selectedRequirementId) await linkTaskRequirement(savedTask.id, selectedRequirementId);
        else if (hadRequirementLinked) await unlinkTaskRequirement(savedTask.id);
      } catch (requestError) {
        warnings.push(
          getErrorMessage(requestError, 'Tarefa salva, mas não foi possível atualizar o requisito.')
        );
      }

      try {
        if (selectedPullRequestId) {
          await linkTaskToPullRequest(savedTask.id, selectedPullRequestId);
        } else if (hadPullRequestLinked) await unlinkTaskFromPullRequest(savedTask.id);
      } catch (requestError) {
        warnings.push(
          getErrorMessage(
            requestError,
            'Tarefa salva, mas não foi possível atualizar o pull request.'
          )
        );
      }

      try {
        for (const commitId of selectedCommitIds.filter((id) => !previousCommitIds.includes(id))) {
          await linkTaskCommit(savedTask.id, commitId);
        }
        for (const commitId of previousCommitIds.filter((id) => !selectedCommitIds.includes(id))) {
          await unlinkTaskCommit(savedTask.id, commitId);
        }
      } catch (requestError) {
        warnings.push(
          getErrorMessage(requestError, 'Tarefa salva, mas os commits não foram todos atualizados.')
        );
      }

      try {
        for (const issueId of selectedIssueIds.filter((id) => !previousIssueIds.includes(id))) {
          await linkTaskIssue(savedTask.id, issueId);
        }
        for (const issueId of previousIssueIds.filter((id) => !selectedIssueIds.includes(id))) {
          await unlinkTaskIssue(savedTask.id, issueId);
        }
      } catch (requestError) {
        warnings.push(
          getErrorMessage(requestError, 'Tarefa salva, mas as issues não foram todas atualizadas.')
        );
      }

      setSuccess(response.data.message || 'Tarefa salva com sucesso.');
      setWarning(warnings.join(' '));
      setFormOpen(false);
      setEditingTaskId(null);
      setFormData(emptyTaskForm);
      clearCommitSearch();
      await loadTaskData({ showLoading: false });
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível salvar a tarefa.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function openTaskDetails(task, trigger) {
    detailsReturnFocusRef.current = trigger;
    setSelectedTask(task);
    setError('');
    const sequence = ++detailsSequenceRef.current;
    detailsControllerRef.current?.abort();
    const controller = new AbortController();
    detailsControllerRef.current = controller;
    try {
      const response = await tasksApi.get(task.id, { signal: controller.signal, fresh: true });
      if (controller.signal.aborted || sequence !== detailsSequenceRef.current) return;
      if (String(response.data.task.projectId) === String(projectId)) {
        setSelectedTask(response.data.task);
      }
    } catch (requestError) {
      if (controller.signal.aborted || sequence !== detailsSequenceRef.current) return;
      setWarning(
        getErrorMessage(requestError, 'Os detalhes mais recentes não puderam ser carregados.')
      );
    }
  }

  function closeTaskDetails() {
    detailsSequenceRef.current += 1;
    detailsControllerRef.current?.abort();
    setSelectedTask(null);
  }

  async function handleDeleteTask(task) {
    const confirmed = await confirm({
      title: 'Excluir tarefa',
      description:
        'Esta ação não poderá ser desfeita. Os vínculos e as movimentações do Kanban serão removidos, mas os artefatos importados do GitHub serão mantidos.',
      confirmLabel: 'Excluir tarefa'
    });
    if (!confirmed) return;

    setDeletingTaskId(task.id);
    setError('');
    setWarning('');
    setSuccess('');
    try {
      const response = await deleteTask(task.id);
      if (String(selectedTask?.id) === String(task.id)) closeTaskDetails();
      if (String(editingTaskId) === String(task.id)) closeForm();
      setTasks((current) => current.filter((item) => String(item.id) !== String(task.id)));
      setSuccess(response.message || 'Tarefa excluída com sucesso.');
      await loadTaskData({ showLoading: false });
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível excluir a tarefa.'));
    } finally {
      setDeletingTaskId(null);
    }
  }

  async function handleDetailsSave(task, payload) {
    const response = await tasksApi.update(task.id, payload);
    return response.data.task;
  }

  function handleDetailsSaved(updatedTask, outcome = {}) {
    setTasks((current) =>
      current.map((task) => (String(task.id) === String(updatedTask.id) ? updatedTask : task))
    );
    setSelectedTask(updatedTask);
    setError('');
    setSuccess(outcome.successMessage || 'Tarefa atualizada com sucesso.');
    setWarning(outcome.warning || '');
    void loadTaskData({ showLoading: false });
    return updatedTask;
  }

  const editingTask = editingTaskId
    ? tasks.find((task) => String(task.id) === String(editingTaskId))
    : null;
  const selectedRequirement =
    requirementOptions.find(
      (requirement) => String(requirement.id) === String(formData.requirementId)
    ) || editingTask?.requirement;
  const selectedPullRequest =
    pullRequestOptions.find(
      (pullRequest) => String(pullRequest.id) === String(formData.pullRequestId)
    ) || editingTask?.pullRequest;
  const selectedCommits = (formData.commitIds || [])
    .map(
      (id) =>
        commitOptions.find((commit) => String(commit.id) === String(id)) ||
        editingTask?.commits?.find((commit) => String(commit.id) === String(id))
    )
    .filter(Boolean);
  const selectedIssues = (formData.issueIds || [])
    .map(
      (id) =>
        issueOptions.find((issue) => String(issue.id) === String(id)) ||
        editingTask?.issues?.find((issue) => String(issue.id) === String(id))
    )
    .filter(Boolean);

  const filteredTasks = useMemo(() => {
    const query = normalized(filters.search).replace(/^task-?/, '');
    return tasks.filter((task) => {
      const searchMatch =
        !query || String(task.id).includes(query) || normalized(task.title).includes(query);
      const responsibleId = task.responsibleUser?.id || task.responsibleUserId;
      return (
        searchMatch &&
        (!filters.status || task.status === filters.status) &&
        (!filters.priority || task.priority === filters.priority) &&
        (!filters.responsibleUserId ||
          String(responsibleId) === String(filters.responsibleUserId)) &&
        (!filters.sprintId ||
          (filters.sprintId === 'backlog'
            ? !task.sprintId
            : String(task.sprintId || '') === String(filters.sprintId)))
      );
    });
  }, [filters, tasks]);
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  if (!loading && !project && pageError) {
    return (
      <ContextualErrorPage
        type={classifyPageError(pageError)}
        description={pageError.message}
        requestId={getErrorRequestId(pageError)}
        retryAfterSeconds={pageError.retryAfterSeconds}
        onRetry={() => void loadTaskData()}
      />
    );
  }

  return (
    <main className="page-container tasks-screen">
      <div className="tasks-content" inert={formOpen || selectedTask ? true : undefined}>
        <header className="page-header tasks-header">
          <div>
            <span className="eyebrow">Tarefas</span>
            <h1>Tarefas</h1>
            <p>Organize e acompanhe as atividades do projeto.</p>
          </div>
          <ProjectSectionNav projectId={projectId} activeSection="tasks" />
        </header>

        <FeedbackRegion error={error} success={success} />
        <FeedbackRegion warning={warning} />

        {loading ? (
          <LoadingState message="Carregando tarefas..." />
        ) : (
          <>
            <TaskMetrics tasks={tasks} />

            <CollapsibleFilterPanel
              id="tasks-filters"
              className="tasks-filters"
              resultLabel={
                activeFilterCount
                  ? `${filteredTasks.length} de ${tasks.length} tarefas`
                  : `${tasks.length} ${tasks.length === 1 ? 'tarefa' : 'tarefas'}`
              }
              activeCount={activeFilterCount}
            >
              {activeFilterCount > 0 && (
                <div className="planning-filter-panel__actions">
                  <button
                    type="button"
                    className="tasks-filters__clear"
                    onClick={() => setFilters({ ...EMPTY_FILTERS })}
                  >
                    Limpar filtros
                  </button>
                </div>
              )}
              <div className="tasks-filter-grid">
                <label className="tasks-filter tasks-filter--search">
                  <span>Buscar tarefa</span>
                  <input
                    type="search"
                    placeholder="TASK-id ou título"
                    value={filters.search}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, search: event.target.value }))
                    }
                  />
                </label>
                <label className="tasks-filter">
                  <span>Status</span>
                  <SelectControl
                    value={filters.status}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, status: event.target.value }))
                    }
                  >
                    <option value="">Todos</option>
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </SelectControl>
                </label>
                <label className="tasks-filter">
                  <span>Prioridade</span>
                  <SelectControl
                    value={filters.priority}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, priority: event.target.value }))
                    }
                  >
                    <option value="">Todas</option>
                    {Object.entries(priorityLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </SelectControl>
                </label>
                <ResponsibleCombobox
                  members={projectMembers}
                  value={filters.responsibleUserId}
                  onChange={(value) =>
                    setFilters((current) => ({ ...current, responsibleUserId: value }))
                  }
                />
                <label className="tasks-filter">
                  <span>Sprint</span>
                  <SelectControl
                    value={filters.sprintId}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, sprintId: event.target.value }))
                    }
                  >
                    <option value="">Todas</option>
                    <option value="backlog">Backlog</option>
                    {sprints.map((sprint) => (
                      <option key={sprint.id} value={sprint.id}>
                        {sprint.name}
                      </option>
                    ))}
                  </SelectControl>
                </label>
              </div>
            </CollapsibleFilterPanel>

            <TaskList
              tasks={filteredTasks}
              sprints={sprints}
              milestones={milestones}
              deletingTaskId={deletingTaskId}
              canWrite={canWrite}
              filtered={activeFilterCount > 0}
              onCreate={openCreate}
              onOpen={openTaskDetails}
              onEdit={startEditing}
              onDelete={handleDeleteTask}
            />
          </>
        )}
      </div>

      <SprintDialog
        open={formOpen}
        size="large"
        className="task-form-dialog"
        title={editingTaskId ? 'Editar tarefa' : 'Nova tarefa'}
        description={
          editingTaskId
            ? `Atualize os dados de TASK-${editingTaskId}.`
            : 'Cadastre uma nova atividade e seus vínculos iniciais.'
        }
        busy={submitting}
        returnFocusRef={formReturnFocusRef}
        onClose={closeForm}
      >
        <FeedbackRegion error={error} />
        <TaskForm
          formData={formData}
          onChange={handleFormChange}
          onSubmit={handleSubmit}
          onCancel={closeForm}
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
          onClearRequirement={() => handleFormChange('requirementId', '')}
          onSelectPullRequest={handleSelectPullRequest}
          onClearPullRequest={() => handleFormChange('pullRequestId', '')}
          onSelectCommit={handleSelectCommit}
          onRemoveCommit={(id) =>
            setFormData((current) => ({
              ...current,
              commitIds: current.commitIds.filter((currentId) => String(currentId) !== String(id))
            }))
          }
          onSuggestionConfirmed={handleSuggestionConfirmed}
          projectId={projectId}
          taskId={editingTaskId}
          onSelectIssue={handleSelectIssue}
          onRemoveIssue={(id) =>
            setFormData((current) => ({
              ...current,
              issueIds: current.issueIds.filter((currentId) => String(currentId) !== String(id))
            }))
          }
        />
      </SprintDialog>

      {selectedTask && (
        <TaskDetailsPanel
          key={selectedTask.id}
          projectId={projectId}
          task={selectedTask}
          members={projectMembers}
          canEdit={canWrite}
          canDelete={canWrite}
          deleting={deletingTaskId === selectedTask.id}
          returnFocusRef={detailsReturnFocusRef}
          onClose={closeTaskDetails}
          onDelete={handleDeleteTask}
          onSave={handleDetailsSave}
          onSaved={handleDetailsSaved}
        />
      )}
    </main>
  );
}
