import { useEffect, useRef, useState } from 'react';
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
  milestoneProgress,
  toDateTimeLocalInput
} from '../components/schedule-display.js';
import { useScheduleData } from '../hooks/useScheduleData.js';

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
    refreshMilestones,
    feedback,
    handleFailure
  } = useScheduleData(projectId);

  const [milestoneForm, setMilestoneForm] = useState(emptyMilestoneForm);
  const [milestoneErrors, setMilestoneErrors] = useState({});
  const [editingMilestoneId, setEditingMilestoneId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyMilestoneId, setBusyMilestoneId] = useState(null);
  // Card do formulário: alvo do foco quando a edição começa ou é cancelada.
  const formCardRef = useRef(null);

  // Editar promete "carrega no formulário de edição" — o foco completa a
  // promessa. No desktop pareado o campo já está visível e nada rola; no
  // empilhado (≤960px) o focus() nativo rola até ele, respeitando
  // prefers-reduced-motion (um scrollIntoView animado não respeitaria).
  // Disparar pelo id cobre também trocar a edição de um marco para outro.
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
      dueDate: toDateTimeLocalInput(milestone.dueDate)
    });
  };

  const toggleMilestoneStatus = async (milestone) => {
    const next = milestone.status === 'PENDENTE' ? 'CONCLUIDO' : 'PENDENTE';
    // Concluir à mão é sempre uma afirmação sobre a entrega — vale confirmar,
    // senão um clique diz "pronto" por decisão de ninguém. Reabrir dispensa
    // aviso: é reversível e não afirma nada. Quando ainda há sprints abertas, a
    // confirmação diz quantas, porque é isso que o clique está atropelando.
    if (next === 'CONCLUIDO') {
      const progresso = milestoneProgress(milestone.id, sprints);
      const pendentes = progresso.total - progresso.done;
      const confirmed = await confirm({
        title: 'Concluir marco?',
        description:
          `O marco "${milestone.title}" será marcado como concluído manualmente.` +
          (pendentes > 0 ? ` ${pendentes} sprint(s) deste marco ainda não foram concluídas.` : ''),
        confirmLabel: 'Concluir marco',
        destructive: false
      });
      if (!confirmed) return;
    }

    setBusyMilestoneId(milestone.id);
    try {
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

      {/* Pareadas: lista e formulário dividem a mesma altura no desktop. Sem
          formulário (VIEWER), coluna única — nada de coluna fantasma. */}
      <div
        className={`schedule-columns ${
          somenteLeitura ? 'schedule-columns--unica' : 'schedule-columns--pareadas'
        }`}
      >
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

        {!somenteLeitura && (
          <section className="card" ref={formCardRef}>
            <h2>{editingMilestoneId ? 'Editar marco' : 'Cadastrar marco'}</h2>
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
                // O botão "Cancelar edição" desaparece ao ser clicado; sem
                // realocar o foco, ele cai no body e o teclado perde o lugar.
                formCardRef.current?.querySelector('input, select, textarea')?.focus();
              }}
            />
          </section>
        )}
      </div>
    </main>
  );
}
