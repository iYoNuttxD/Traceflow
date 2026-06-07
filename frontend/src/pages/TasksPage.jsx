import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/api.js';
import { Card } from '../components/Card.jsx';
import {
  TaskForm,
  emptyTaskForm,
  taskFormToPayload,
  taskToFormData
} from '../components/TaskForm.jsx';

const statusLabels = {
  A_FAZER: 'A Fazer',
  EM_ANDAMENTO: 'Em Andamento',
  CONCLUIDO: 'Concluído'
};

const priorityLabels = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  CRITICA: 'Crítica'
};

function getErrorMessage(error, fallback) {
  return error.response?.data?.message || fallback;
}

function formatDate(value) {
  if (!value) {
    return 'Não informado';
  }

  return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function formatDateTime(value) {
  return new Date(value).toLocaleString('pt-BR');
}

export function TasksPage() {
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [formData, setFormData] = useState(emptyTaskForm);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [period, setPeriod] = useState({ startDate: '', endDate: '' });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadTaskData = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [projectResponse, tasksResponse, metricsResponse] = await Promise.all([
        api.get(`/projects/${projectId}`),
        api.get(`/projects/${projectId}/tasks`),
        api.get(`/projects/${projectId}/tasks/metrics`)
      ]);

      setProject(projectResponse.data.project);
      setTasks(tasksResponse.data.tasks);
      setMetrics(metricsResponse.data);
    } catch (requestError) {
      setError(
        getErrorMessage(requestError, 'Não foi possível carregar as tarefas do projeto.')
      );
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadTaskData();
  }, [loadTaskData]);

  function handleFormChange(name, value) {
    setFormData((current) => ({ ...current, [name]: value }));
  }

  function resetForm() {
    setEditingTaskId(null);
    setFormData(emptyTaskForm);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const payload = taskFormToPayload(formData, Boolean(editingTaskId));
      const response = editingTaskId
        ? await api.put(`/tasks/${editingTaskId}`, payload)
        : await api.post(`/projects/${projectId}/tasks`, payload);

      setSuccess(response.data.message);
      setPeriod({ startDate: '', endDate: '' });
      resetForm();
      await loadTaskData();
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível salvar a tarefa.'));
    } finally {
      setSubmitting(false);
    }
  }

  function startEditing(task) {
    setEditingTaskId(task.id);
    setFormData(taskToFormData(task));
    setError('');
    setSuccess('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleStatusChange(taskId, status) {
    setError('');
    setSuccess('');

    try {
      const response = await api.patch(`/tasks/${taskId}/status`, { status });
      setSuccess(response.data.message);
      setTasks((current) =>
        current.map((task) => (task.id === taskId ? response.data.task : task))
      );
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível alterar o status.'));
    }
  }

  async function handleMetricsSubmit(event) {
    event.preventDefault();
    setError('');

    try {
      const params = {};

      if (period.startDate) {
        params.startDate = period.startDate;
      }

      if (period.endDate) {
        params.endDate = period.endDate;
      }

      const response = await api.get(`/projects/${projectId}/tasks/metrics`, { params });
      setMetrics(response.data);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível consultar a métrica.'));
    }
  }

  async function clearMetricsPeriod() {
    setPeriod({ startDate: '', endDate: '' });
    setError('');

    try {
      const response = await api.get(`/projects/${projectId}/tasks/metrics`);
      setMetrics(response.data);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível consultar a métrica.'));
    }
  }

  if (loading) {
    return (
      <main className="page-container">
        <p className="empty-state">Carregando tarefas...</p>
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
          <h1>Tarefas do projeto</h1>
          <p>
            {project
              ? `Planejamento e acompanhamento das tarefas de ${project.name}.`
              : 'Cadastre e acompanhe as tarefas associadas ao projeto.'}
          </p>
        </div>
        <Link className="button button-secondary link-button" to={`/projects/${projectId}/kanban`}>
          Ver Kanban
        </Link>
      </header>

      {error && <div className="message message-error">{error}</div>}
      {success && <div className="message message-success">{success}</div>}

      <div className="task-summary">
        <Card title="Total de tarefas cadastradas">
          <strong className="metric-value">{tasks.length}</strong>
        </Card>

        <Card title="Volume de planejamento">
          <strong className="metric-value">{metrics?.totalTasksCreated ?? 0}</strong>
          <p className="metric-description">
            {metrics?.startDate || metrics?.endDate
              ? `Tarefas criadas entre ${metrics.startDate || 'o início'} e ${metrics.endDate || 'hoje'}.`
              : 'Quantidade total de tarefas cadastradas no projeto.'}
          </p>
          <form className="metrics-form" onSubmit={handleMetricsSubmit}>
            <label className="field">
              <span>Data inicial</span>
              <input
                type="date"
                value={period.startDate}
                onChange={(event) =>
                  setPeriod((current) => ({ ...current, startDate: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>Data final</span>
              <input
                type="date"
                value={period.endDate}
                onChange={(event) =>
                  setPeriod((current) => ({ ...current, endDate: event.target.value }))
                }
              />
            </label>
            <button className="button button-secondary" type="submit">
              Consultar período
            </button>
            {(metrics?.startDate || metrics?.endDate) && (
              <button
                className="button button-secondary metrics-clear"
                type="button"
                onClick={clearMetricsPeriod}
              >
                Limpar período
              </button>
            )}
          </form>
        </Card>
      </div>

      <div className="tasks-layout">
        <Card title={editingTaskId ? 'Editar tarefa' : 'Cadastrar tarefa'}>
          <TaskForm
            formData={formData}
            onChange={handleFormChange}
            onSubmit={handleSubmit}
            onCancel={resetForm}
            submitting={submitting}
            editing={Boolean(editingTaskId)}
          />
        </Card>

        <Card title="Tarefas cadastradas">
          {tasks.length === 0 ? (
            <p className="empty-state">Nenhuma tarefa cadastrada ainda.</p>
          ) : (
            <div className="task-list">
              {tasks.map((task) => (
                <article className="task-item" key={task.id}>
                  <div className="task-item-header">
                    <div>
                      <span className={`priority-badge priority-${task.priority.toLowerCase()}`}>
                        {priorityLabels[task.priority]}
                      </span>
                      <h3>{task.title}</h3>
                    </div>
                    <span className={`status-badge status-${task.status.toLowerCase()}`}>
                      {statusLabels[task.status]}
                    </span>
                  </div>

                  <p>{task.description || 'Sem descrição cadastrada.'}</p>

                  <dl className="task-details">
                    <div>
                      <dt>Responsável</dt>
                      <dd>{task.responsible || 'Não informado'}</dd>
                    </div>
                    <div>
                      <dt>Prazo</dt>
                      <dd>{formatDate(task.deadline)}</dd>
                    </div>
                    <div>
                      <dt>Esforço estimado</dt>
                      <dd>{task.estimatedEffort ?? 'Não informado'}</dd>
                    </div>
                    <div>
                      <dt>Esforço realizado</dt>
                      <dd>{task.actualEffort ?? 'Não informado'}</dd>
                    </div>
                    <div>
                      <dt>Criada em</dt>
                      <dd>{formatDateTime(task.createdAt)}</dd>
                    </div>
                  </dl>

                  <div className="task-actions">
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => startEditing(task)}
                    >
                      Editar
                    </button>
                    <label className="inline-status">
                      <span>Alterar status</span>
                      <select
                        value={task.status}
                        onChange={(event) => handleStatusChange(task.id, event.target.value)}
                      >
                        <option value="A_FAZER">A Fazer</option>
                        <option value="EM_ANDAMENTO">Em Andamento</option>
                        <option value="CONCLUIDO">Concluído</option>
                      </select>
                    </label>
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
