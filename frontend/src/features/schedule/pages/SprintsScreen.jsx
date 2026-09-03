import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ProjectSectionNav } from '../../projects/index.js';
import {
  ErrorState,
  FeedbackRegion,
  ForbiddenState,
  LoadingState,
  normalizeApiError,
  useAbortableRequest,
  useConfirm
} from '../../../shared/index.js';
import { scheduleApi } from '../api/schedule.api.js';
import { SprintDialog } from '../components/SprintDialog.jsx';
import { SprintFilters } from '../components/SprintFilters.jsx';
import { SprintForm, emptySprintForm, validateSprintForm } from '../components/SprintForm.jsx';
import { SprintList } from '../components/SprintList.jsx';
import { SprintProgressPanel } from '../components/SprintProgressPanel.jsx';
import { SprintTasksPanel } from '../components/SprintTasksPanel.jsx';
import { SprintsSummary } from '../components/SprintsSummary.jsx';
import {
  fromDateTimeLocalInput,
  isTerminalTransition,
  sprintTerminalConfirm,
  toDateTimeLocalInput
} from '../components/schedule-display.js';
import {
  filterSprints,
  hasSprintFilters,
  SPRINT_FILTER_DEFAULTS
} from '../components/sprint-view.js';
import { useScheduleData } from '../hooks/useScheduleData.js';
import '../styles/schedule.css';
import './SprintsScreen.css';

const FORM_DIALOGS = new Set(['create', 'edit']);

export function SprintsScreen() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { run: runTasksRequest, cancel: cancelTasksRequest } = useAbortableRequest();
  const { run: runProgressRequest, cancel: cancelProgressRequest } = useAbortableRequest();
  const dialogReturnFocusRef = useRef(null);
  const gridRef = useRef(null);
  const selectedSprintRef = useRef(null);

  const {
    schedule,
    sprints,
    milestones,
    setSprints,
    somenteLeitura,
    loading,
    forbidden,
    error,
    success,
    staleWarning,
    loadAll,
    refreshSchedule,
    refreshSprints,
    refreshMilestones,
    handleFailure,
    warn,
    settle
  } = useScheduleData(projectId);

  const [dialog, setDialog] = useState(null);
  const [sprintForm, setSprintForm] = useState(emptySprintForm);
  const [sprintErrors, setSprintErrors] = useState({});
  const [formTasks, setFormTasks] = useState([]);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [busySprintId, setBusySprintId] = useState(null);

  const [sprintTasks, setSprintTasks] = useState([]);
  const [tasksProgress, setTasksProgress] = useState(null);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState('');

  const [progress, setProgress] = useState(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressError, setProgressError] = useState('');

  const [filters, setFilters] = useState({ ...SPRINT_FILTER_DEFAULTS });
  const [selectedFilterTask, setSelectedFilterTask] = useState(null);

  const sprintNames = useMemo(
    () => Object.fromEntries(sprints.map((item) => [item.id, item.name])),
    [sprints]
  );
  const milestoneNames = useMemo(
    () => Object.fromEntries(milestones.map((item) => [item.id, item.title])),
    [milestones]
  );
  const scheduleById = useMemo(
    () => Object.fromEntries((schedule?.sprints || []).map((item) => [item.id, item])),
    [schedule]
  );
  const activeSprint = useMemo(
    () => sprints.find((item) => item.status === 'EM_ANDAMENTO') || null,
    [sprints]
  );
  const selectedFilterMilestone = useMemo(
    () => milestones.find((item) => Number(item.id) === Number(filters.milestoneId)) || null,
    [filters.milestoneId, milestones]
  );
  const visibleSprints = useMemo(
    () => filterSprints(sprints, filters, scheduleById),
    [filters, scheduleById, sprints]
  );
  const filtersActive = hasSprintFilters(filters);
  const dialogSprint = dialog?.sprint || null;

  const searchProjectTasks = useCallback(
    async (query, signal) => {
      const response = await scheduleApi.listProjectTasks(projectId, { search: query }, { signal });
      return response.data.tasks || [];
    },
    [projectId]
  );

  const closeDialog = useCallback(() => {
    selectedSprintRef.current = null;
    cancelTasksRequest();
    cancelProgressRequest();
    setDialog(null);
    setFormError('');
    setTasksError('');
    setProgressError('');
  }, [cancelProgressRequest, cancelTasksRequest]);

  function rememberTrigger(trigger) {
    dialogReturnFocusRef.current = trigger || document.activeElement;
  }

  function openCreate(trigger) {
    rememberTrigger(trigger);
    setSprintForm(emptySprintForm);
    setSprintErrors({});
    setFormTasks([]);
    setFormError('');
    setDialog({ type: 'create' });
  }

  function openEdit(sprint, trigger) {
    rememberTrigger(trigger);
    setSprintForm({
      name: sprint.name || '',
      objective: sprint.objective || '',
      startDate: toDateTimeLocalInput(sprint.startDate),
      endDate: toDateTimeLocalInput(sprint.endDate),
      milestoneId: sprint.milestoneId ? String(sprint.milestoneId) : ''
    });
    setSprintErrors({});
    setFormTasks(scheduleById[sprint.id]?.tasks || []);
    setFormError('');
    setDialog({ type: 'edit', sprint });
  }

  const loadTasksDialog = useCallback(
    async (sprint) => {
      selectedSprintRef.current = sprint.id;
      setTasksLoading(true);
      setTasksError('');
      setSprintTasks([]);
      setTasksProgress(null);
      try {
        const result = await runTasksRequest(async (signal) => {
          const [tasksResponse, progressResponse] = await Promise.all([
            scheduleApi.listSprintTasks(sprint.id, { signal }),
            scheduleApi.getSprintProgress(sprint.id, { signal })
          ]);
          return { tasks: tasksResponse.data.tasks || [], progress: progressResponse.data };
        });
        if (!result || selectedSprintRef.current !== sprint.id) return;
        setSprintTasks(result.tasks);
        setTasksProgress(result.progress);
      } catch (requestError) {
        if (selectedSprintRef.current !== sprint.id) return;
        setTasksError(
          normalizeApiError(requestError, 'Não foi possível carregar as tarefas da sprint.').message
        );
      } finally {
        if (selectedSprintRef.current === sprint.id) setTasksLoading(false);
      }
    },
    [runTasksRequest]
  );

  function openTasks(sprint, trigger) {
    rememberTrigger(trigger);
    setDialog({ type: 'tasks', sprint });
    void loadTasksDialog(sprint);
  }

  const loadProgressDialog = useCallback(
    async (sprint) => {
      selectedSprintRef.current = sprint.id;
      setProgress(null);
      setProgressError('');
      setProgressLoading(true);
      try {
        const response = await runProgressRequest((signal) =>
          scheduleApi.getSprintProgress(sprint.id, { signal })
        );
        if (!response || selectedSprintRef.current !== sprint.id) return;
        setProgress(response.data);
      } catch (requestError) {
        if (selectedSprintRef.current !== sprint.id) return;
        setProgressError(
          normalizeApiError(requestError, 'Não foi possível calcular a evolução da sprint.').message
        );
      } finally {
        if (selectedSprintRef.current === sprint.id) setProgressLoading(false);
      }
    },
    [runProgressRequest]
  );

  function openProgress(sprint, trigger) {
    rememberTrigger(trigger);
    setDialog({ type: 'progress', sprint });
    void loadProgressDialog(sprint);
  }

  async function submitSprint(event) {
    event.preventDefault();
    const editing = dialog?.type === 'edit';
    const editingId = editing ? dialog.sprint.id : null;
    const errors = validateSprintForm(sprintForm, { editing });
    setSprintErrors(errors);
    setFormError('');
    if (Object.keys(errors).length) {
      const firstField = ['name', 'milestoneId', 'startDate', 'endDate'].find(
        (field) => errors[field]
      );
      const elementId =
        firstField === 'name'
          ? 'sprint-name'
          : firstField === 'milestoneId'
            ? 'sprint-milestoneId'
            : `sprint-${firstField}`;
      queueMicrotask(() => document.getElementById(elementId)?.focus());
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: sprintForm.name.trim(),
        objective: sprintForm.objective.trim() || null,
        startDate: fromDateTimeLocalInput(sprintForm.startDate),
        endDate: fromDateTimeLocalInput(sprintForm.endDate),
        milestoneId: sprintForm.milestoneId ? Number(sprintForm.milestoneId) : null
      };
      const response = editing
        ? await scheduleApi.updateSprint(editingId, payload)
        : await scheduleApi.createSprint(projectId, payload);
      const savedSprint = response.data.sprint || null;
      const targetId = editingId || savedSprint?.id || null;

      if (savedSprint) {
        setSprints((current) => {
          const exists = current.some((item) => item.id === savedSprint.id);
          return exists
            ? current.map((item) => (item.id === savedSprint.id ? savedSprint : item))
            : [...current, savedSprint];
        });
      }

      const originalTaskIds = editing
        ? (scheduleById[editingId]?.tasks || []).map((task) => Number(task.id))
        : [];
      const nextTaskIds = formTasks.map((task) => Number(task.id));
      const tasksChanged =
        nextTaskIds.length !== originalTaskIds.length ||
        nextTaskIds.some((taskId) => !originalTaskIds.includes(taskId));
      let taskAssociationFailed = false;

      if (tasksChanged && targetId) {
        try {
          await scheduleApi.replaceSprintTasks(targetId, nextTaskIds);
        } catch {
          taskAssociationFailed = true;
        }
      } else if (tasksChanged && !targetId) {
        taskAssociationFailed = true;
      }

      setDialog(null);
      setSprintForm(emptySprintForm);
      setFormTasks([]);
      setSprintErrors({});
      const refresh = () => Promise.all([refreshSprints(), refreshSchedule()]);
      if (taskAssociationFailed) {
        warn('Sprint salva, mas não foi possível atualizar suas tarefas. Revise a composição.');
        try {
          await refresh();
        } catch {
          warn(
            'Sprint salva, mas as tarefas e os dados exibidos não puderam ser atualizados. Recarregue a página.'
          );
        }
      } else {
        await settle(
          editing ? 'Sprint atualizada com sucesso.' : 'Sprint criada com sucesso.',
          refresh
        );
      }
    } catch (requestError) {
      setFormError(normalizeApiError(requestError, 'Não foi possível salvar a sprint.').message);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitSprintTasks(taskIds) {
    const sprint = dialogSprint;
    if (!sprint) return;
    const sprintId = sprint.id;
    setSubmitting(true);
    setTasksError('');
    try {
      await scheduleApi.replaceSprintTasks(sprintId, taskIds);
      setDialog(null);
      await settle(`Tarefas da sprint "${sprint.name}" atualizadas com sucesso.`, () =>
        refreshSchedule()
      );
    } catch (requestError) {
      if (selectedSprintRef.current !== sprintId) return;
      setTasksError(
        normalizeApiError(requestError, 'Não foi possível atualizar as tarefas da sprint.').message
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function changeSprintStatus(sprint, status) {
    if (isTerminalTransition(status)) {
      const pending = (scheduleById[sprint.id]?.tasks || []).filter(
        (task) => task.status !== 'CONCLUIDO'
      ).length;
      const confirmed = await confirm(sprintTerminalConfirm(sprint, status, pending));
      if (!confirmed) return;
    }

    setBusySprintId(sprint.id);
    try {
      const { data } = await scheduleApi.updateSprintStatus(sprint.id, status);
      if (data.sprint) {
        setSprints((current) =>
          current.map((item) => (item.id === sprint.id ? data.sprint : item))
        );
      }
      await settle(data.message || 'Status da sprint atualizado com sucesso.', () =>
        Promise.all([
          refreshSchedule(),
          data.milestoneCompleted ? refreshMilestones() : Promise.resolve()
        ])
      );
    } catch (requestError) {
      handleFailure(requestError, 'Não foi possível atualizar o status da sprint.');
    } finally {
      setBusySprintId(null);
    }
  }

  function changeFilter(field, value, selectedOption) {
    setFilters((current) => ({ ...current, [field]: value }));
    if (field === 'taskId') setSelectedFilterTask(selectedOption || null);
  }

  function clearFilters() {
    setFilters({ ...SPRINT_FILTER_DEFAULTS });
    setSelectedFilterTask(null);
  }

  if (loading) {
    return (
      <main className="page-container sprints-screen">
        <LoadingState message="Carregando sprints..." />
      </main>
    );
  }

  if (forbidden) {
    return (
      <main className="page-container sprints-screen">
        <ForbiddenState message="Você não possui acesso ao cronograma deste projeto." />
      </main>
    );
  }

  if (error && !sprints.length) {
    return (
      <main className="page-container sprints-screen">
        <ErrorState message={error} onRetry={() => loadAll()} />
      </main>
    );
  }

  return (
    <main className="page-container sprints-screen">
      <header className="page-header sprints-screen__header">
        <div>
          <span className="eyebrow">Planejamento</span>
          <h1>Sprints</h1>
          <p>
            Organize períodos de trabalho, acompanhe o progresso e consulte a evolução das entregas.
          </p>
        </div>
        <ProjectSectionNav projectId={projectId} activeSection="sprints" />
      </header>

      <FeedbackRegion error={error} success={success} warning={staleWarning} />
      <SprintsSummary sprints={sprints} scheduleById={scheduleById} />
      <SprintFilters
        filters={filters}
        milestones={milestones}
        selectedMilestone={selectedFilterMilestone}
        selectedTask={selectedFilterTask}
        total={sprints.length}
        filteredTotal={visibleSprints.length}
        onChange={changeFilter}
        onTaskSearch={searchProjectTasks}
        onClear={clearFilters}
      />
      <SprintList
        sprints={visibleSprints}
        scheduleById={scheduleById}
        milestoneNames={milestoneNames}
        busySprintId={busySprintId}
        activeSprintName={activeSprint?.name || ''}
        readOnly={somenteLeitura}
        filtered={filtersActive}
        onCreate={openCreate}
        onTasks={openTasks}
        onProgress={openProgress}
        onEdit={openEdit}
        onChangeStatus={changeSprintStatus}
        onViewInKanban={(sprint) => navigate(`/projects/${projectId}/kanban?sprint=${sprint.id}`)}
        listRef={gridRef}
      />

      <SprintDialog
        open={FORM_DIALOGS.has(dialog?.type)}
        title={dialog?.type === 'edit' ? 'Editar sprint' : 'Criar sprint'}
        description={
          dialog?.type === 'edit'
            ? 'Atualize os dados e a composição da sprint enquanto ela estiver aberta.'
            : 'Defina o período, o marco e as tarefas que entram no planejamento inicial.'
        }
        initialFocusSelector="#sprint-name"
        returnFocusRef={dialogReturnFocusRef}
        busy={submitting}
        onClose={closeDialog}
      >
        {formError && <ErrorState message={formError} />}
        <SprintForm
          formData={sprintForm}
          milestones={milestones}
          selectedTasks={formTasks}
          sprintNames={sprintNames}
          editingSprintId={dialog?.type === 'edit' ? dialog.sprint.id : null}
          errors={sprintErrors}
          editing={dialog?.type === 'edit'}
          submitting={submitting}
          onChange={(field, value) => setSprintForm((current) => ({ ...current, [field]: value }))}
          onTasksChange={setFormTasks}
          onTaskSearch={searchProjectTasks}
          onSubmit={submitSprint}
          onCancel={closeDialog}
        />
      </SprintDialog>

      <SprintDialog
        open={dialog?.type === 'tasks'}
        title={`Tarefas da ${dialogSprint?.name || 'sprint'}`}
        description="Consulte o planejamento, as mudanças de escopo e a composição atual."
        size="large"
        returnFocusRef={dialogReturnFocusRef}
        busy={submitting}
        onClose={closeDialog}
      >
        {tasksError ? (
          <ErrorState message={tasksError} onRetry={() => loadTasksDialog(dialogSprint)} />
        ) : (
          dialogSprint && (
            <SprintTasksPanel
              sprint={dialogSprint}
              sprintTasks={sprintTasks}
              sprintNames={sprintNames}
              progress={tasksProgress}
              loading={tasksLoading}
              submitting={submitting}
              readOnly={somenteLeitura}
              onTaskSearch={searchProjectTasks}
              onSubmit={submitSprintTasks}
              onCancel={closeDialog}
            />
          )
        )}
      </SprintDialog>

      <SprintDialog
        open={dialog?.type === 'progress'}
        title={`Evolução da ${dialogSprint?.name || 'sprint'}`}
        description="Indicadores de progresso, mudanças de escopo e burndown do período."
        size="wide"
        returnFocusRef={dialogReturnFocusRef}
        onClose={closeDialog}
      >
        {progressError ? (
          <ErrorState message={progressError} onRetry={() => loadProgressDialog(dialogSprint)} />
        ) : (
          dialogSprint && (
            <SprintProgressPanel
              sprint={dialogSprint}
              scheduleSprint={scheduleById[dialogSprint.id]}
              progress={progress}
              loading={progressLoading}
              onClose={closeDialog}
            />
          )
        )}
      </SprintDialog>
    </main>
  );
}
