import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  api,
  confirmRequirementCompletion,
  deleteRequirement,
  getRequirementTaskCoverage,
  linkTaskRequirement,
  requirementsApi,
  unlinkTaskRequirement
} from '../api/api.js';
import { Card } from '../components/Card.jsx';
import { ProjectSectionNav } from '../components/ProjectSectionNav.jsx';

const emptyRequirementForm = {
  title: '',
  description: '',
  type: 'FUNCIONAL',
  taskIds: []
};

const typeLabels = {
  FUNCIONAL: 'Funcional',
  NAO_FUNCIONAL: 'Não funcional',
  REGRA_NEGOCIO: 'Regra de negócio'
};

const statusLabels = {
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

function getErrorMessage(error, fallback) {
  return error.response?.data?.message || fallback;
}

function formatDateTime(value) {
  if (!value) {
    return 'Não informado';
  }

  return new Date(value).toLocaleString('pt-BR');
}

function requirementToForm(requirement) {
  return {
    title: requirement.title || '',
    description: requirement.description || '',
    type: requirement.type || 'FUNCIONAL',
    taskIds: (requirement.tasks || []).map((task) => String(task.id))
  };
}

function requirementFormToPayload(formData) {
  const payload = { ...formData };
  delete payload.taskIds;

  if (!['FUNCIONAL', 'NAO_FUNCIONAL'].includes(payload.type)) {
    delete payload.type;
  }

  return payload;
}

function formatTaskLabel(task) {
  if (!task) {
    return 'Tarefa selecionada';
  }

  return `${task.title} — ${statusLabels[task.status] || task.status}`;
}

export function RequirementsPage() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [requirements, setRequirements] = useState([]);
  const [taskResults, setTaskResults] = useState([]);
  const [taskOptions, setTaskOptions] = useState([]);
  const [taskSearch, setTaskSearch] = useState('');
  const [taskCoverage, setTaskCoverage] = useState(null);
  const [formData, setFormData] = useState(emptyRequirementForm);
  const [editingRequirementId, setEditingRequirementId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingRequirementId, setConfirmingRequirementId] = useState(null);
  const [deletingRequirementId, setDeletingRequirementId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadRequirementsData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [projectResponse, requirementsResponse, coverageResponse] = await Promise.all([
        api.get(`/projects/${projectId}`),
        requirementsApi.listByProject(projectId),
        getRequirementTaskCoverage(projectId)
      ]);

      setProject(projectResponse.data.project);
      setRequirements(requirementsResponse.data.requirements || []);
      setTaskCoverage(coverageResponse);
    } catch (requestError) {
      setError(
        getErrorMessage(requestError, 'Não foi possível carregar os requisitos do projeto.')
      );
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadRequirementsData();
  }, [loadRequirementsData]);

  function handleFormChange(name, value) {
    setFormData((current) => ({ ...current, [name]: value }));
  }

  function resetForm() {
    setEditingRequirementId(null);
    setFormData(emptyRequirementForm);
    setTaskResults([]);
    setTaskSearch('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const selectedTaskIds = (formData.taskIds || []).map(Number);
      const editingRequirement = editingRequirementId
        ? requirements.find(
            (requirement) => String(requirement.id) === String(editingRequirementId)
          )
        : null;
      const previousTaskIds = (editingRequirement?.tasks || []).map((task) => task.id);
      const payload = requirementFormToPayload(formData);
      const response = editingRequirementId
        ? await requirementsApi.update(editingRequirementId, payload)
        : await requirementsApi.create(projectId, payload);
      const savedRequirement = response.data.requirement;
      const tasksToLink = selectedTaskIds.filter((taskId) => !previousTaskIds.includes(taskId));
      const tasksToUnlink = previousTaskIds.filter((taskId) => !selectedTaskIds.includes(taskId));
      let linkWarning = '';

      try {
        for (const taskId of tasksToLink) {
          const task = [...taskOptions, ...taskResults].find(
            (item) => String(item.id) === String(taskId)
          );
          const previousRequirementId = task?.requirementId;

          await linkTaskRequirement(taskId, savedRequirement.id);

          if (
            previousRequirementId &&
            String(previousRequirementId) !== String(savedRequirement.id)
          ) {
            linkWarning =
              'Esta tarefa já estava vinculada a outro requisito e foi atualizada para este requisito.';
          }
        }

        for (const taskId of tasksToUnlink) {
          await unlinkTaskRequirement(taskId);
        }
      } catch (linkError) {
        linkWarning =
          getErrorMessage(linkError, 'Requisito salvo, mas não foi possível atualizar as tarefas vinculadas.');
      }

      setSuccess(response.data.message);
      resetForm();
      await loadRequirementsData();
      if (linkWarning) {
        setError(linkWarning);
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível salvar o requisito.'));
    } finally {
      setSubmitting(false);
    }
  }

  function startEditing(requirement) {
    setEditingRequirementId(requirement.id);
    setFormData(requirementToForm(requirement));
    setTaskOptions((current) => {
      const nextTasks = [...current];

      for (const task of requirement.tasks || []) {
        if (!nextTasks.some((item) => String(item.id) === String(task.id))) {
          nextTasks.unshift(task);
        }
      }

      return nextTasks;
    });
    setError('');
    setSuccess('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const searchTasks = useCallback(
    async (search) => {
      try {
        const response = await api.get(`/projects/${projectId}/tasks`, {
          params: { search }
        });
        const foundTasks = response.data.tasks || [];
        setTaskResults(foundTasks);
        setTaskOptions((current) => {
          const nextTasks = [...current];

          for (const task of foundTasks) {
            if (!nextTasks.some((item) => String(item.id) === String(task.id))) {
              nextTasks.push(task);
            }
          }

          return nextTasks;
        });
      } catch (requestError) {
        setError(getErrorMessage(requestError, 'Não foi possível carregar tarefas.'));
      }
    },
    [projectId]
  );

  useEffect(() => {
    const query = taskSearch.trim();

    if (query.length < 2) {
      setTaskResults([]);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      searchTasks(query);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchTasks, taskSearch]);

  function handleSelectTask(task) {
    setTaskOptions((current) =>
      current.some((item) => String(item.id) === String(task.id))
        ? current
        : [task, ...current]
    );
    setFormData((current) => {
      const taskIds = current.taskIds || [];

      if (taskIds.some((taskId) => String(taskId) === String(task.id))) {
        return current;
      }

      return {
        ...current,
        taskIds: [...taskIds, String(task.id)]
      };
    });
    setTaskSearch('');
    setTaskResults([]);
  }

  function handleRemoveTask(taskId) {
    setFormData((current) => ({
      ...current,
      taskIds: (current.taskIds || []).filter(
        (currentTaskId) => String(currentTaskId) !== String(taskId)
      )
    }));
  }

  async function handleConfirmCompletion(requirementId) {
    setConfirmingRequirementId(requirementId);
    setError('');
    setSuccess('');

    try {
      const response = await confirmRequirementCompletion(requirementId);
      setSuccess(response.message || 'Requisito concluído com sucesso.');
      setRequirements((current) =>
        current.map((requirement) =>
          String(requirement.id) === String(requirementId)
            ? response.requirement
            : requirement
        )
      );
      await loadRequirementsData();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível concluir o requisito.'));
    } finally {
      setConfirmingRequirementId(null);
    }
  }

  async function handleDeleteRequirement(requirement) {
    const confirmed = window.confirm(
      'Tem certeza que deseja excluir este requisito?\n\nEsta ação não poderá ser desfeita. As tarefas vinculadas serão mantidas, mas ficarão sem requisito vinculado.'
    );

    if (!confirmed) {
      return;
    }

    setDeletingRequirementId(requirement.id);
    setError('');
    setSuccess('');

    try {
      const response = await deleteRequirement(requirement.id);

      if (String(editingRequirementId) === String(requirement.id)) {
        resetForm();
      }

      setSuccess(response.message || 'Requisito excluído com sucesso.');
      await loadRequirementsData();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível excluir o requisito.'));
    } finally {
      setDeletingRequirementId(null);
    }
  }

  if (loading) {
    return (
      <main className="page-container">
        <p className="empty-state">Carregando requisitos...</p>
      </main>
    );
  }

  const selectedTasks = (formData.taskIds || [])
    .map((taskId) => taskOptions.find((task) => String(task.id) === String(taskId)))
    .filter(Boolean);
  const availableTaskResults = taskResults.filter(
    (task) => !(formData.taskIds || []).some((taskId) => String(taskId) === String(task.id))
  );
  const requirementSummary = requirements.reduce(
    (summary, requirement) => {
      summary.total += 1;

      if (requirement.status === 'CADASTRADO' || requirement.status === 'PENDENTE') {
        summary.registered += 1;
      } else if (requirement.status === 'APROVADO') {
        summary.approved += 1;
      } else if (requirement.status === 'EM_IMPLEMENTACAO') {
        summary.inProgress += 1;
      } else if (requirement.status === 'VALIDADO' || requirement.status === 'CONCLUIDO') {
        summary.validatedOrDone += 1;
      }

      return summary;
    },
    {
      total: 0,
      registered: 0,
      approved: 0,
      inProgress: 0,
      validatedOrDone: 0
    }
  );

  return (
    <main className="page-container">
      <Link className="back-link" to={`/projects/${projectId}`}>
        ← Voltar para o projeto
      </Link>

      <header className="page-header">
        <div>
          <span className="eyebrow">Projeto #{projectId}</span>
          <h1>Requisitos do projeto</h1>
          <p>
            {project
              ? `Cadastre e acompanhe os requisitos de ${project.name}.`
              : 'Cadastre e acompanhe os requisitos associados ao projeto.'}
          </p>
        </div>
        <ProjectSectionNav projectId={projectId} activeSection="requirements" />
      </header>

      {error && <div className="message message-error">{error}</div>}
      {success && <div className="message message-success">{success}</div>}

      <div className="requirements-summary">
        <Card title="Total de requisitos">
          <strong className="metric-value">{requirementSummary.total}</strong>
        </Card>

        <Card title="Cadastrados">
          <strong className="metric-value">{requirementSummary.registered}</strong>
        </Card>

        <Card title="Aprovados">
          <strong className="metric-value">{requirementSummary.approved}</strong>
        </Card>

        <Card title="Em implementação">
          <strong className="metric-value">{requirementSummary.inProgress}</strong>
        </Card>

        <Card title="Validados/concluídos">
          <strong className="metric-value">{requirementSummary.validatedOrDone}</strong>
        </Card>

        <Card title="Cobertura com tarefas">
          <strong className="metric-value">{taskCoverage?.coveragePercentage ?? 0}%</strong>
          <p className="metric-description">
            {taskCoverage
              ? `${taskCoverage.linkedRequirements} de ${taskCoverage.totalRequirements} requisitos possuem tarefas vinculadas.`
              : '0 de 0 requisitos possuem tarefas vinculadas.'}
          </p>
        </Card>
      </div>

      <div className="requirements-layout">
        <Card title={editingRequirementId ? 'Editar requisito' : 'Cadastrar requisito'}>
          <form className="requirement-form" onSubmit={handleSubmit}>
            <label className="field field-full">
              <span>Título do requisito</span>
              <input
                type="text"
                value={formData.title}
                onChange={(event) => handleFormChange('title', event.target.value)}
                placeholder="Informe o título do requisito"
              />
            </label>

            <label className="field field-full">
              <span>Descrição</span>
              <textarea
                rows="5"
                value={formData.description}
                onChange={(event) => handleFormChange('description', event.target.value)}
                placeholder="Descreva a necessidade do projeto"
              />
            </label>

            <label className="field">
              <span>Tipo do requisito</span>
              <select
                value={formData.type}
                onChange={(event) => handleFormChange('type', event.target.value)}
              >
                {formData.type &&
                  !['FUNCIONAL', 'NAO_FUNCIONAL'].includes(formData.type) && (
                    <option value={formData.type} disabled>
                      {typeLabels[formData.type] || formData.type} (legado)
                    </option>
                  )}
                <option value="FUNCIONAL">Funcional</option>
                <option value="NAO_FUNCIONAL">Não funcional</option>
              </select>
            </label>

            <section className="task-traceability-form field-full">
              <div>
                <span className="form-section-title">Rastreabilidade</span>
                <p className="field-help">
                  Vincule tarefas do projeto a este requisito.
                </p>
              </div>

              <div className="traceability-picker">
                <span>Tarefas vinculadas</span>
                {selectedTasks.length > 0 && (
                  <div className="traceability-selected-list">
                    {selectedTasks.map((task) => (
                      <div className="traceability-selected-item" key={task.id}>
                        <strong>{formatTaskLabel(task)}</strong>
                        <button
                          className="traceability-remove-button"
                          type="button"
                          onClick={() => handleRemoveTask(task.id)}
                          aria-label="Remover tarefa vinculada"
                          title="Remover tarefa"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <input
                  type="search"
                  value={taskSearch}
                  onChange={(event) => setTaskSearch(event.target.value)}
                  placeholder="Pesquisar tarefa por título, responsável ou status..."
                />
                {taskSearch.trim().length >= 2 && (
                  <div className="traceability-results">
                    {availableTaskResults.length === 0 ? (
                      <p>Nenhuma tarefa encontrada.</p>
                    ) : (
                      availableTaskResults.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => handleSelectTask(task)}
                        >
                          {formatTaskLabel(task)}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </section>

            <div className="form-actions field-full">
              {editingRequirementId && (
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={resetForm}
                >
                  Cancelar edição
                </button>
              )}
              <button className="button button-primary" type="submit" disabled={submitting}>
                {submitting
                  ? 'Salvando...'
                  : editingRequirementId
                    ? 'Salvar alterações'
                    : 'Cadastrar requisito'}
              </button>
            </div>
          </form>
        </Card>

        <Card title="Requisitos cadastrados">
          {requirements.length === 0 ? (
            <p className="empty-state">Nenhum requisito cadastrado.</p>
          ) : (
            <div className="requirement-list requirements-grid">
              {requirements.map((requirement) => (
                <article className="requirement-item" key={requirement.id}>
                  <div className="requirement-item-header">
                    <div>
                      <span className="eyebrow">{typeLabels[requirement.type]}</span>
                      <h3>{requirement.title}</h3>
                    </div>
                    <span className={`status-badge status-${requirement.status.toLowerCase()}`}>
                      {statusLabels[requirement.status]}
                    </span>
                  </div>

                  <p>{requirement.description || 'Sem descrição cadastrada.'}</p>

                  <dl className="requirement-details">
                    <div>
                      <dt>Tipo</dt>
                      <dd>{typeLabels[requirement.type] || requirement.type}</dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>{statusLabels[requirement.status] || requirement.status}</dd>
                    </div>
                    <div>
                      <dt>Criado em</dt>
                      <dd>{formatDateTime(requirement.createdAt)}</dd>
                    </div>
                  </dl>

                  <div className="task-pr-card requirement-traceability-card">
                    <span>Rastreabilidade</span>
                    <div className="task-traceability-group">
                      <strong>Tarefas vinculadas</strong>
                      {requirement.tasks?.length ? (
                        <div className="task-traceability-list">
                          {requirement.tasks.map((task) => (
                            <div className="task-traceability-item" key={task.id}>
                              <span>{formatTaskLabel(task)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="task-pr-meta">Sem tarefas vinculadas.</p>
                      )}
                    </div>
                  </div>

                  <div className="requirement-actions">
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => startEditing(requirement)}
                    >
                      Editar
                    </button>
                    {requirement.status === 'VALIDADO' && (
                      <button
                        className="button button-primary"
                        type="button"
                        onClick={() => handleConfirmCompletion(requirement.id)}
                        disabled={confirmingRequirementId === requirement.id}
                      >
                        {confirmingRequirementId === requirement.id
                          ? 'Concluindo...'
                          : 'Confirmar conclusão'}
                      </button>
                    )}
                    <button
                      className="button button-danger"
                      type="button"
                      onClick={() => handleDeleteRequirement(requirement)}
                      disabled={deletingRequirementId === requirement.id}
                    >
                      {deletingRequirementId === requirement.id ? 'Excluindo...' : 'Excluir'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
