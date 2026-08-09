import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { scheduleApi } from '../api/schedule.api.js';
import { projectsApi, ProjectSectionNav } from '../../projects/index.js';
import {
  FeedbackRegion,
  LoadingState,
  ErrorState,
  ForbiddenState,
  normalizeApiError,
  useAbortableRequest,
  useConfirm
} from '../../../shared/index.js';
import {
  MilestoneForm,
  emptyMilestoneForm,
  validateMilestoneForm
} from '../components/MilestoneForm.jsx';
import { MilestoneList } from '../components/MilestoneList.jsx';
import { ScheduleAgenda } from '../components/ScheduleAgenda.jsx';
import { SprintForm, emptySprintForm, validateSprintForm } from '../components/SprintForm.jsx';
import { SprintList } from '../components/SprintList.jsx';
import { SprintTasksPanel } from '../components/SprintTasksPanel.jsx';
import { SprintProgressPanel } from '../components/SprintProgressPanel.jsx';
import { isTerminalSprint, isTerminalTransition } from '../components/schedule-display.js';

export function ScheduleScreen() {
  const { projectId } = useParams();
  const confirm = useConfirm();
  const { run } = useAbortableRequest();

  const [project, setProject] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [sprints, setSprints] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [projectTasks, setProjectTasks] = useState([]);

  const [period, setPeriod] = useState({ from: '', to: '' });
  const [appliedPeriod, setAppliedPeriod] = useState({ from: '', to: '' });

  const [sprintForm, setSprintForm] = useState(emptySprintForm);
  const [sprintErrors, setSprintErrors] = useState({});
  const [editingSprintId, setEditingSprintId] = useState(null);

  const [milestoneForm, setMilestoneForm] = useState(emptyMilestoneForm);
  const [milestoneErrors, setMilestoneErrors] = useState({});
  const [editingMilestoneId, setEditingMilestoneId] = useState(null);

  const [selectedSprint, setSelectedSprint] = useState(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [progressSprint, setProgressSprint] = useState(null);
  const [progress, setProgress] = useState(null);
  const [progressLoading, setProgressLoading] = useState(false);
  // Nome por id para o painel dizer de QUAL sprint a tarefa sairia. A tarefa só
  // carrega `sprintId`; sem o mapa a origem seria um número sem significado.
  const sprintNames = Object.fromEntries(sprints.map((item) => [item.id, item.name]));

  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [busySprintId, setBusySprintId] = useState(null);
  const [busyMilestoneId, setBusyMilestoneId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const reportFailure = useCallback((requestError, fallback) => {
    const normalized = normalizeApiError(requestError, fallback);
    // 403 e 404 recebem tratamento de acesso negado, como em Tarefas e Kanban.
    if ([403, 404].includes(requestError.response?.status)) setForbidden(true);
    setError(normalized.message);
  }, []);

  // Carga inicial. As tarefas do projeto ficam de fora de proposito: so o painel
  // de associacao precisa delas, e ele as busca sob demanda (ver selectSprint).
  const loadAll = useCallback(
    async (range = appliedPeriod) => {
      setLoading(true);
      setError('');
      setForbidden(false);
      try {
        const result = await run(async (signal) => {
          const [projectResponse, scheduleResponse, sprintsResponse, milestonesResponse] =
            await Promise.all([
              projectsApi.get(projectId, { signal }),
              scheduleApi.getSchedule(projectId, range, { signal }),
              scheduleApi.listSprints(projectId, {}, { signal }),
              scheduleApi.listMilestones(projectId, {}, { signal })
            ]);
          return {
            project: projectResponse.data.project,
            schedule: scheduleResponse.data,
            sprints: sprintsResponse.data.sprints || [],
            milestones: milestonesResponse.data.milestones || []
          };
        });
        if (!result) return;
        setProject(result.project);
        setSchedule(result.schedule);
        setSprints(result.sprints);
        setMilestones(result.milestones);
      } catch (requestError) {
        reportFailure(requestError, 'Não foi possível carregar o cronograma.');
      } finally {
        setLoading(false);
      }
    },
    [appliedPeriod, projectId, reportFailure, run]
  );

  // Recargas dirigidas: cada mutacao rebusca apenas o que ela pode ter mudado,
  // em vez de recarregar a tela inteira.
  const refreshSchedule = useCallback(
    async (range = appliedPeriod) => {
      const response = await scheduleApi.getSchedule(projectId, range);
      setSchedule(response.data);
    },
    [appliedPeriod, projectId]
  );

  const refreshSprints = useCallback(async () => {
    const response = await scheduleApi.listSprints(projectId);
    setSprints(response.data.sprints || []);
  }, [projectId]);

  const refreshMilestones = useCallback(async () => {
    const response = await scheduleApi.listMilestones(projectId);
    setMilestones(response.data.milestones || []);
  }, [projectId]);

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const filtered = Boolean(appliedPeriod.from || appliedPeriod.to);
  const unassignedCount = schedule?.unassignedTasks?.length ?? 0;

  const feedback = (message) => {
    setSuccess(message);
    setError('');
  };

  const handleFailure = (requestError, fallback) => {
    setSuccess('');
    setError(normalizeApiError(requestError, fallback).message);
  };

  const applyPeriod = async (event) => {
    event.preventDefault();
    if (period.from && period.to && period.from > period.to) {
      setError('A data inicial não pode ser maior que a data final.');
      return;
    }
    setAppliedPeriod(period);
    // O filtro so afeta o agregado; as listas de CRUD permanecem completas.
    try {
      await refreshSchedule(period);
      feedback('Período aplicado.');
    } catch (requestError) {
      handleFailure(requestError, 'Não foi possível aplicar o período.');
    }
  };

  const clearPeriod = async () => {
    const empty = { from: '', to: '' };
    setPeriod(empty);
    setAppliedPeriod(empty);
    try {
      await refreshSchedule(empty);
      feedback('Período limpo.');
    } catch (requestError) {
      handleFailure(requestError, 'Não foi possível limpar o período.');
    }
  };

  const submitSprint = async (event) => {
    event.preventDefault();
    const errors = validateSprintForm(sprintForm);
    setSprintErrors(errors);
    if (Object.keys(errors).length) return;

    setSubmitting(true);
    try {
      const payload = {
        name: sprintForm.name.trim(),
        objective: sprintForm.objective.trim() || null,
        startDate: sprintForm.startDate,
        endDate: sprintForm.endDate
      };
      if (editingSprintId) {
        await scheduleApi.updateSprint(editingSprintId, payload);
        feedback('Sprint atualizada com sucesso.');
      } else {
        await scheduleApi.createSprint(projectId, payload);
        feedback('Sprint cadastrada com sucesso.');
      }
      setSprintForm(emptySprintForm);
      setEditingSprintId(null);
      // Mexer em sprint nao altera marcos nem o projeto: rebusca apenas os dois
      // conjuntos afetados, em paralelo.
      await Promise.all([refreshSprints(), refreshSchedule()]);
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
      startDate: (sprint.startDate || '').slice(0, 10),
      endDate: (sprint.endDate || '').slice(0, 10)
    });
  };

  const changeSprintStatus = async (sprint, status) => {
    // CONCLUIDA e CANCELADA são terminais: não há transição de volta. Um clique
    // sem aviso deixaria a sprint travada para edição e para novas tarefas.
    if (isTerminalTransition(status)) {
      const confirmed = await confirm({
        title: status === 'CONCLUIDA' ? 'Concluir sprint' : 'Cancelar sprint',
        description:
          `A sprint "${sprint.name}" será encerrada. ` +
          'Esta ação é definitiva: ela não poderá ser editada, reaberta nem receber novas tarefas.',
        confirmLabel: status === 'CONCLUIDA' ? 'Concluir' : 'Cancelar sprint'
      });
      if (!confirmed) return;
    }

    setBusySprintId(sprint.id);
    try {
      // A resposta ja traz a sprint atualizada: aplica no estado local em vez de
      // rebuscar a lista inteira. Só o agregado precisa de nova consulta.
      const { data } = await scheduleApi.updateSprintStatus(sprint.id, status);
      setSprints((current) => current.map((item) => (item.id === sprint.id ? data.sprint : item)));
      if (selectedSprint?.id === sprint.id) setSelectedSprint(data.sprint);
      feedback('Status da sprint atualizado com sucesso.');
      await refreshSchedule();
    } catch (requestError) {
      handleFailure(requestError, 'Não foi possível atualizar o status da sprint.');
    } finally {
      setBusySprintId(null);
    }
  };

  const removeSprint = async (sprint) => {
    const confirmed = await confirm({
      title: 'Excluir sprint',
      description: `A sprint "${sprint.name}" será excluída. Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir'
    });
    if (!confirmed) return;

    setBusySprintId(sprint.id);
    try {
      await scheduleApi.removeSprint(sprint.id);
      feedback('Sprint excluída com sucesso.');
      if (selectedSprint?.id === sprint.id) setSelectedSprint(null);
      setSprints((current) => current.filter((item) => item.id !== sprint.id));
      await refreshSchedule();
    } catch (requestError) {
      handleFailure(requestError, 'Não foi possível excluir a sprint.');
    } finally {
      setBusySprintId(null);
    }
  };

  const selectSprint = async (sprint) => {
    if (selectedSprint?.id === sprint.id) {
      setSelectedSprint(null);
      return;
    }
    setSelectedSprint(sprint);
    // O painel monta antes da resposta chegar. Sem limpar a seleção da sprint anterior
    // e sem sinalizar carga, ele exibiria as marcações da sprint errada e o botão
    // salvaria uma lista vazia — esvaziando a sprint recém-aberta.
    setSelectedTaskIds([]);
    setTasksLoading(true);
    try {
      // As tarefas do projeto so sao necessarias aqui, entao sao buscadas ao abrir
      // o painel e nao na carga inicial da tela.
      const [tasksResponse, sprintTasksResponse] = await Promise.all([
        projectTasks.length ? null : scheduleApi.listProjectTasks(projectId),
        scheduleApi.listSprintTasks(sprint.id)
      ]);
      if (tasksResponse) setProjectTasks(tasksResponse.data.tasks || []);
      setSelectedTaskIds((sprintTasksResponse.data.tasks || []).map((task) => task.id));
    } catch (requestError) {
      // Fechar o painel: mantê-lo aberto deixaria uma afirmação sobre o conteúdo da
      // sprint ao lado da mensagem de erro que diz não ter conseguido lê-lo.
      setSelectedSprint(null);
      handleFailure(requestError, 'Não foi possível carregar as tarefas da sprint.');
    } finally {
      setTasksLoading(false);
    }
  };

  const showProgress = async (sprint) => {
    if (progressSprint?.id === sprint.id) {
      setProgressSprint(null);
      setProgress(null);
      return;
    }
    // Mesma disciplina do painel de tarefas: limpar o resultado anterior e
    // sinalizar carga, para a tela nunca afirmar um numero da sprint errada.
    setProgressSprint(sprint);
    setProgress(null);
    setProgressLoading(true);
    try {
      const { data } = await scheduleApi.getSprintProgress(sprint.id);
      setProgress(data);
    } catch (requestError) {
      setProgressSprint(null);
      handleFailure(requestError, 'Não foi possível calcular a evolução da sprint.');
    } finally {
      setProgressLoading(false);
    }
  };

  const submitSprintTasks = async (taskIds) => {
    // Em sprint encerrada a remoção é mão única: o escopo é registro histórico e
    // a API recusa reincluir. O usuário precisa saber disso antes, não depois.
    if (isTerminalSprint(selectedSprint.status)) {
      const removidas = selectedTaskIds
        .filter((id) => !taskIds.includes(id))
        .map((id) => projectTasks.find((task) => task.id === id)?.title)
        .filter(Boolean);
      const confirmed = await confirm({
        title: 'Remover tarefa de sprint encerrada',
        description:
          `${removidas.length === 1 ? 'A tarefa' : 'As tarefas'} ${removidas.map((t) => `"${t}"`).join(', ')} ` +
          `${removidas.length === 1 ? 'sairá' : 'sairão'} de "${selectedSprint.name}". ` +
          'Não será possível recolocá-la: uma sprint concluída ou cancelada não aceita novas tarefas.',
        confirmLabel: 'Remover'
      });
      if (!confirmed) return;
    }

    setSubmitting(true);
    try {
      await scheduleApi.replaceSprintTasks(selectedSprint.id, taskIds);
      feedback('Tarefas da sprint atualizadas com sucesso.');
      setSelectedTaskIds(taskIds);
      // Associar tarefa nao muda sprints nem marcos, so a composicao do agregado.
      await refreshSchedule();
    } catch (requestError) {
      handleFailure(requestError, 'Não foi possível atualizar as tarefas da sprint.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitMilestone = async (event) => {
    event.preventDefault();
    const errors = validateMilestoneForm(milestoneForm);
    setMilestoneErrors(errors);
    if (Object.keys(errors).length) return;

    setSubmitting(true);
    try {
      const payload = {
        title: milestoneForm.title.trim(),
        description: milestoneForm.description.trim() || null,
        dueDate: milestoneForm.dueDate
      };
      if (editingMilestoneId) {
        await scheduleApi.updateMilestone(editingMilestoneId, payload);
        feedback('Marco atualizado com sucesso.');
      } else {
        await scheduleApi.createMilestone(projectId, payload);
        feedback('Marco cadastrado com sucesso.');
      }
      setMilestoneForm(emptyMilestoneForm);
      setEditingMilestoneId(null);
      // Mexer em marco nao altera sprints nem tarefas.
      await Promise.all([refreshMilestones(), refreshSchedule()]);
    } catch (requestError) {
      handleFailure(requestError, 'Não foi possível salvar o marco.');
    } finally {
      setSubmitting(false);
    }
  };

  const editMilestone = (milestone) => {
    setEditingMilestoneId(milestone.id);
    setMilestoneErrors({});
    setMilestoneForm({
      title: milestone.title || '',
      description: milestone.description || '',
      dueDate: (milestone.dueDate || '').slice(0, 10)
    });
  };

  const toggleMilestoneStatus = async (milestone) => {
    setBusyMilestoneId(milestone.id);
    try {
      const next = milestone.status === 'PENDENTE' ? 'CONCLUIDO' : 'PENDENTE';
      // A resposta traz o marco atualizado; aplica no estado sem rebuscar a lista.
      const { data } = await scheduleApi.updateMilestoneStatus(milestone.id, next);
      setMilestones((current) =>
        current.map((item) => (item.id === milestone.id ? data.milestone : item))
      );
      feedback('Status do marco atualizado com sucesso.');
      await refreshSchedule();
    } catch (requestError) {
      handleFailure(requestError, 'Não foi possível atualizar o status do marco.');
    } finally {
      setBusyMilestoneId(null);
    }
  };

  const removeMilestone = async (milestone) => {
    const confirmed = await confirm({
      title: 'Excluir marco',
      description: `O marco "${milestone.title}" será excluído. Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir'
    });
    if (!confirmed) return;

    setBusyMilestoneId(milestone.id);
    try {
      await scheduleApi.removeMilestone(milestone.id);
      feedback('Marco excluído com sucesso.');
      setMilestones((current) => current.filter((item) => item.id !== milestone.id));
      await refreshSchedule();
    } catch (requestError) {
      handleFailure(requestError, 'Não foi possível excluir o marco.');
    } finally {
      setBusyMilestoneId(null);
    }
  };

  if (loading) {
    return (
      <main className="page-container">
        <LoadingState message="Carregando cronograma..." />
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

  if (error && !schedule) {
    return (
      <main className="page-container">
        <ErrorState message={error} onRetry={() => loadAll()} />
      </main>
    );
  }

  return (
    <main className="page-container">
      <header className="page-header">
        <div>
          <span className="eyebrow">Planejamento</span>
          <h1>Cronograma{project ? ` — ${project.name}` : ''}</h1>
          {/* Resumo numerico orienta antes de rolar a pagina. */}
          <p className="schedule-summary">
            {sprints.length} {sprints.length === 1 ? 'sprint' : 'sprints'} · {milestones.length}{' '}
            {milestones.length === 1 ? 'marco' : 'marcos'} · {unassignedCount}{' '}
            {unassignedCount === 1 ? 'tarefa sem sprint' : 'tarefas sem sprint'}
          </p>
        </div>
      </header>
      <ProjectSectionNav projectId={projectId} activeSection="schedule" />
      <FeedbackRegion error={error} success={success} />

      <section className="card schedule-agenda-card">
        <div className="schedule-card-header">
          <h2>Agenda do cronograma</h2>
          {/* O filtro pertence a linha do tempo: e ela que ele recorta. */}
          <form className="schedule-filters" onSubmit={applyPeriod}>
            <label className="field">
              <span>Data inicial</span>
              <input
                type="date"
                value={period.from}
                onChange={(event) => setPeriod({ ...period, from: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Data final</span>
              <input
                type="date"
                value={period.to}
                onChange={(event) => setPeriod({ ...period, to: event.target.value })}
              />
            </label>
            <button className="button button-secondary" type="submit">
              Filtrar
            </button>
            {filtered && (
              <button className="button button-secondary" type="button" onClick={clearPeriod}>
                Limpar
              </button>
            )}
          </form>
        </div>
        <ScheduleAgenda key={projectId} schedule={schedule} onClearPeriod={clearPeriod} />
      </section>

      <div className="schedule-columns">
        <section className="card">
          <h2>{editingSprintId ? 'Editar sprint' : 'Nova sprint'}</h2>
          <SprintForm
            formData={sprintForm}
            errors={sprintErrors}
            editing={Boolean(editingSprintId)}
            submitting={submitting}
            onChange={(field, value) => setSprintForm({ ...sprintForm, [field]: value })}
            onSubmit={submitSprint}
            onCancel={() => {
              setEditingSprintId(null);
              setSprintForm(emptySprintForm);
              setSprintErrors({});
            }}
          />

          <h3 className="schedule-section-title">Sprints do projeto</h3>
          <SprintList
            sprints={sprints}
            selectedSprintId={selectedSprint?.id}
            busySprintId={busySprintId}
            progressSprintId={progressSprint?.id ?? null}
            onSelect={selectSprint}
            onShowProgress={showProgress}
            onEdit={editSprint}
            onDelete={removeSprint}
            onChangeStatus={changeSprintStatus}
          />
          {progressSprint && (
            <SprintProgressPanel
              sprint={progressSprint}
              progress={progress}
              loading={progressLoading}
              onClose={() => {
                setProgressSprint(null);
                setProgress(null);
              }}
            />
          )}
          {selectedSprint && (
            <SprintTasksPanel
              sprint={selectedSprint}
              tasks={projectTasks}
              selectedTaskIds={selectedTaskIds}
              sprintNames={sprintNames}
              loading={tasksLoading}
              submitting={submitting}
              onSubmit={submitSprintTasks}
              onCancel={() => setSelectedSprint(null)}
            />
          )}
        </section>

        <section className="card">
          <h2>{editingMilestoneId ? 'Editar marco' : 'Novo marco'}</h2>
          <MilestoneForm
            formData={milestoneForm}
            errors={milestoneErrors}
            editing={Boolean(editingMilestoneId)}
            submitting={submitting}
            onChange={(field, value) => setMilestoneForm({ ...milestoneForm, [field]: value })}
            onSubmit={submitMilestone}
            onCancel={() => {
              setEditingMilestoneId(null);
              setMilestoneForm(emptyMilestoneForm);
              setMilestoneErrors({});
            }}
          />

          <h3 className="schedule-section-title">Marcos do projeto</h3>
          <MilestoneList
            milestones={milestones}
            busyMilestoneId={busyMilestoneId}
            onEdit={editMilestone}
            onDelete={removeMilestone}
            onToggleStatus={toggleMilestoneStatus}
          />
        </section>
      </div>
    </main>
  );
}
