import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, requirementsApi } from '../api/api.js';
import { Card } from '../components/Card.jsx';

const emptyRequirementForm = {
  title: '',
  description: '',
  type: 'FUNCIONAL',
  status: 'PENDENTE'
};

const emptyLinkForm = {
  requirementId: '',
  taskId: ''
};

const typeLabels = {
  FUNCIONAL: 'Funcional',
  NAO_FUNCIONAL: 'Não funcional',
  REGRA_NEGOCIO: 'Regra de negócio'
};

const statusLabels = {
  PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado'
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
    status: requirement.status || 'PENDENTE'
  };
}

export function RequirementsPage() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [requirements, setRequirements] = useState([]);
  const [projectTasks, setProjectTasks] = useState([]);
  const [formData, setFormData] = useState(emptyRequirementForm);
  const [linkForm, setLinkForm] = useState(emptyLinkForm);
  const [editingRequirementId, setEditingRequirementId] = useState(null);
  const [selectedRequirement, setSelectedRequirement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [linkSubmitting, setLinkSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadRequirementsData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [projectResponse, requirementsResponse, tasksResponse] = await Promise.all([
        api.get(`/projects/${projectId}`),
        requirementsApi.getRequirementsWithTasks(projectId),
        api.get(`/projects/${projectId}/tasks`)
      ]);

      setProject(projectResponse.data.project);
      setRequirements(requirementsResponse.data.requirements || []);
      setProjectTasks(tasksResponse.data.tasks || []);
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
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const response = editingRequirementId
        ? await requirementsApi.update(editingRequirementId, formData)
        : await requirementsApi.create(projectId, formData);

      setSuccess(response.data.message);
      resetForm();
      await loadRequirementsData();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível salvar o requisito.'));
    } finally {
      setSubmitting(false);
    }
  }

  function startEditing(requirement) {
    setEditingRequirementId(requirement.id);
    setFormData(requirementToForm(requirement));
    setError('');
    setSuccess('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleStatusChange(requirementId, status) {
    setError('');
    setSuccess('');

    try {
      const response = await requirementsApi.updateStatus(requirementId, status);
      setSuccess(response.data.message);
      await loadRequirementsData();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível alterar o status.'));
    }
  }

  async function handleViewDetails(requirementId) {
    setError('');
    setSuccess('');

    try {
      const response = await requirementsApi.getById(requirementId);
      setSelectedRequirement(response.data.requirement);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível consultar o requisito.'));
    }
  }

  async function handleLinkTask(event) {
    event.preventDefault();
    setLinkSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const response = await requirementsApi.linkTask(linkForm.requirementId, linkForm.taskId);
      setSuccess(response.data.message);
      setLinkForm(emptyLinkForm);
      await loadRequirementsData();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível vincular a tarefa ao requisito.'));
    } finally {
      setLinkSubmitting(false);
    }
  }

  async function handleUnlinkTask(requirementId, taskId) {
    setError('');
    setSuccess('');

    try {
      const response = await requirementsApi.unlinkTask(requirementId, taskId);
      setSuccess(response.data.message);
      await loadRequirementsData();
    } catch (requestError) {
      setError(
        getErrorMessage(requestError, 'Não foi possível remover o vínculo entre requisito e tarefa.')
      );
    }
  }

  if (loading) {
    return (
      <main className="page-container">
        <p className="empty-state">Carregando requisitos...</p>
      </main>
    );
  }

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
              ? `Cadastre e acompanhe os requisitos funcionais de ${project.name}.`
              : 'Cadastre e acompanhe os requisitos funcionais associados ao projeto.'}
          </p>
        </div>
        <Link className="button button-secondary link-button" to={`/projects/${projectId}/tasks`}>
          Ver tarefas do projeto
        </Link>
      </header>

      {error && <div className="message message-error">{error}</div>}
      {success && <div className="message message-success">{success}</div>}

      <div className="requirements-layout">
        <Card title={editingRequirementId ? 'Editar requisito' : 'Cadastrar requisito'}>
          <form className="requirement-form" onSubmit={handleSubmit}>
            <label className="field field-full">
              <span>Título do requisito</span>
              <input
                type="text"
                value={formData.title}
                onChange={(event) => handleFormChange('title', event.target.value)}
                placeholder="RF15 - Cadastrar requisitos funcionais"
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
              <span>Tipo</span>
              <select
                value={formData.type}
                onChange={(event) => handleFormChange('type', event.target.value)}
              >
                <option value="FUNCIONAL">Funcional</option>
                <option value="NAO_FUNCIONAL">Não funcional</option>
                <option value="REGRA_NEGOCIO">Regra de negócio</option>
              </select>
            </label>

            <label className="field">
              <span>Status</span>
              <select
                value={formData.status}
                onChange={(event) => handleFormChange('status', event.target.value)}
              >
                <option value="PENDENTE">Pendente</option>
                <option value="EM_ANDAMENTO">Em andamento</option>
                <option value="CONCLUIDO">Concluído</option>
                <option value="CANCELADO">Cancelado</option>
              </select>
            </label>

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

        <div className="requirements-stack">
          <Card title="Relacionar requisito a tarefa">
            {requirements.length === 0 || projectTasks.length === 0 ? (
              <p className="empty-state">
                {requirements.length === 0
                  ? 'Cadastre ao menos um requisito para relacionar.'
                  : 'Cadastre ao menos uma tarefa para relacionar.'}
              </p>
            ) : (
              <form className="requirement-form" onSubmit={handleLinkTask}>
                <label className="field field-full">
                  <span>Requisito</span>
                  <select
                    value={linkForm.requirementId}
                    onChange={(event) =>
                      setLinkForm((current) => ({
                        ...current,
                        requirementId: event.target.value
                      }))
                    }
                    required
                  >
                    <option value="">Selecione um requisito</option>
                    {requirements.map((requirement) => (
                      <option key={requirement.id} value={requirement.id}>
                        {requirement.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field field-full">
                  <span>Tarefa</span>
                  <select
                    value={linkForm.taskId}
                    onChange={(event) =>
                      setLinkForm((current) => ({
                        ...current,
                        taskId: event.target.value
                      }))
                    }
                    required
                  >
                    <option value="">Selecione uma tarefa</option>
                    {projectTasks.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.title}
                        {task.requirementId ? ' (já vinculada)' : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="form-actions field-full">
                  <button
                    className="button button-primary"
                    type="submit"
                    disabled={linkSubmitting || !linkForm.requirementId || !linkForm.taskId}
                  >
                    {linkSubmitting ? 'Vinculando...' : 'Vincular tarefa'}
                  </button>
                </div>
              </form>
            )}
          </Card>

          <Card title="Requisitos cadastrados">
            {requirements.length === 0 ? (
              <p className="empty-state">Nenhum requisito cadastrado ainda.</p>
            ) : (
              <div className="requirement-list">
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
                        <dt>Data de criação</dt>
                        <dd>{formatDateTime(requirement.createdAt)}</dd>
                      </div>
                    </dl>

                    <section className="linked-tasks-inline">
                      <h4>Tarefas vinculadas</h4>
                      {requirement.tasks.length === 0 ? (
                        <p className="empty-state-small">
                          Nenhuma tarefa vinculada a este requisito.
                        </p>
                      ) : (
                        <div className="linked-task-list">
                          {requirement.tasks.map((task) => (
                            <div className="linked-task-item" key={task.id}>
                              <div className="linked-task-info">
                                <strong>{task.title}</strong>
                                <span className={`status-badge status-${task.status.toLowerCase()}`}>
                                  {task.status}
                                </span>
                                {task.responsible && (
                                  <span className="task-responsible">{task.responsible}</span>
                                )}
                              </div>
                              <button
                                className="button button-danger-small"
                                type="button"
                                onClick={() => handleUnlinkTask(requirement.id, task.id)}
                                title="Remover vínculo"
                              >
                                Remover vínculo
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>

                    <div className="requirement-actions">
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => startEditing(requirement)}
                      >
                        Editar
                      </button>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => handleViewDetails(requirement.id)}
                      >
                        Ver detalhes
                      </button>
                      <label className="inline-status">
                        <span>Alterar status</span>
                        <select
                          value={requirement.status}
                          onChange={(event) =>
                            handleStatusChange(requirement.id, event.target.value)
                          }
                        >
                          <option value="PENDENTE">Pendente</option>
                          <option value="EM_ANDAMENTO">Em andamento</option>
                          <option value="CONCLUIDO">Concluído</option>
                          <option value="CANCELADO">Cancelado</option>
                        </select>
                      </label>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Card>

          {selectedRequirement && (
            <Card title="Consulta do requisito">
              <article className="requirement-detail-panel">
                <h3>{selectedRequirement.title}</h3>
                <p>{selectedRequirement.description || 'Sem descrição cadastrada.'}</p>
                <dl className="requirement-details">
                  <div>
                    <dt>Projeto</dt>
                    <dd>{selectedRequirement.project?.name || `#${projectId}`}</dd>
                  </div>
                  <div>
                    <dt>Tipo</dt>
                    <dd>{typeLabels[selectedRequirement.type] || selectedRequirement.type}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>
                      {statusLabels[selectedRequirement.status] || selectedRequirement.status}
                    </dd>
                  </div>
                </dl>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setSelectedRequirement(null)}
                >
                  Fechar
                </button>
              </article>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}
