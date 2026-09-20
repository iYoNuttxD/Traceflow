import { ContextualTestCaseCreate, useTestCaseScope } from '../../testCases/index.js';
import { CollapsibleFilterPanel, SprintActionsMenu, SprintDialog } from '../../schedule/index.js';
import { membersApi } from '../../members/index.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import {
  deleteRequirement,
  replaceRequirementTasks,
  requirementsApi
} from '../api/requirements.api.js';
import {
  getRequirementTaskCoverage,
  getRequirementTraceability,
  getRequirementsTraceability,
  TraceabilityWorkspace
} from '../../traceability/index.js';
import { projectsApi } from '../../projects/index.js';
import { tasksApi } from '../../tasks/index.js';
import {
  ContextualErrorPage,
  EmptyState,
  FeedbackRegion,
  LoadingState,
  SearchCombobox,
  SelectControl,
  TraceFlowIcon,
  classifyPageError,
  getErrorRequestId,
  normalizeApiError,
  useConfirm
} from '../../../shared/index.js';
import { ProjectSectionNav } from '../../projects/index.js';
import { RequirementDetails } from '../components/RequirementDetails.jsx';
import '../../../shared/styles/traceability-controls.css';
import './RequirementsScreen.css';

const emptyRequirementForm = { title: '', description: '', type: 'FUNCIONAL', taskIds: [] };
const typeLabels = {
  FUNCIONAL: 'Funcional',
  NAO_FUNCIONAL: 'Não funcional',
  REGRA_NEGOCIO: 'Regra de negócio'
};
const statusLabels = {
  PLANEJADO: 'Planejado',
  EM_VALIDACAO: 'Em validação',
  EM_CORRECAO: 'Em correção',
  CADASTRADO: 'Cadastrado',
  APROVADO: 'Aprovado',
  EM_IMPLEMENTACAO: 'Em implementação',
  VALIDADO: 'Validado',
  PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
  A_FAZER: 'A Fazer'
};

const errorMessage = (error, fallback) => normalizeApiError(error, fallback).message;
const taskLabel = (task) => `${task.title} — ${statusLabels[task.status] || task.status}`;
function macroStatus(value) {
  if (['CADASTRADO', 'APROVADO', 'PENDENTE', 'A_FAZER'].includes(value)) return 'PLANEJADO';
  if (value === 'EM_ANDAMENTO') return 'EM_IMPLEMENTACAO';
  if (value === 'VALIDADO') return 'EM_VALIDACAO';
  return value;
}
function toForm(requirement) {
  return {
    title: requirement.title || '',
    description: requirement.description || '',
    type: requirement.type || 'FUNCIONAL',
    taskIds: (requirement.tasks || []).map((task) => String(task.id))
  };
}
function toPayload(form) {
  const payload = { ...form };
  delete payload.taskIds;
  if (!['FUNCIONAL', 'NAO_FUNCIONAL'].includes(payload.type)) delete payload.type;
  return payload;
}
async function loadAllProjections(projectId, signal) {
  const first = await getRequirementsTraceability(projectId, { page: 1, limit: 100 }, { signal });
  const items = [...first.items];
  for (let page = 2; page <= first.pagination.totalPages; page += 1) {
    const next = await getRequirementsTraceability(projectId, { page, limit: 100 }, { signal });
    items.push(...next.items);
  }
  return items;
}

function RequirementForm({
  projectId,
  form,
  taskOptions,
  submitting,
  onChange,
  onTaskOptionsChange,
  onSelectTask,
  onRemoveTask,
  onCancel,
  onSubmit
}) {
  const selectedTasks = form.taskIds
    .map((id) => taskOptions.find((task) => String(task.id) === String(id)))
    .filter(Boolean);
  const searchTasks = useCallback(
    async (search, signal) => {
      const response = await tasksApi.list(projectId, { search }, { signal });
      const tasks = response.data.tasks || [];
      onTaskOptionsChange((current) => {
        const next = [...current];
        for (const task of tasks) {
          if (!next.some((item) => String(item.id) === String(task.id))) next.push(task);
        }
        return next;
      });
      return tasks;
    },
    [onTaskOptionsChange, projectId]
  );
  return (
    <form className="requirement-form" onSubmit={onSubmit}>
      <label className="field field-full">
        <span>Título do requisito</span>
        <input
          required
          type="text"
          value={form.title}
          onChange={(event) => onChange('title', event.target.value)}
          placeholder="Informe o título do requisito"
        />
      </label>
      <label className="field field-full">
        <span>Descrição</span>
        <textarea
          rows="5"
          value={form.description}
          onChange={(event) => onChange('description', event.target.value)}
          placeholder="Descreva a necessidade do projeto"
        />
      </label>
      <label className="field field-full">
        <span>Tipo do requisito</span>
        <SelectControl value={form.type} onChange={(event) => onChange('type', event.target.value)}>
          {form.type && !['FUNCIONAL', 'NAO_FUNCIONAL'].includes(form.type) && (
            <option value={form.type} disabled>
              {typeLabels[form.type] || form.type} (legado)
            </option>
          )}
          <option value="FUNCIONAL">Funcional</option>
          <option value="NAO_FUNCIONAL">Não funcional</option>
        </SelectControl>
      </label>
      <section className="requirement-task-picker field-full" aria-labelledby="linked-tasks-title">
        <div>
          <h3 id="linked-tasks-title">Tarefas vinculadas</h3>
          <p className="field-help">Pesquise e vincule tarefas deste projeto.</p>
        </div>
        {selectedTasks.length > 0 && (
          <div className="traceability-selected-list">
            {selectedTasks.map((task) => (
              <div className="traceability-selected-item" key={task.id}>
                <strong>{taskLabel(task)}</strong>
                <button
                  className="traceability-remove-button"
                  type="button"
                  onClick={() => onRemoveTask(task.id)}
                  aria-label={`Remover ${task.title}`}
                  title="Remover tarefa"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <SearchCombobox
          label="Adicionar tarefa"
          placeholder="Pesquisar por título, responsável ou status..."
          onSearch={searchTasks}
          onSelect={onSelectTask}
          isOptionDisabled={(task) => form.taskIds.some((id) => String(id) === String(task.id))}
          getOptionLabel={taskLabel}
          renderOption={taskLabel}
          emptyMessage="Nenhuma tarefa encontrada."
        />
      </section>
      <footer className="form-actions field-full">
        <button className="button button-secondary" type="button" onClick={onCancel}>
          Cancelar
        </button>
        <button className="button button-primary" type="submit" disabled={submitting}>
          {submitting ? 'Salvando...' : 'Salvar requisito'}
        </button>
      </footer>
    </form>
  );
}

function RequirementCard({
  requirement,
  projection,
  canWrite,
  deleting,
  onDetails,
  onGraph,
  onEdit,
  onDelete
}) {
  const tasks = requirement.tasks?.length ?? 0;
  const status = projection?.requirement.status || macroStatus(requirement.status);
  const openFromCard = (event) => {
    if (event.target.closest('button, a, [role="menu"]')) return;
    onDetails(requirement, event.currentTarget);
  };
  return (
    <article
      id={`requirement-${requirement.id}`}
      className="requirement-catalog-card"
      tabIndex={0}
      aria-label={`REQ-${requirement.id} · ${requirement.title}`}
      onClick={openFromCard}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) {
          event.preventDefault();
          onDetails(requirement, event.currentTarget);
        }
      }}
    >
      <header className="requirement-catalog-card__header">
        <div>
          <span className="eyebrow">REQ-{requirement.id}</span>
          <h3>{requirement.title}</h3>
        </div>
        <span className={`status-badge status-${status.toLowerCase()}`}>
          {statusLabels[status] || status}
        </span>
      </header>
      <div className="requirement-catalog-card__body">
        <p className="requirement-catalog-card__description">
          {requirement.description || 'Sem descrição cadastrada.'}
        </p>
        <span className="requirement-type">{typeLabels[requirement.type] || requirement.type}</span>
        <p className="requirement-task-count">
          {tasks} {tasks === 1 ? 'tarefa vinculada' : 'tarefas vinculadas'}
        </p>
      </div>
      <footer className="requirement-catalog-card__actions">
        <button
          type="button"
          className="button button-primary"
          onClick={(event) => onGraph(requirement, event.currentTarget)}
        >
          Ver rastreabilidade
        </button>
        {canWrite && (
          <SprintActionsMenu
            entityName={`REQ-${requirement.id}`}
            entityDescriptor="do requisito"
            disabled={deleting}
            items={[
              {
                key: 'edit',
                label: 'Editar requisito',
                ariaLabel: `Editar REQ-${requirement.id}`,
                onSelect: (trigger) => onEdit(requirement, trigger)
              },
              {
                key: 'delete',
                label: deleting ? 'Excluindo...' : 'Excluir requisito',
                ariaLabel: `Excluir REQ-${requirement.id}`,
                danger: true,
                disabled: deleting,
                onSelect: () => onDelete(requirement)
              }
            ]}
          />
        )}
      </footer>
    </article>
  );
}

function NewRequirementCard({ onOpen }) {
  return (
    <button className="new-requirement-card" type="button" onClick={onOpen}>
      <span className="new-requirement-card__icon" aria-hidden="true">
        <TraceFlowIcon name="plus" />
      </span>
      <strong>Novo requisito</strong>
      <small>Cadastre uma nova necessidade do projeto.</small>
    </button>
  );
}

export function RequirementsScreen() {
  const confirm = useConfirm();
  const { projectId } = useParams();
  const [searchParams] = useSearchParams();
  const scope = useTestCaseScope(projectId);
  const [project, setProject] = useState(null);
  const [requirements, setRequirements] = useState([]);
  const [projections, setProjections] = useState([]);
  const [taskCoverage, setTaskCoverage] = useState(null);
  const [membership, setMembership] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filters, setFilters] = useState({ search: '', status: '', type: '' });
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyRequirementForm);
  const [taskOptions, setTaskOptions] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [details, setDetails] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [caseRequirement, setCaseRequirement] = useState(null);
  const [caseBusy, setCaseBusy] = useState(false);
  const [graph, setGraph] = useState({
    requirementId: null,
    data: null,
    error: null,
    loading: false
  });
  const formFocus = useRef(null);
  const detailsFocus = useRef(null);
  const workspaceFocus = useRef(null);
  const handledDeepLink = useRef('');
  const canWrite = Boolean(membership && membership.role !== 'VIEWER');

  const loadData = useCallback(async () => {
    const token = scope.begin('page');
    setLoading(true);
    setPageError(null);
    try {
      const [projectResponse, requirementsResponse, coverage, projectionItems] = await Promise.all([
        projectsApi.get(projectId, { signal: token.controller.signal }),
        requirementsApi.listByProject(projectId, {}, { signal: token.controller.signal }),
        getRequirementTaskCoverage(projectId, { signal: token.controller.signal }),
        loadAllProjections(projectId, token.controller.signal)
      ]);
      if (!scope.accepts('page', token)) return;
      setProject(projectResponse.data.project);
      setRequirements(requirementsResponse.data.requirements || []);
      setTaskCoverage(coverage);
      setProjections(projectionItems);
    } catch (requestError) {
      if (scope.accepts('page', token)) {
        setPageError(
          normalizeApiError(requestError, 'Não foi possível carregar os requisitos do projeto.')
        );
      }
    } finally {
      if (scope.accepts('page', token)) setLoading(false);
    }
  }, [projectId, scope]);
  useEffect(() => void loadData(), [loadData]);
  useEffect(() => {
    const token = scope.begin('membership');
    setMembership(null);
    void membersApi
      .list(projectId, { signal: token.controller.signal, fresh: true })
      .then((data) => {
        if (scope.accepts('membership', token)) setMembership(data.currentMembership);
      })
      .catch(() => {});
  }, [projectId, scope]);

  const projectionById = useMemo(
    () => new Map(projections.map((item) => [String(item.requirement.id), item])),
    [projections]
  );
  const loadGraph = useCallback(
    async (requirement) => {
      const token = scope.begin('graph');
      setGraph({ requirementId: requirement.id, data: null, error: null, loading: true });
      try {
        const data = await getRequirementTraceability(
          projectId,
          requirement.id,
          { expanded: true, limit: 100 },
          { signal: token.controller.signal }
        );
        if (scope.accepts('graph', token)) {
          setGraph({ requirementId: requirement.id, data, error: null, loading: false });
        }
      } catch (requestError) {
        if (scope.accepts('graph', token)) {
          setGraph({
            requirementId: requirement.id,
            data: null,
            error: normalizeApiError(requestError, 'Não foi possível carregar a rastreabilidade.'),
            loading: false
          });
        }
      }
    },
    [projectId, scope]
  );
  const openDetails = useCallback(
    (requirement, trigger) => {
      detailsFocus.current = trigger || document.activeElement;
      setWorkspace(null);
      setDetails(requirement);
      void loadGraph(requirement);
    },
    [loadGraph]
  );
  const openGraph = useCallback(
    (requirement, trigger) => {
      workspaceFocus.current = trigger || detailsFocus.current;
      setDetails(null);
      setWorkspace(requirement);
      if (
        String(graph.requirementId) !== String(requirement.id) ||
        (!graph.data && !graph.loading)
      ) {
        void loadGraph(requirement);
      }
    },
    [graph.data, graph.loading, graph.requirementId, loadGraph]
  );
  useEffect(() => {
    const id = searchParams.get('requirement');
    const key = `${projectId}:${id || ''}`;
    if (!id || !/^\d+$/.test(id) || handledDeepLink.current === key) return;
    const requirement = requirements.find((item) => String(item.id) === id);
    if (!requirement) return;
    handledDeepLink.current = key;
    openDetails(requirement, document.getElementById(`requirement-${id}`));
  }, [openDetails, projectId, requirements, searchParams]);

  const summary = useMemo(
    () =>
      requirements.reduce(
        (result, requirement) => {
          result.total += 1;
          const status =
            projectionById.get(String(requirement.id))?.requirement.status ||
            macroStatus(requirement.status);
          if (status === 'PLANEJADO') result.planned++;
          else if (status === 'EM_IMPLEMENTACAO') result.implementation++;
          else if (status === 'EM_VALIDACAO') result.validation++;
          else if (status === 'EM_CORRECAO') result.correction++;
          else if (status === 'CONCLUIDO') result.done++;
          return result;
        },
        { total: 0, planned: 0, implementation: 0, validation: 0, correction: 0, done: 0 }
      ),
    [projectionById, requirements]
  );
  const filtered = useMemo(() => {
    const search = filters.search.trim().toLocaleLowerCase('pt-BR');
    return requirements.filter(
      (requirement) =>
        (!search ||
          `req-${requirement.id}` === search ||
          requirement.title.toLocaleLowerCase('pt-BR').includes(search)) &&
        (!filters.status ||
          (projectionById.get(String(requirement.id))?.requirement.status ||
            macroStatus(requirement.status)) === filters.status) &&
        (!filters.type || requirement.type === filters.type)
    );
  }, [filters, projectionById, requirements]);
  const resetForm = () => {
    setEditingId(null);
    setForm(emptyRequirementForm);
    setTaskOptions([]);
  };
  function openForm(requirement = null, trigger = null) {
    formFocus.current = trigger || document.activeElement;
    setError('');
    if (requirement) {
      setEditingId(requirement.id);
      setForm(toForm(requirement));
      setTaskOptions(requirement.tasks || []);
    } else resetForm();
    setDetails(null);
    setFormOpen(true);
  }
  const closeForm = useCallback(() => {
    if (submitting) return;
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyRequirementForm);
    setTaskOptions([]);
  }, [submitting]);
  const closeDetails = useCallback(() => {
    scope.cancelRead('graph');
    setDetails(null);
    setGraph({ requirementId: null, data: null, error: null, loading: false });
  }, [scope]);
  const closeWorkspace = useCallback(() => {
    scope.cancelRead('graph');
    setWorkspace(null);
    setGraph({ requirementId: null, data: null, error: null, loading: false });
  }, [scope]);
  const backFromCase = useCallback(() => {
    if (caseBusy) return;
    setCaseRequirement((requirement) => {
      if (requirement) setDetails(requirement);
      return null;
    });
  }, [caseBusy]);
  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const response = editingId
        ? await requirementsApi.update(editingId, toPayload(form))
        : await requirementsApi.create(projectId, toPayload(form));
      const saved = response.data.requirement;
      const links = await replaceRequirementTasks(saved.id, form.taskIds.map(Number));
      setSuccess(
        links.reassignedTasks?.length
          ? `${response.data.message} Uma ou mais tarefas foram reassociadas.`
          : response.data.message
      );
      setFormOpen(false);
      resetForm();
      await loadData();
    } catch (requestError) {
      setError(errorMessage(requestError, 'Não foi possível salvar o requisito.'));
    } finally {
      setSubmitting(false);
    }
  }
  async function remove(requirement) {
    const confirmed = await confirm({
      title: 'Excluir requisito',
      description:
        'Esta ação não poderá ser desfeita. As tarefas vinculadas serão mantidas, mas ficarão sem requisito vinculado.',
      confirmLabel: 'Excluir requisito'
    });
    if (!confirmed) return;
    setDeletingId(requirement.id);
    setError('');
    try {
      const response = await deleteRequirement(requirement.id);
      setDetails(null);
      setWorkspace(null);
      setSuccess(response.message || 'Requisito excluído com sucesso.');
      await loadData();
    } catch (requestError) {
      setError(errorMessage(requestError, 'Não foi possível excluir o requisito.'));
    } finally {
      setDeletingId(null);
    }
  }

  if (loading && !project)
    return (
      <main className="page-container requirements-screen">
        <LoadingState message="Carregando requisitos..." />
      </main>
    );
  if (!project && pageError)
    return (
      <ContextualErrorPage
        type={classifyPageError(pageError)}
        description={pageError.message}
        requestId={getErrorRequestId(pageError)}
        retryAfterSeconds={pageError.retryAfterSeconds}
        onRetry={loadData}
      />
    );

  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const activeFilters = activeFilterCount > 0;
  return (
    <main className="page-container requirements-screen">
      <div
        className="requirements-content"
        inert={formOpen || details || workspace || caseRequirement ? true : undefined}
      >
        <header className="page-header requirements-header">
          <div>
            <span className="eyebrow">Requisitos</span>
            <h1>Requisitos</h1>
            <p>Visão geral dos requisitos de {project?.name || 'projeto'} e de sua organização.</p>
          </div>
          <ProjectSectionNav projectId={projectId} activeSection="requirements" />
        </header>
        <FeedbackRegion error={error} success={success} />
        <section className="requirements-overview" aria-labelledby="requirements-summary-title">
          <header>
            <div>
              <span className="eyebrow">Resumo</span>
              <h2 id="requirements-summary-title">Visão geral dos requisitos</h2>
            </div>
            <p>Acompanhe como as necessidades do projeto estão definidas e organizadas.</p>
          </header>
          <dl>
            {[
              ['Total', summary.total],
              ['Planejados', summary.planned],
              ['Em implementação', summary.implementation],
              ['Em validação', summary.validation],
              ['Em correção', summary.correction],
              ['Concluídos', summary.done]
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
            <div className="requirements-overview__coverage">
              <dt>Cobertura com tarefas</dt>
              <dd>{taskCoverage?.coveragePercentage ?? 0}%</dd>
              <small>
                {taskCoverage
                  ? `${taskCoverage.linkedRequirements} de ${taskCoverage.totalRequirements} requisitos`
                  : '0 de 0 requisitos'}
              </small>
            </div>
          </dl>
        </section>
        <CollapsibleFilterPanel
          id="requirements-filters"
          className="requirements-filters"
          resultLabel={
            activeFilters
              ? `${filtered.length} de ${requirements.length} requisitos`
              : `${requirements.length} requisitos`
          }
          activeCount={activeFilterCount}
        >
          {activeFilters && (
            <div className="planning-filter-panel__actions">
              <button
                type="button"
                className="sprint-filters__clear"
                onClick={() => setFilters({ search: '', status: '', type: '' })}
              >
                Limpar filtros
              </button>
            </div>
          )}
          <div className="requirements-filter-grid">
            <label className="sprint-filter requirements-search">
              <span>Busca</span>
              <input
                type="search"
                aria-label="Buscar requisito"
                placeholder="REQ-id ou título"
                value={filters.search}
                onChange={(event) =>
                  setFilters((value) => ({ ...value, search: event.target.value }))
                }
              />
            </label>
            <label className="sprint-filter">
              <span>Status</span>
              <SelectControl
                value={filters.status}
                onChange={(event) =>
                  setFilters((value) => ({ ...value, status: event.target.value }))
                }
              >
                <option value="">Todos</option>
                <option value="PLANEJADO">Planejado</option>
                <option value="EM_IMPLEMENTACAO">Em implementação</option>
                <option value="EM_VALIDACAO">Em validação</option>
                <option value="EM_CORRECAO">Em correção</option>
                <option value="CONCLUIDO">Concluído</option>
              </SelectControl>
            </label>
            <label className="sprint-filter">
              <span>Tipo</span>
              <SelectControl
                value={filters.type}
                onChange={(event) =>
                  setFilters((value) => ({ ...value, type: event.target.value }))
                }
              >
                <option value="">Todos</option>
                <option value="FUNCIONAL">Funcional</option>
                <option value="NAO_FUNCIONAL">Não funcional</option>
                <option value="REGRA_NEGOCIO">Regra de negócio</option>
              </SelectControl>
            </label>
          </div>
        </CollapsibleFilterPanel>
        <section className="requirements-catalog" aria-labelledby="requirements-list-title">
          <header>
            <h2 id="requirements-list-title">Requisitos do projeto</h2>
          </header>
          {filtered.length ? (
            <div className="requirements-grid" role="list">
              {canWrite && (
                <div role="listitem">
                  <NewRequirementCard onOpen={(event) => openForm(null, event.currentTarget)} />
                </div>
              )}
              {filtered.map((requirement) => (
                <div role="listitem" key={requirement.id}>
                  <RequirementCard
                    requirement={requirement}
                    projection={projectionById.get(String(requirement.id))}
                    canWrite={canWrite}
                    deleting={deletingId === requirement.id}
                    onDetails={openDetails}
                    onGraph={openGraph}
                    onEdit={openForm}
                    onDelete={remove}
                  />
                </div>
              ))}
            </div>
          ) : activeFilters ? (
            <EmptyState
              title="Nenhum requisito corresponde aos filtros."
              description="Ajuste a busca ou limpe os filtros para ver outros requisitos."
            />
          ) : (
            <div className="requirements-empty">
              <EmptyState
                title="Nenhum requisito cadastrado."
                description="Cadastre o primeiro requisito para começar a estruturar o planejamento e a rastreabilidade do projeto."
              />
              {canWrite && (
                <button
                  type="button"
                  className="button button-primary"
                  onClick={(event) => openForm(null, event.currentTarget)}
                >
                  + Novo requisito
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      <SprintDialog
        open={formOpen}
        size="large"
        className="requirement-form-dialog"
        title={editingId ? 'Editar requisito' : 'Novo requisito'}
        description={
          editingId
            ? `Atualize os dados de REQ-${editingId}.`
            : 'Cadastre o requisito e seus vínculos iniciais.'
        }
        busy={submitting}
        returnFocusRef={formFocus}
        onClose={closeForm}
      >
        <FeedbackRegion error={error} />
        <RequirementForm
          projectId={projectId}
          form={form}
          taskOptions={taskOptions}
          submitting={submitting}
          onChange={(name, value) => setForm((current) => ({ ...current, [name]: value }))}
          onTaskOptionsChange={setTaskOptions}
          onSelectTask={(task) => {
            setTaskOptions((current) =>
              current.some((item) => String(item.id) === String(task.id))
                ? current
                : [task, ...current]
            );
            setForm((current) =>
              current.taskIds.some((id) => String(id) === String(task.id))
                ? current
                : { ...current, taskIds: [...current.taskIds, String(task.id)] }
            );
          }}
          onRemoveTask={(taskId) =>
            setForm((current) => ({
              ...current,
              taskIds: current.taskIds.filter((id) => String(id) !== String(taskId))
            }))
          }
          onCancel={closeForm}
          onSubmit={submit}
        />
      </SprintDialog>

      {details && (
        <RequirementDetails
          projectId={projectId}
          requirement={details}
          projection={projectionById.get(String(details.id))}
          graph={graph}
          canWrite={canWrite}
          busy={deletingId === details.id}
          returnFocusRef={detailsFocus}
          onClose={closeDetails}
          onRetry={() => loadGraph(details)}
          onEdit={(event) => openForm(details, event.currentTarget)}
          onDelete={() => remove(details)}
          onCreateTestCase={() => {
            setCaseRequirement(details);
            setDetails(null);
          }}
          onOpenGraph={(event) => openGraph(details, event.currentTarget)}
        />
      )}
      {workspace && (
        <TraceabilityWorkspace
          key={workspace.id}
          requirement={{
            id: workspace.id,
            displayId: `REQ-${workspace.id}`,
            title: workspace.title
          }}
          graph={graph}
          onClose={closeWorkspace}
          onRetry={() => loadGraph(workspace)}
          returnFocusRef={workspaceFocus}
        />
      )}
      <SprintDialog
        open={Boolean(caseRequirement)}
        title="Criar caso de teste"
        description={caseRequirement ? `A partir de REQ-${caseRequirement.id}` : undefined}
        busy={caseBusy}
        size="large"
        className="tc-dialog"
        onClose={backFromCase}
        headerActions={
          <button className="button button-secondary" disabled={caseBusy} onClick={backFromCase}>
            Voltar para requisito
          </button>
        }
      >
        {caseRequirement && (
          <ContextualTestCaseCreate
            key={`${projectId}:${caseRequirement.id}`}
            projectId={projectId}
            requirement={caseRequirement}
            onBusyChange={setCaseBusy}
            onBack={backFromCase}
            onCreated={(saved) => {
              const requirement = caseRequirement;
              setSuccess(`${saved.displayId} · Caso de teste criado.`);
              setCaseRequirement(null);
              setDetails(requirement);
              void loadData();
              if (requirement) void loadGraph(requirement);
            }}
          />
        )}
      </SprintDialog>
    </main>
  );
}
