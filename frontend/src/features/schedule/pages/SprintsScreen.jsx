import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { scheduleApi } from '../api/schedule.api.js';
import { ProjectSectionNav } from '../../projects/index.js';
import {
  FeedbackRegion,
  LoadingState,
  ErrorState,
  ForbiddenState,
  useAbortableRequest,
  useConfirm
} from '../../../shared/index.js';
import { SprintForm, emptySprintForm, validateSprintForm } from '../components/SprintForm.jsx';
import { SprintList } from '../components/SprintList.jsx';
import { SprintTasksPanel } from '../components/SprintTasksPanel.jsx';
import { SprintProgressPanel } from '../components/SprintProgressPanel.jsx';
import {
  fromDateTimeLocalInput,
  isTerminalTransition,
  sprintTerminalConfirm,
  toDateTimeLocalInput
} from '../components/schedule-display.js';
import { useScheduleData } from '../hooks/useScheduleData.js';

export function SprintsScreen() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const sprintTasksRequest = useAbortableRequest();
  const progressRequest = useAbortableRequest();
  const formTasksRequest = useAbortableRequest();
  const selectedSprintRef = useRef(null);
  const progressSprintRef = useRef(null);
  const formCardRef = useRef(null);
  const formTasksCarregadasRef = useRef(false);

  const {
    project,
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
    settle
  } = useScheduleData(projectId);

  const [sprintForm, setSprintForm] = useState(emptySprintForm);
  const [sprintErrors, setSprintErrors] = useState({});
  const [editingSprintId, setEditingSprintId] = useState(null);
  const [formTaskIds, setFormTaskIds] = useState([]);
  const [formTasksLoading, setFormTasksLoading] = useState(false);

  const [selectedSprint, setSelectedSprint] = useState(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [projectTasks, setProjectTasks] = useState([]);
  const [sprintTasks, setSprintTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [progressSprint, setProgressSprint] = useState(null);
  const [progress, setProgress] = useState(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busySprintId, setBusySprintId] = useState(null);

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

  useEffect(() => {
    if (loading) {
      formTasksCarregadasRef.current = false;
      return;
    }
    if (somenteLeitura || formTasksCarregadasRef.current) return;
    formTasksCarregadasRef.current = true;
    setFormTasksLoading(true);
    formTasksRequest
      .run((signal) => scheduleApi.listProjectTasks(projectId, { signal }))
      .then((resposta) => {
        if (resposta) setProjectTasks(resposta.data.tasks || []);
      })
      .catch((requestError) => {
        handleFailure(requestError, 'Não foi possível carregar as tarefas do projeto.');
      })
      .finally(() => setFormTasksLoading(false));
  }, [loading, somenteLeitura, projectId, formTasksRequest, handleFailure]);

  const submitSprint = async (event) => {
    event.preventDefault();
    const errors = validateSprintForm(sprintForm, { editing: Boolean(editingSprintId) });
    setSprintErrors(errors);
    if (Object.keys(errors).length) return;

    setSubmitting(true);
    try {
      const payload = {
        name: sprintForm.name.trim(),
        objective: sprintForm.objective.trim() || null,
        startDate: fromDateTimeLocalInput(sprintForm.startDate),
        endDate: fromDateTimeLocalInput(sprintForm.endDate),
        milestoneId: sprintForm.milestoneId ? Number(sprintForm.milestoneId) : null
      };
      let alvoId = editingSprintId;
      if (editingSprintId) {
        await scheduleApi.updateSprint(editingSprintId, payload);
      } else {
        const { data } = await scheduleApi.createSprint(projectId, payload);
        alvoId = data.sprint?.id ?? null;
      }

      const originais = editingSprintId
        ? (scheduleById[editingSprintId]?.tasks || []).map((task) => task.id)
        : [];
      const mudouTarefas =
        formTaskIds.length !== originais.length ||
        formTaskIds.some((id) => !originais.includes(id));
      let avisoTarefas = null;
      if (alvoId && mudouTarefas) {
        try {
          await scheduleApi.replaceSprintTasks(alvoId, formTaskIds);
        } catch (requestError) {
          avisoTarefas = requestError;
        }
      }

      setSprintForm(emptySprintForm);
      setEditingSprintId(null);
      setFormTaskIds([]);
      const atualizar = () => Promise.all([refreshSprints(), refreshSchedule()]);
      if (avisoTarefas) {
        handleFailure(
          avisoTarefas,
          'Sprint salva, mas não foi possível atualizar as tarefas da sprint.'
        );
        await atualizar().catch(() => {});
      } else {
        await settle(
          editingSprintId ? 'Sprint atualizada com sucesso.' : 'Sprint cadastrada com sucesso.',
          atualizar
        );
      }
    } catch (requestError) {
      handleFailure(requestError, 'Não foi possível salvar a sprint.');
    } finally {
      setSubmitting(false);
    }
  };

  const editSprint = (sprint) => {
    setEditingSprintId(sprint.id);
    setSprintErrors({});
    setSprintForm({
      name: sprint.name || '',
      objective: sprint.objective || '',
      startDate: toDateTimeLocalInput(sprint.startDate),
      endDate: toDateTimeLocalInput(sprint.endDate),
      milestoneId: sprint.milestoneId ? String(sprint.milestoneId) : ''
    });
    setFormTaskIds((scheduleById[sprint.id]?.tasks || []).map((task) => task.id));
  };

  useEffect(() => {
    if (!editingSprintId) return;
    formCardRef.current?.querySelector('input, select, textarea')?.focus();
  }, [editingSprintId]);

  const changeSprintStatus = async (sprint, status) => {
    if (isTerminalTransition(status)) {
      const pendentes = (scheduleById[sprint.id]?.tasks || []).filter(
        (task) => task.status !== 'CONCLUIDO'
      ).length;
      const confirmed = await confirm(sprintTerminalConfirm(sprint, status, pendentes));
      if (!confirmed) return;
    }

    setBusySprintId(sprint.id);
    try {
      const { data } = await scheduleApi.updateSprintStatus(sprint.id, status);
      setSprints((current) => current.map((item) => (item.id === sprint.id ? data.sprint : item)));
      if (selectedSprint?.id === sprint.id) setSelectedSprint(data.sprint);
      await settle(data.message, () =>
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
  };

  const selectSprint = async (sprint) => {
    if (selectedSprint?.id === sprint.id) {
      selectedSprintRef.current = null;
      sprintTasksRequest.cancel();
      setSelectedSprint(null);
      return;
    }
    selectedSprintRef.current = sprint.id;
    setSelectedSprint(sprint);
    setSelectedTaskIds([]);
    setSprintTasks([]);
    setTasksLoading(true);
    try {
      const resultado = await sprintTasksRequest.run(async (signal) => {
        const [projeto, daSprint] = await Promise.all([
          projectTasks.length ? null : scheduleApi.listProjectTasks(projectId, { signal }),
          scheduleApi.listSprintTasks(sprint.id, { signal })
        ]);
        return { projeto, daSprint };
      });
      if (!resultado || selectedSprintRef.current !== sprint.id) return;
      if (resultado.projeto) setProjectTasks(resultado.projeto.data.tasks || []);
      const tarefas = resultado.daSprint.data.tasks || [];
      setSprintTasks(tarefas);
      setSelectedTaskIds(tarefas.map((task) => task.id));
    } catch (requestError) {
      if (selectedSprintRef.current !== sprint.id) return;
      selectedSprintRef.current = null;
      setSelectedSprint(null);
      handleFailure(requestError, 'Não foi possível carregar as tarefas da sprint.');
    } finally {
      if (selectedSprintRef.current === sprint.id) setTasksLoading(false);
    }
  };

  const showProgress = async (sprint) => {
    if (progressSprint?.id === sprint.id) {
      progressSprintRef.current = null;
      progressRequest.cancel();
      setProgressSprint(null);
      setProgress(null);
      return;
    }
    progressSprintRef.current = sprint.id;
    setProgressSprint(sprint);
    setProgress(null);
    setProgressLoading(true);
    try {
      const resposta = await progressRequest.run((signal) =>
        scheduleApi.getSprintProgress(sprint.id, { signal })
      );
      if (!resposta || progressSprintRef.current !== sprint.id) return;
      setProgress(resposta.data);
    } catch (requestError) {
      if (progressSprintRef.current !== sprint.id) return;
      progressSprintRef.current = null;
      setProgressSprint(null);
      handleFailure(requestError, 'Não foi possível calcular a evolução da sprint.');
    } finally {
      if (progressSprintRef.current === sprint.id) setProgressLoading(false);
    }
  };

  const submitSprintTasks = async (taskIds) => {
    const sprintId = selectedSprint.id;
    const sprintName = selectedSprint.name;
    setSubmitting(true);
    try {
      await scheduleApi.replaceSprintTasks(sprintId, taskIds);
      await settle(`Tarefas da sprint "${sprintName}" atualizadas com sucesso.`, async () => {
        await refreshSchedule();
        if (selectedSprintRef.current !== sprintId) return;

        const resultado = await sprintTasksRequest.run((signal) =>
          scheduleApi.listSprintTasks(sprintId, { signal })
        );
        if (!resultado || selectedSprintRef.current !== sprintId) return;
        const tarefas = resultado.data.tasks || [];
        setSprintTasks(tarefas);
        setSelectedTaskIds(tarefas.map((task) => task.id));
      });
    } catch (requestError) {
      if (selectedSprintRef.current !== sprintId) return;
      handleFailure(requestError, 'Não foi possível atualizar as tarefas da sprint.');
    } finally {
      setSubmitting(false);
    }
  };

  const viewInKanban = (sprint) => navigate(`/projects/${projectId}/kanban?sprint=${sprint.id}`);

  if (loading) {
    return (
      <main className="page-container">
        <LoadingState message="Carregando sprints..." />
      </main>
    );
  }

  if (forbidden) {
    return (
      <main className="page-container">
        <ForbiddenState message="Você não possui acesso ao cronograma deste projeto." />
      </main>
    );
  }

  if (error && !sprints.length) {
    return (
      <main className="page-container">
        <ErrorState message={error} onRetry={() => loadAll()} />
      </main>
    );
  }

  const concluidas = sprints.filter((item) => item.status === 'CONCLUIDA').length;

  return (
    <main className="page-container">
      <header className="page-header">
        <div>
          <span className="eyebrow">Planejamento</span>
          <h1>Sprints{project ? ` — ${project.name}` : ''}</h1>
          <p>
            Planeje, inicie e conclua sprints. Apenas uma sprint pode estar em andamento por vez.
          </p>
        </div>
        <ProjectSectionNav projectId={projectId} activeSection="sprints" />
      </header>
      <FeedbackRegion error={error} success={success} notice={staleWarning} />

      <div className="schedule-columns schedule-columns--unica">
        {!somenteLeitura && (
          <section className="card" ref={formCardRef}>
            <h2>{editingSprintId ? 'Editar sprint' : 'Cadastrar sprint'}</h2>
            <SprintForm
              formData={sprintForm}
              milestones={milestones}
              tasks={projectTasks}
              sprintNames={sprintNames}
              taskIds={formTaskIds}
              tasksLoading={formTasksLoading}
              editingSprintId={editingSprintId}
              errors={sprintErrors}
              editing={Boolean(editingSprintId)}
              submitting={submitting}
              onChange={(field, value) => setSprintForm({ ...sprintForm, [field]: value })}
              onToggleTask={(taskId) =>
                setFormTaskIds((current) =>
                  current.includes(taskId)
                    ? current.filter((id) => id !== taskId)
                    : [...current, taskId]
                )
              }
              onSubmit={submitSprint}
              onCancel={() => {
                setEditingSprintId(null);
                setSprintForm(emptySprintForm);
                setSprintErrors({});
                setFormTaskIds([]);
                formCardRef.current?.querySelector('input, select, textarea')?.focus();
              }}
            />
          </section>
        )}

        <section className="card">
          <div className="schedule-card-header">
            <h2>Sprints do projeto</h2>
            <span className="agenda-window">
              {sprints.length} {sprints.length === 1 ? 'sprint' : 'sprints'} · {concluidas}{' '}
              {concluidas === 1 ? 'concluída' : 'concluídas'}
            </span>
          </div>

          <SprintList
            sprints={sprints}
            scheduleById={scheduleById}
            milestoneNames={milestoneNames}
            selectedSprintId={selectedSprint?.id}
            busySprintId={busySprintId}
            progressSprintId={progressSprint?.id ?? null}
            activeSprintName={activeSprint?.name || ''}
            readOnly={somenteLeitura}
            onSelect={selectSprint}
            onShowProgress={showProgress}
            onEdit={editSprint}
            onChangeStatus={changeSprintStatus}
            onViewInKanban={viewInKanban}
          />
        </section>

        {progressSprint && (
          <SprintProgressPanel
            sprint={progressSprint}
            scheduleSprint={scheduleById[progressSprint.id]}
            progress={progress}
            loading={progressLoading}
            onClose={() => {
              progressSprintRef.current = null;
              progressRequest.cancel();
              setProgressSprint(null);
              setProgress(null);
            }}
          />
        )}
        {selectedSprint && (
          <SprintTasksPanel
            sprint={selectedSprint}
            tasks={projectTasks}
            sprintTasks={sprintTasks}
            selectedTaskIds={selectedTaskIds}
            sprintNames={sprintNames}
            loading={tasksLoading}
            submitting={submitting}
            readOnly={somenteLeitura}
            onSubmit={submitSprintTasks}
            onCancel={() => {
              selectedSprintRef.current = null;
              sprintTasksRequest.cancel();
              setSelectedSprint(null);
            }}
          />
        )}
      </div>
    </main>
  );
}
