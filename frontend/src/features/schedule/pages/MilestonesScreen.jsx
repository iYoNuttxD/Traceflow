import { useCallback, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { ProjectSectionNav } from '../../projects/index.js';
import {
  ErrorState,
  FeedbackRegion,
  ForbiddenState,
  LoadingState,
  normalizeApiError,
  useConfirm
} from '../../../shared/index.js';
import { scheduleApi } from '../api/schedule.api.js';
import { MilestoneFilters } from '../components/MilestoneFilters.jsx';
import {
  MilestoneForm,
  emptyMilestoneForm,
  validateMilestoneForm
} from '../components/MilestoneForm.jsx';
import { MilestoneList } from '../components/MilestoneList.jsx';
import { MilestoneSprintsPanel } from '../components/MilestoneSprintsPanel.jsx';
import { MilestonesSummary } from '../components/MilestonesSummary.jsx';
import { SprintDialog } from '../components/SprintDialog.jsx';
import {
  fromDateTimeLocalInput,
  isTerminalSprint,
  toDateTimeLocalInput
} from '../components/schedule-display.js';
import {
  filterMilestones,
  hasMilestoneFilters,
  MILESTONE_FILTER_DEFAULTS
} from '../components/milestone-view.js';
import { useScheduleData } from '../hooks/useScheduleData.js';
import '../styles/schedule.css';
import './SprintsScreen.css';
import './MilestonesScreen.css';

const FORM_DIALOGS = new Set(['create', 'edit']);

export function MilestonesScreen() {
  const { projectId } = useParams();
  return <ProjectMilestonesScreen key={projectId} projectId={projectId} />;
}

function ProjectMilestonesScreen({ projectId }) {
  const confirm = useConfirm();
  const dialogReturnFocusRef = useRef(null);
  const gridRef = useRef(null);
  const mutationLocks = useRef(new Set());

  const {
    schedule,
    sprints,
    milestones,
    captureContext,
    isCurrentContext,
    confirmMutation,
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
  const [milestoneForm, setMilestoneForm] = useState(emptyMilestoneForm);
  const [milestoneErrors, setMilestoneErrors] = useState({});
  const [formSprintIds, setFormSprintIds] = useState([]);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [busyMilestoneId, setBusyMilestoneId] = useState(null);
  const [filters, setFilters] = useState({ ...MILESTONE_FILTER_DEFAULTS });
  const [selectedFilterSprint, setSelectedFilterSprint] = useState(null);

  const milestoneNames = useMemo(
    () => Object.fromEntries(milestones.map((item) => [item.id, item.title])),
    [milestones]
  );
  const scheduleById = useMemo(
    () => Object.fromEntries((schedule?.sprints || []).map((item) => [item.id, item])),
    [schedule]
  );
  const visibleMilestones = useMemo(
    () => filterMilestones(milestones, filters, sprints),
    [filters, milestones, sprints]
  );
  const filtersActive = hasMilestoneFilters(filters);
  const dialogMilestone = dialog?.milestone || null;

  const closeDialog = useCallback(() => {
    setDialog(null);
    setFormError('');
  }, []);

  function rememberTrigger(trigger) {
    dialogReturnFocusRef.current = trigger || document.activeElement;
  }

  function openCreate(trigger) {
    rememberTrigger(trigger);
    setMilestoneForm(emptyMilestoneForm);
    setMilestoneErrors({});
    setFormSprintIds([]);
    setFormError('');
    setDialog({ type: 'create' });
  }

  function openEdit(milestone, trigger) {
    rememberTrigger(trigger);
    setMilestoneForm({
      title: milestone.title || '',
      description: milestone.description || '',
      dueDate: toDateTimeLocalInput(milestone.dueDate)
    });
    setMilestoneErrors({});
    setFormSprintIds(
      sprints
        .filter((sprint) => Number(sprint.milestoneId) === Number(milestone.id))
        .map((sprint) => sprint.id)
    );
    setFormError('');
    setDialog({ type: 'edit', milestone });
  }

  function openSprints(milestone, trigger) {
    rememberTrigger(trigger);
    setDialog({ type: 'sprints', milestone });
  }

  async function submitMilestone(event) {
    event.preventDefault();
    if (submitting || mutationLocks.current.has('form')) return;
    const context = captureContext();
    const editing = dialog?.type === 'edit';
    const editingId = editing ? dialog.milestone.id : null;
    if (editingId && mutationLocks.current.has(editingId)) return;
    const errors = validateMilestoneForm(milestoneForm);
    setMilestoneErrors(errors);
    setFormError('');
    if (Object.keys(errors).length) {
      const firstField = errors.title ? 'milestone-title' : 'milestone-dueDate';
      queueMicrotask(() => document.getElementById(firstField)?.focus());
      return;
    }

    mutationLocks.current.add('form');
    if (editingId) mutationLocks.current.add(editingId);
    setSubmitting(true);
    try {
      const payload = {
        title: milestoneForm.title.trim(),
        description: milestoneForm.description.trim() || null,
        dueDate: fromDateTimeLocalInput(milestoneForm.dueDate)
      };
      const response = editing
        ? await scheduleApi.updateMilestone(editingId, payload)
        : await scheduleApi.createMilestone(projectId, payload);
      const savedMilestone = response.data.milestone || null;
      const targetId = editingId || savedMilestone?.id || null;

      const affectsSprints =
        formSprintIds.length > 0 ||
        (editing && sprints.some((sprint) => Number(sprint.milestoneId) === Number(editingId)));
      const affected = ['milestones', 'schedule', ...(affectsSprints ? ['sprints'] : [])];
      let receipt = confirmMutation(context, 'milestones', savedMilestone, affected);

      const mutableSprints = sprints.filter((sprint) => !isTerminalSprint(sprint.status));
      const toMove = targetId
        ? mutableSprints.filter(
            (sprint) =>
              formSprintIds.some((id) => Number(id) === Number(sprint.id)) &&
              Number(sprint.milestoneId) !== Number(targetId)
          )
        : [];
      const toRelease =
        targetId && editing
          ? mutableSprints.filter(
              (sprint) =>
                !formSprintIds.some((id) => Number(id) === Number(sprint.id)) &&
                Number(sprint.milestoneId) === Number(targetId)
            )
          : [];
      let associationFailed = false;

      try {
        for (const sprint of toMove) {
          const updated = await scheduleApi.updateSprint(sprint.id, { milestoneId: targetId });
          receipt = confirmMutation(context, 'sprints', updated.data.sprint, [
            'sprints',
            'milestones',
            'schedule'
          ]);
        }
        for (const sprint of toRelease) {
          const updated = await scheduleApi.updateSprint(sprint.id, { milestoneId: null });
          receipt = confirmMutation(context, 'sprints', updated.data.sprint, [
            'sprints',
            'milestones',
            'schedule'
          ]);
        }
      } catch {
        associationFailed = true;
      }

      if (!isCurrentContext(context) || !receipt) return;
      setDialog(null);
      setMilestoneForm(emptyMilestoneForm);
      setFormSprintIds([]);
      setMilestoneErrors({});
      const refresh = () =>
        Promise.all([
          refreshMilestones(receipt),
          refreshSchedule({}, receipt),
          ...(affectsSprints ? [refreshSprints(receipt)] : [])
        ]);

      if (associationFailed || !targetId) {
        warn('Marco salvo, mas não foi possível atualizar todas as Sprints selecionadas.', context);
        try {
          await refresh();
        } catch {
          warn(
            'Marco salvo, mas as Sprints e os dados exibidos não puderam ser atualizados. Recarregue a página.',
            context
          );
        }
      } else {
        await settle(
          editing ? 'Marco atualizado com sucesso.' : 'Marco criado com sucesso.',
          refresh,
          context
        );
      }
    } catch (requestError) {
      if (isCurrentContext(context))
        setFormError(normalizeApiError(requestError, 'Não foi possível salvar o marco.').message);
    } finally {
      mutationLocks.current.delete('form');
      if (editingId) mutationLocks.current.delete(editingId);
      if (isCurrentContext(context)) setSubmitting(false);
    }
  }

  async function reopenMilestone(milestone) {
    if (mutationLocks.current.has(milestone.id)) return;
    mutationLocks.current.add(milestone.id);
    const context = captureContext();
    setBusyMilestoneId(milestone.id);
    try {
      const { data } = await scheduleApi.updateMilestoneStatus(milestone.id, 'PENDENTE');
      const receipt = confirmMutation(context, 'milestones', data.milestone);
      if (!receipt) return;
      await settle('Marco reaberto com sucesso.', () => refreshSchedule({}, receipt), context);
    } catch (requestError) {
      handleFailure(requestError, 'Não foi possível reabrir o marco.', context);
    } finally {
      mutationLocks.current.delete(milestone.id);
      if (isCurrentContext(context)) setBusyMilestoneId(null);
    }
  }

  async function removeMilestone(milestone) {
    if (mutationLocks.current.has(milestone.id)) return;
    const context = captureContext();
    const confirmed = await confirm({
      title: 'Excluir marco?',
      description:
        `O marco "${milestone.title}" será removido das visões atuais e dos seletores. ` +
        'As Sprints vinculadas, Tasks e seu histórico serão preservados. As referências existentes indicarão Marco excluído.',
      confirmLabel: 'Excluir marco'
    });
    if (!confirmed || !isCurrentContext(context) || mutationLocks.current.has(milestone.id)) return;
    mutationLocks.current.add(milestone.id);

    setBusyMilestoneId(milestone.id);
    try {
      await scheduleApi.removeMilestone(milestone.id);
      const affectsSprints = sprints.some(
        (sprint) => Number(sprint.milestoneId) === Number(milestone.id)
      );
      const receipt = confirmMutation(
        context,
        'milestones',
        { id: milestone.id, deletedAt: true },
        ['milestones', 'schedule', ...(affectsSprints ? ['sprints'] : [])]
      );
      if (!receipt) return;
      queueMicrotask(() => {
        if (isCurrentContext(context)) gridRef.current?.focus();
      });
      await settle(
        'Marco excluído com sucesso.',
        () =>
          Promise.all([
            refreshSchedule({}, receipt),
            ...(affectsSprints ? [refreshSprints(receipt)] : [])
          ]),
        context
      );
    } catch (requestError) {
      handleFailure(requestError, 'Não foi possível excluir o marco.', context);
    } finally {
      mutationLocks.current.delete(milestone.id);
      if (isCurrentContext(context)) setBusyMilestoneId(null);
    }
  }

  function changeFilter(field, value, selectedOption) {
    setFilters((current) => ({ ...current, [field]: value }));
    if (field === 'sprintId') setSelectedFilterSprint(selectedOption || null);
  }

  function clearFilters() {
    setFilters({ ...MILESTONE_FILTER_DEFAULTS });
    setSelectedFilterSprint(null);
  }

  if (loading) {
    return (
      <main className="page-container milestones-screen">
        <LoadingState message="Carregando marcos..." />
      </main>
    );
  }

  if (forbidden) {
    return (
      <main className="page-container milestones-screen">
        <ForbiddenState message="Você não possui acesso ao cronograma deste projeto." />
      </main>
    );
  }

  if (error && !milestones.length) {
    return (
      <main className="page-container milestones-screen">
        <ErrorState message={error} onRetry={() => loadAll()} />
      </main>
    );
  }

  return (
    <main className="page-container milestones-screen">
      <header className="page-header milestones-screen__header">
        <div>
          <span className="eyebrow">Planejamento</span>
          <h1>Marcos</h1>
          <p>
            Agrupe Sprints em objetivos de entrega e acompanhe o progresso até seus principais
            prazos.
          </p>
        </div>
        <ProjectSectionNav projectId={projectId} activeSection="milestones" />
      </header>

      <FeedbackRegion error={error} success={success} warning={staleWarning} />
      <MilestonesSummary milestones={milestones} />
      <MilestoneFilters
        filters={filters}
        sprints={sprints}
        selectedSprint={selectedFilterSprint}
        total={milestones.length}
        filteredTotal={visibleMilestones.length}
        onChange={changeFilter}
        onClear={clearFilters}
      />
      <MilestoneList
        milestones={visibleMilestones}
        sprints={sprints}
        scheduleById={scheduleById}
        busyMilestoneId={busyMilestoneId}
        readOnly={somenteLeitura}
        filtered={filtersActive}
        onCreate={openCreate}
        onSprints={openSprints}
        onEdit={openEdit}
        onDelete={removeMilestone}
        onReopen={reopenMilestone}
        listRef={gridRef}
      />

      <SprintDialog
        open={FORM_DIALOGS.has(dialog?.type)}
        title={dialog?.type === 'edit' ? 'Editar marco' : 'Criar marco'}
        description={
          dialog?.type === 'edit'
            ? 'Atualize o objetivo, o prazo e as Sprints vinculadas.'
            : 'Defina um objetivo de entrega, seu prazo e as Sprints relacionadas.'
        }
        initialFocusSelector="#milestone-title"
        returnFocusRef={dialogReturnFocusRef}
        busy={submitting}
        onClose={closeDialog}
      >
        {formError && <ErrorState message={formError} />}
        <MilestoneForm
          formData={milestoneForm}
          sprints={sprints}
          milestoneNames={milestoneNames}
          sprintIds={formSprintIds}
          editingMilestoneId={dialog?.type === 'edit' ? dialog.milestone.id : null}
          errors={milestoneErrors}
          editing={dialog?.type === 'edit'}
          submitting={submitting}
          onChange={(field, value) =>
            setMilestoneForm((current) => ({ ...current, [field]: value }))
          }
          onSprintsChange={setFormSprintIds}
          onSubmit={submitMilestone}
          onCancel={closeDialog}
        />
      </SprintDialog>

      <SprintDialog
        open={dialog?.type === 'sprints'}
        title={`Sprints de ${dialogMilestone?.title || 'marco'}`}
        description="Consulte o progresso e a ordem cronológica das Sprints vinculadas."
        size="large"
        returnFocusRef={dialogReturnFocusRef}
        onClose={closeDialog}
      >
        {dialogMilestone && (
          <MilestoneSprintsPanel
            milestone={dialogMilestone}
            sprints={sprints}
            scheduleById={scheduleById}
            onClose={closeDialog}
          />
        )}
      </SprintDialog>
    </main>
  );
}
