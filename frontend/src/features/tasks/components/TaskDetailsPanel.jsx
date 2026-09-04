import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { normalizeApiError, TraceFlowIcon, useConfirm } from '../../../shared/index.js';
import {
  formatCommitLabel,
  formatDate,
  formatDateTime,
  formatIssueLabel,
  formatIssueLabels,
  formatRequirementLabel,
  priorityLabels,
  requirementStatusLabels,
  statusLabels
} from './kanban-display.js';
import { isTaskOverdue } from './kanban-view.js';
import { KanbanDialog } from './KanbanDialog.jsx';
import { TaskComments } from './TaskComments.jsx';
import {
  createTaskTraceabilityDraft,
  persistTaskTraceability,
  taskTraceabilitySnapshot,
  TaskTraceabilityEditor
} from './TaskTraceabilityEditor.jsx';
import './TaskDetailsPanel.css';

function responsibleInitial(task) {
  const name = task.responsibleUser?.name || task.responsible || '';
  return name.trim().charAt(0).toLocaleUpperCase('pt-BR') || '?';
}

function memberUserId(member) {
  return member.user?.id || member.userId || member.id;
}

function memberName(member) {
  return member.user?.name || member.user?.email || 'Membro sem nome';
}

function taskDraft(task) {
  return {
    title: task.title || '',
    description: task.description || '',
    priority: task.priority || 'MEDIA',
    responsibleUserId: task.responsibleUser?.id
      ? String(task.responsibleUser.id)
      : task.responsibleUserId
        ? String(task.responsibleUserId)
        : '',
    deadline: task.deadline ? String(task.deadline).slice(0, 10) : '',
    estimatedEffort: task.estimatedEffort ?? '',
    actualEffort: task.actualEffort ?? ''
  };
}

function normalizeEffort(value) {
  return value === '' || value === null || value === undefined ? null : Number(value);
}

function normalizedDraft(draft) {
  return {
    title: draft.title.trim(),
    description: draft.description.trim(),
    priority: draft.priority,
    responsibleUserId: draft.responsibleUserId ? Number(draft.responsibleUserId) : null,
    deadline: draft.deadline || null,
    estimatedEffort: normalizeEffort(draft.estimatedEffort),
    actualEffort: normalizeEffort(draft.actualEffort)
  };
}

function draftPayload(draft, baseline) {
  const next = normalizedDraft(draft);
  const previous = normalizedDraft(baseline);
  return Object.fromEntries(
    Object.entries(next).filter(([field, value]) => value !== previous[field])
  );
}

function ArtifactCategory({ label, count, children }) {
  return (
    <article>
      <header className="task-detail-artifact-heading">
        <span>{label}</span>
        <strong aria-label={`${count} ${label.toLocaleLowerCase('pt-BR')}`}>{count}</strong>
      </header>
      <div className="task-detail-artifact-body">{children}</div>
    </article>
  );
}

function GithubExternalAction({ href }) {
  return (
    <a
      className="button button-compact task-detail-external-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      Abrir no GitHub
      <TraceFlowIcon name="externalLink" />
    </a>
  );
}

function TaskInformation({ task }) {
  const overdue = isTaskOverdue(task);

  return (
    <>
      <p className="task-detail-description">{task.description || 'Sem descrição cadastrada.'}</p>

      <section className="task-detail-section" aria-labelledby="task-detail-information-title">
        <h3 id="task-detail-information-title">Informações</h3>
        <dl className="task-detail-grid">
          <div>
            <dt>Prioridade</dt>
            <dd>
              <span
                className={`priority-badge priority-${(task.priority || 'MEDIA').toLowerCase()}`}
              >
                {priorityLabels[task.priority] || task.priority || 'Média'}
              </span>
            </dd>
          </div>
          <div>
            <dt>Responsável</dt>
            <dd className="task-detail-responsible">
              <span aria-hidden="true">{responsibleInitial(task)}</span>
              {task.responsibleUser?.name || task.responsible || 'Não informado'}
            </dd>
          </div>
          <div>
            <dt>Prazo</dt>
            <dd className={overdue ? 'task-detail-deadline--overdue' : ''}>
              {formatDate(task.deadline)}
              {overdue && <small>Atrasada</small>}
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <span className={`status-badge status-${task.status.toLowerCase()}`}>
                {statusLabels[task.status] || task.status}
              </span>
            </dd>
          </div>
        </dl>
        <dl className="task-detail-secondary-grid">
          <div>
            <dt>Esforço estimado</dt>
            <dd>{task.estimatedEffort ?? 'Não informado'}</dd>
          </div>
          <div>
            <dt>Esforço realizado</dt>
            <dd>{task.actualEffort ?? 'Não informado'}</dd>
          </div>
          <div>
            <dt>Criado em</dt>
            <dd>{formatDateTime(task.createdAt)}</dd>
          </div>
        </dl>
      </section>
    </>
  );
}

function TaskEditForm({ task, draft, errors, members, titleRef, saving, onChange }) {
  const activeMembers = members.filter(
    (member) => member.isActive !== false && member.user?.isActive !== false
  );

  return (
    <div className="task-detail-edit-form">
      <label className="field task-detail-edit-form__full">
        <span>Título da tarefa</span>
        <input
          ref={titleRef}
          name="title"
          value={draft.title}
          required
          disabled={saving}
          aria-invalid={Boolean(errors.title)}
          onChange={onChange}
        />
        {errors.title && <small className="field-error">{errors.title}</small>}
      </label>

      <label className="field task-detail-edit-form__full">
        <span>Descrição</span>
        <textarea
          name="description"
          value={draft.description}
          rows="4"
          disabled={saving}
          aria-invalid={Boolean(errors.description)}
          onChange={onChange}
        />
        {errors.description && <small className="field-error">{errors.description}</small>}
      </label>

      <label className="field">
        <span>Prioridade</span>
        <select name="priority" value={draft.priority} disabled={saving} onChange={onChange}>
          {Object.entries(priorityLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Responsável</span>
        <select
          name="responsibleUserId"
          value={draft.responsibleUserId}
          disabled={saving}
          onChange={onChange}
        >
          <option value="">Não informado</option>
          {activeMembers.map((member) => (
            <option key={member.id} value={memberUserId(member)}>
              {memberName(member)}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Prazo</span>
        <input
          type="date"
          name="deadline"
          value={draft.deadline}
          disabled={saving}
          aria-invalid={Boolean(errors.deadline)}
          onChange={onChange}
        />
        {errors.deadline && <small className="field-error">{errors.deadline}</small>}
      </label>

      <div className="field task-detail-readonly-field">
        <span>Status</span>
        <div>
          <span className={`status-badge status-${task.status.toLowerCase()}`}>
            {statusLabels[task.status] || task.status}
          </span>
          <small>Altere o status diretamente no quadro.</small>
        </div>
      </div>

      <label className="field">
        <span>Esforço estimado</span>
        <input
          type="number"
          min="0"
          step="1"
          name="estimatedEffort"
          value={draft.estimatedEffort}
          disabled={saving}
          aria-invalid={Boolean(errors.estimatedEffort)}
          onChange={onChange}
        />
        {errors.estimatedEffort && <small className="field-error">{errors.estimatedEffort}</small>}
      </label>

      <label className="field">
        <span>Esforço realizado</span>
        <input
          type="number"
          min="0"
          step="1"
          name="actualEffort"
          value={draft.actualEffort}
          disabled={saving}
          aria-invalid={Boolean(errors.actualEffort)}
          onChange={onChange}
        />
        {errors.actualEffort && <small className="field-error">{errors.actualEffort}</small>}
      </label>
    </div>
  );
}

function TaskTraceability({ task }) {
  return (
    <section
      className="task-detail-section task-detail-traceability"
      aria-labelledby="task-detail-traceability-title"
    >
      <div className="task-detail-section-heading">
        <h3 id="task-detail-traceability-title">Rastreabilidade</h3>
      </div>
      <div className="task-detail-traceability-grid">
        <ArtifactCategory label="Requisito" count={task.requirement ? 1 : 0}>
          {task.requirement ? (
            <div>
              <strong>{formatRequirementLabel(task.requirement)}</strong>
              <p>
                {task.requirement.status
                  ? requirementStatusLabels[task.requirement.status] || task.requirement.status
                  : 'Status não informado'}
              </p>
            </div>
          ) : (
            <p>Nenhum vínculo</p>
          )}
        </ArtifactCategory>

        <ArtifactCategory label="Pull request" count={task.pullRequest ? 1 : 0}>
          {task.pullRequest ? (
            <div>
              <strong>
                #{task.pullRequest.number} — {task.pullRequest.title}
              </strong>
              <p>{task.pullRequest.state || 'Status não informado'}</p>
              {task.pullRequest.githubUrl && (
                <GithubExternalAction href={task.pullRequest.githubUrl} />
              )}
            </div>
          ) : (
            <p>Nenhum vínculo</p>
          )}
        </ArtifactCategory>

        <ArtifactCategory label="Commits" count={task.commits?.length || 0}>
          {task.commits?.length ? (
            <div className="task-detail-artifact-list">
              {task.commits.map((commit) => (
                <div key={commit.id}>
                  <strong>{formatCommitLabel(commit)}</strong>
                  <p>
                    {commit.authorName || commit.authorUsername || 'Autor não informado'} ·{' '}
                    {formatDateTime(commit.date)}
                  </p>
                  {commit.githubUrl && <GithubExternalAction href={commit.githubUrl} />}
                </div>
              ))}
            </div>
          ) : (
            <p>Nenhum vínculo</p>
          )}
        </ArtifactCategory>

        <ArtifactCategory label="Issues" count={task.issues?.length || 0}>
          {task.issues?.length ? (
            <div className="task-detail-artifact-list">
              {task.issues.map((issue) => (
                <div key={issue.id}>
                  <strong>{formatIssueLabel(issue)}</strong>
                  <p>
                    {issue.state || 'Status não informado'} · {formatIssueLabels(issue.labels)}
                  </p>
                  {issue.githubUrl && <GithubExternalAction href={issue.githubUrl} />}
                </div>
              ))}
            </div>
          ) : (
            <p>Nenhum vínculo</p>
          )}
        </ArtifactCategory>
      </div>
    </section>
  );
}

export function TaskDetailsPanel({
  task,
  members = [],
  canEdit = false,
  canDelete = false,
  deleting,
  returnFocusRef,
  onClose,
  onDelete,
  onSave,
  onSaved,
  projectId
}) {
  const confirm = useConfirm();
  const formId = useId();
  const titleRef = useRef(null);
  const editButtonRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => taskDraft(task || {}));
  const [baseline, setBaseline] = useState(() => taskDraft(task || {}));
  const [traceabilityDraft, setTraceabilityDraft] = useState(() =>
    createTaskTraceabilityDraft(task || {})
  );
  const [traceabilityBaseline, setTraceabilityBaseline] = useState(() =>
    createTaskTraceabilityDraft(task || {})
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const taskIdRef = useRef(task?.id);
  const taskFieldsDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(baseline),
    [baseline, draft]
  );
  const traceabilityDirty = useMemo(
    () =>
      taskTraceabilitySnapshot(traceabilityDraft) !==
      taskTraceabilitySnapshot(traceabilityBaseline),
    [traceabilityBaseline, traceabilityDraft]
  );
  const dirty = taskFieldsDirty || traceabilityDirty;

  useEffect(() => {
    if (String(taskIdRef.current) === String(task?.id)) return;
    taskIdRef.current = task?.id;
    const nextDraft = taskDraft(task || {});
    const nextTraceability = createTaskTraceabilityDraft(task || {});
    setEditing(false);
    setDraft(nextDraft);
    setBaseline(nextDraft);
    setTraceabilityDraft(nextTraceability);
    setTraceabilityBaseline(nextTraceability);
    setSaving(false);
    setSaveError('');
    setFieldErrors({});
  }, [task]);

  useEffect(
    () => () => {
      taskIdRef.current = null;
    },
    []
  );

  useEffect(() => {
    if (!task || editing) return;
    const nextDraft = taskDraft(task);
    const nextTraceability = createTaskTraceabilityDraft(task);
    setDraft(nextDraft);
    setBaseline(nextDraft);
    setTraceabilityDraft(nextTraceability);
    setTraceabilityBaseline(nextTraceability);
  }, [editing, task]);

  useEffect(() => {
    if (editing) titleRef.current?.focus();
  }, [editing]);

  if (!task) return null;

  function focusEditButton() {
    window.requestAnimationFrame(() => editButtonRef.current?.focus());
  }

  function enterEditing() {
    const nextDraft = taskDraft(task);
    const nextTraceability = createTaskTraceabilityDraft(task);
    setDraft(nextDraft);
    setBaseline(nextDraft);
    setTraceabilityDraft(nextTraceability);
    setTraceabilityBaseline(nextTraceability);
    setFieldErrors({});
    setSaveError('');
    setEditing(true);
  }

  async function confirmDiscard(description) {
    return confirm({
      title: 'Descartar alterações?',
      description,
      confirmLabel: 'Descartar alterações'
    });
  }

  async function requestClose() {
    if (saving) return;
    if (
      editing &&
      dirty &&
      !(await confirmDiscard('As alterações não salvas desta tarefa serão perdidas.'))
    ) {
      return;
    }
    onClose();
  }

  async function cancelEditing() {
    if (
      saving ||
      (dirty && !(await confirmDiscard('As alterações não salvas desta tarefa serão perdidas.')))
    ) {
      return;
    }
    const nextDraft = taskDraft(task);
    const nextTraceability = createTaskTraceabilityDraft(task);
    setDraft(nextDraft);
    setBaseline(nextDraft);
    setTraceabilityDraft(nextTraceability);
    setTraceabilityBaseline(nextTraceability);
    setFieldErrors({});
    setSaveError('');
    setEditing(false);
    focusEditButton();
  }

  function changeDraft(event) {
    const { name, value } = event.target;
    setDraft((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: undefined }));
  }

  async function submitEdit(event) {
    event.preventDefault();
    const errors = {};
    if (!draft.title.trim()) errors.title = 'O título da tarefa é obrigatório.';
    for (const field of ['estimatedEffort', 'actualEffort']) {
      const value = draft[field];
      if (value !== '' && (!Number.isInteger(Number(value)) || Number(value) < 0)) {
        errors[field] = 'Informe um número inteiro maior ou igual a zero.';
      }
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      window.requestAnimationFrame(() => titleRef.current?.focus());
      return;
    }

    setSaving(true);
    setSaveError('');
    setFieldErrors({});
    let updatedTask = task;
    let confirmedChanges = 0;
    const failures = [];
    let taskFailure = null;

    if (taskFieldsDirty) {
      try {
        const savedTask = await onSave(task, draftPayload(draft, baseline));
        if (String(taskIdRef.current) !== String(task.id)) return;
        if (savedTask) {
          updatedTask = savedTask;
          confirmedChanges += 1;
        } else {
          failures.push('Não foi possível salvar os dados da tarefa.');
        }
      } catch (requestError) {
        taskFailure = normalizeApiError(
          requestError,
          'Não foi possível salvar os dados da tarefa.'
        );
        failures.push(taskFailure.message);
      }
    }

    if (traceabilityDirty) {
      const traceabilityResult = await persistTaskTraceability(updatedTask, traceabilityDraft);
      if (String(taskIdRef.current) !== String(task.id)) return;
      updatedTask = traceabilityResult.task;
      confirmedChanges += traceabilityResult.successCount;
      failures.push(...traceabilityResult.failures);
    }

    if (confirmedChanges === 0 && failures.length > 0) {
      setSaveError(failures.join(' '));
      if (taskFailure) {
        setFieldErrors(taskFailure.fieldErrors);
        const firstInvalid = Object.keys(taskFailure.fieldErrors)[0];
        if (firstInvalid) {
          window.requestAnimationFrame(() =>
            document.getElementById(formId)?.elements.namedItem(firstInvalid)?.focus()
          );
        }
      }
      setSaving(false);
      return;
    }

    const warning = failures.length
      ? `Algumas alterações não puderam ser atualizadas. ${failures.join(' ')}`
      : '';
    await onSaved?.(updatedTask, {
      successMessage: warning
        ? 'As alterações confirmadas foram atualizadas.'
        : 'Tarefa atualizada com sucesso.',
      warning
    });
    const nextDraft = taskDraft(updatedTask);
    const nextTraceability = createTaskTraceabilityDraft(updatedTask);
    setDraft(nextDraft);
    setBaseline(nextDraft);
    setTraceabilityDraft(nextTraceability);
    setTraceabilityBaseline(nextTraceability);
    setEditing(false);
    setSaving(false);
    focusEditButton();
  }

  function handleSuggestionConfirmed(commit) {
    const addCommit = (value) => ({
      ...value,
      commits: value.commits.some((item) => String(item.id) === String(commit.id))
        ? value.commits
        : [...value.commits, commit]
    });
    setTraceabilityBaseline(addCommit);
    onSaved?.(
      { ...task, commits: addCommit(createTaskTraceabilityDraft(task)).commits },
      { successMessage: 'Sugestão confirmada e commit vinculado à tarefa.' }
    );
  }

  const headerActions = editing ? (
    <>
      <button
        type="button"
        className="button button-outline button-compact"
        disabled={saving}
        onClick={() => void cancelEditing()}
      >
        Cancelar edição
      </button>
      <button
        type="submit"
        form={formId}
        className="button button-primary button-compact"
        disabled={saving || !dirty}
      >
        {saving ? 'Salvando...' : 'Salvar alterações'}
      </button>
    </>
  ) : (
    <>
      {canEdit && (
        <button
          ref={editButtonRef}
          type="button"
          className="button button-outline button-compact"
          onClick={enterEditing}
        >
          Editar tarefa
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          className="button button-danger button-compact"
          onClick={() => onDelete(task)}
          disabled={deleting}
        >
          {deleting ? 'Excluindo...' : 'Excluir tarefa'}
        </button>
      )}
    </>
  );

  return (
    <KanbanDialog
      title={`#${task.id} ${task.title}`}
      description={editing ? 'Editando informações e rastreabilidade' : 'Detalhes da tarefa'}
      size="wide"
      returnFocusRef={returnFocusRef}
      onClose={() => void requestClose()}
      headerActions={headerActions}
    >
      <div className="task-detail-layout">
        <section className="task-detail-main">
          {saveError && (
            <div className="message message-error" role="alert">
              {saveError}
            </div>
          )}
          {editing ? (
            <form className="task-detail-unified-edit" id={formId} onSubmit={submitEdit} noValidate>
              <section
                className="task-detail-section"
                aria-labelledby="task-detail-edit-information-title"
              >
                <h3 id="task-detail-edit-information-title">Informações</h3>
                <TaskEditForm
                  task={task}
                  draft={draft}
                  errors={fieldErrors}
                  members={members}
                  titleRef={titleRef}
                  saving={saving}
                  onChange={changeDraft}
                />
              </section>
              <section
                className="task-detail-section task-detail-traceability"
                aria-labelledby="task-detail-edit-traceability-title"
              >
                <div className="task-detail-section-heading">
                  <h3 id="task-detail-edit-traceability-title">Rastreabilidade</h3>
                  <p>Vínculos atuais permanecem visíveis até você salvar.</p>
                </div>
                <TaskTraceabilityEditor
                  key={task.id}
                  projectId={projectId}
                  task={task}
                  draft={traceabilityDraft}
                  onDraftChange={setTraceabilityDraft}
                  disabled={saving}
                  onSuggestionConfirmed={handleSuggestionConfirmed}
                />
              </section>
            </form>
          ) : (
            <TaskInformation task={task} />
          )}
          {!editing && <TaskTraceability task={task} />}
        </section>
        <TaskComments taskId={task.id} />
      </div>
    </KanbanDialog>
  );
}
