import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/api.js';
import { KanbanColumn } from '../components/KanbanColumn.jsx';

const columns = [
  { status: 'A_FAZER', title: 'A Fazer' },
  { status: 'EM_ANDAMENTO', title: 'Em Andamento' },
  { status: 'CONCLUIDO', title: 'Concluído' }
];

function getErrorMessage(error, fallback) {
  return error.response?.data?.message || fallback;
}

export function KanbanPage() {
  const { projectId } = useParams();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await api.get(`/projects/${projectId}/tasks`);
      setTasks(response.data.tasks);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível carregar o Kanban.'));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  async function handleStatusChange(taskId, status) {
    setError('');
    setSuccess('');

    try {
      const response = await api.patch(`/tasks/${taskId}/status`, { status });
      setTasks((current) =>
        current.map((task) => (task.id === taskId ? response.data.task : task))
      );
      setSuccess(response.data.message);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível alterar o status.'));
    }
  }

  return (
    <main className="page-container">
      <Link className="back-link" to={`/projects/${projectId}/tasks`}>
        ← Voltar para tarefas
      </Link>

      <header className="page-header">
        <div>
          <span className="eyebrow">Projeto #{projectId}</span>
          <h1>Kanban de tarefas</h1>
          <p>Visão simples das tarefas agrupadas por status.</p>
        </div>
      </header>

      {error && <div className="message message-error">{error}</div>}
      {success && <div className="message message-success">{success}</div>}

      {loading ? (
        <p className="empty-state">Carregando Kanban...</p>
      ) : (
      <div className="kanban-board">
          {columns.map((column) => {
            const columnTasks = tasks.filter((task) => task.status === column.status);

            return (
              <KanbanColumn key={column.status} title={`${column.title} (${columnTasks.length})`}>
                {columnTasks.length === 0 ? (
                  <p className="kanban-empty">Nenhuma tarefa nesta etapa.</p>
                ) : (
                  <div className="kanban-task-list">
                    {columnTasks.map((task) => (
                      <article className="kanban-task" key={task.id}>
                        <strong>{task.title}</strong>
                        <span>{task.responsible || 'Sem responsável'}</span>
                        <select
                          aria-label={`Alterar status de ${task.title}`}
                          value={task.status}
                          onChange={(event) => handleStatusChange(task.id, event.target.value)}
                        >
                          <option value="A_FAZER">A Fazer</option>
                          <option value="EM_ANDAMENTO">Em Andamento</option>
                          <option value="CONCLUIDO">Concluído</option>
                        </select>
                      </article>
                    ))}
                  </div>
                )}
              </KanbanColumn>
            );
          })}
      </div>
      )}
    </main>
  );
}
