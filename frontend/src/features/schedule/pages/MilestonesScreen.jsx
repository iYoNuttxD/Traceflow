import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { scheduleApi } from '../api/schedule.api.js';
import { ProjectSectionNav } from '../../projects/index.js';
import {
  FeedbackRegion,
  LoadingState,
  ErrorState,
  ForbiddenState,
  useConfirm
} from '../../../shared/index.js';
import {
  MilestoneForm,
  emptyMilestoneForm,
  validateMilestoneForm
} from '../components/MilestoneForm.jsx';
import { MilestoneList } from '../components/MilestoneList.jsx';
import {
  fromDateTimeLocalInput,
  isTerminalSprint,
  milestoneProgress,
  toDateTimeLocalInput
} from '../components/schedule-display.js';
import { useScheduleData } from '../hooks/useScheduleData.js';
import '../styles/schedule.css';

export function MilestonesScreen() {
  const { projectId } = useParams();
  const confirm = useConfirm();

  const {
    project,
    sprints,
    milestones,
    setMilestones,
    somenteLeitura,
    loading,
    forbidden,
    error,
    success,
    loadAll,
    refreshSchedule,
    refreshSprints,
    refreshMilestones,
    feedback,
    handleFailure
  } = useScheduleData(projectId);

  const [milestoneForm, setMilestoneForm] = useState(emptyMilestoneForm);
  const [milestoneErrors, setMilestoneErrors] = useState({});
  const [editingMilestoneId, setEditingMilestoneId] = useState(null);
  const [formSprintIds, setFormSprintIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [busyMilestoneId, setBusyMilestoneId] = useState(null);
  const formCardRef = useRef(null);

  const milestoneNames = useMemo(
    () => Object.fromEntries(milestones.map((item) => [item.id, item.title])),
    [milestones]
  );

  useEffect(() => {
    if (!editingMilestoneId) return;
    formCardRef.current?.querySelector('input, select, textarea')?.focus();
  }, [editingMilestoneId]);

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
        dueDate: fromDateTimeLocalInput(milestoneForm.dueDate)
      };
      let alvoId = editingMilestoneId;
      if (editingMilestoneId) {
        await scheduleApi.updateMilestone(editingMilestoneId, payload);
      } else {
        const { data } = await scheduleApi.createMilestone(projectId, payload);
        alvoId = data.milestone?.id ?? null;
      }

      const mudaveis = sprints.filter((sprint) => !isTerminalSprint(sprint.status));
      const mover = alvoId
        ? mudaveis.filter(
            (sprint) => formSprintIds.includes(sprint.id) && sprint.milestoneId !== alvoId
          )
        : [];
      const soltar =
        alvoId && editingMilestoneId
          ? mudaveis.filter(
              (sprint) => !formSprintIds.includes(sprint.id) && sprint.milestoneId === alvoId
            )
          : [];
      let avisoSprints = null;
      try {
        for (const sprint of mover) {
          await scheduleApi.updateSprint(sprint.id, { milestoneId: alvoId });
        }
        for (const sprint of soltar) {
          await scheduleApi.updateSprint(sprint.id, { milestoneId: null });
        }
      } catch (requestError) {
        avisoSprints = requestError;
      }

      setMilestoneForm(emptyMilestoneForm);
      setEditingMilestoneId(null);
      setFormSprintIds([]);
      if (avisoSprints) {
        handleFailure(
          avisoSprints,
          'Marco salvo, mas não foi possível mover as sprints selecionadas.'
        );
      } else {
        feedback(
          editingMilestoneId ? 'Marco atualizado com sucesso.' : 'Marco cadastrado com sucesso.'
        );
      }
      await Promise.all([
        refreshMilestones(),
        refreshSchedule(),
        mover.length || soltar.length ? refreshSprints() : Promise.resolve()
      ]);
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
      dueDate: toDateTimeLocalInput(milestone.dueDate)
    });
    setFormSprintIds(
      sprints
        .filter((sprint) => !isTerminalSprint(sprint.status) && sprint.milestoneId === milestone.id)
        .map((sprint) => sprint.id)
    );
  };

  const toggleMilestoneStatus = async (milestone) => {
    const next = milestone.status === 'PENDENTE' ? 'CONCLUIDO' : 'PENDENTE';
    if (next === 'CONCLUIDO') {
      const progresso = milestoneProgress(milestone.id, sprints);
      const pendentes = progresso.total - progresso.done;
      const confirmed = await confirm({
        title: 'Concluir marco?',
        description:
          `O marco "${milestone.title}" será marcado como concluído manualmente.` +
          (pendentes > 0 ? ` ${pendentes} sprint(s) deste marco ainda não foram concluídas.` : ''),
        cancelLabel: 'Voltar',
        confirmLabel: 'Concluir marco',
        destructive: false
      });
      if (!confirmed) return;
    }

    setBusyMilestoneId(milestone.id);
    try {
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
      title: 'Excluir marco?',
      description:
        `O marco "${milestone.title}" será excluído definitivamente. ` +
        'Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir marco'
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
        <LoadingState message="Carregando marcos..." />
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

  if (error && !milestones.length) {
    return (
      <main className="page-container">
        <ErrorState message={error} onRetry={() => loadAll()} />
      </main>
    );
  }

  const concluidos = milestones.filter((item) => item.status === 'CONCLUIDO').length;

  return (
    <main className="page-container">
      <header className="page-header">
        <div>
          <span className="eyebrow">Planejamento</span>
          <h1>Marcos{project ? ` — ${project.name}` : ''}</h1>
          <p>
            Marcos agrupam várias sprints e são concluídos automaticamente quando todas as sprints
            terminam.
          </p>
        </div>
        <ProjectSectionNav projectId={projectId} activeSection="milestones" />
      </header>
      <FeedbackRegion error={error} success={success} />

      <div className="schedule-columns schedule-columns--unica">
        {!somenteLeitura && (
          <section className="card" ref={formCardRef}>
            <h2>{editingMilestoneId ? 'Editar marco' : 'Cadastrar marco'}</h2>
            <MilestoneForm
              formData={milestoneForm}
              sprints={sprints}
              milestoneNames={milestoneNames}
              sprintIds={formSprintIds}
              editingMilestoneId={editingMilestoneId}
              errors={milestoneErrors}
              editing={Boolean(editingMilestoneId)}
              submitting={submitting}
              onChange={(field, value) => setMilestoneForm({ ...milestoneForm, [field]: value })}
              onToggleSprint={(sprintId) =>
                setFormSprintIds((current) =>
                  current.includes(sprintId)
                    ? current.filter((id) => id !== sprintId)
                    : [...current, sprintId]
                )
              }
              onSubmit={submitMilestone}
              onCancel={() => {
                setEditingMilestoneId(null);
                setMilestoneForm(emptyMilestoneForm);
                setMilestoneErrors({});
                setFormSprintIds([]);
                formCardRef.current?.querySelector('input, select, textarea')?.focus();
              }}
            />
          </section>
        )}

        <section className="card">
          <div className="schedule-card-header">
            <h2>Marcos do projeto</h2>
            <span className="agenda-window">
              {milestones.length} {milestones.length === 1 ? 'marco' : 'marcos'} · {concluidos}{' '}
              {concluidos === 1 ? 'concluído' : 'concluídos'}
            </span>
          </div>
          <MilestoneList
            milestones={milestones}
            sprints={sprints}
            busyMilestoneId={busyMilestoneId}
            readOnly={somenteLeitura}
            onEdit={editMilestone}
            onDelete={removeMilestone}
            onToggleStatus={toggleMilestoneStatus}
          />
        </section>
      </div>
    </main>
  );
}
