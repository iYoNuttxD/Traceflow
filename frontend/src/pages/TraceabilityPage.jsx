import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, requirementsApi } from '../api/api.js';
import { Card } from '../components/Card.jsx';

function getErrorMessage(error, fallback) {
  return error.response?.data?.message || fallback;
}

export function TraceabilityPage() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError('');

      try {
        const [projectResponse, requirementsResponse] = await Promise.all([
          api.get(`/projects/${id}`),
          requirementsApi.getRequirementsWithTasks(id)
        ]);

        setProject(projectResponse.data.project);
        setRequirements(requirementsResponse.data.requirements || []);
      } catch (requestError) {
        setError(getErrorMessage(requestError, 'Não foi possível carregar a rastreabilidade.'));
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [id]);

  if (loading) {
    return (
      <main className="page-container">
        <p className="empty-state">Carregando rastreabilidade...</p>
      </main>
    );
  }

  return (
    <main className="page-container">
      <Link className="back-link" to={`/projects/${id}`}>
        ← Voltar para o projeto
      </Link>

      <header className="page-header">
        <div>
          <span className="eyebrow">Projeto #{id}</span>
          <h1>Rastreabilidade</h1>
          <p>
            {project
              ? `Cadeia de rastreabilidade de ${project.name}: Requisito → Tarefa.`
              : 'Cadeia entre requisitos e tarefas do projeto.'}
          </p>
        </div>
        <Link
          className="button button-secondary link-button"
          to={`/projects/${id}/requirements`}
        >
          Gerenciar vínculos
        </Link>
      </header>

      {error && <div className="message message-error">{error}</div>}

      <Card title="Requisito → Tarefa">
        {requirements.length === 0 ? (
          <p className="empty-state">Nenhum requisito cadastrado neste projeto.</p>
        ) : (
          <div className="traceability-list">
            {requirements.map((requirement) => (
              <article className="traceability-item" key={requirement.id}>
                <div className="traceability-requirement">
                  <span className="traceability-label">Requisito</span>
                  <strong>{requirement.title}</strong>
                  <span
                    className={`status-badge status-${requirement.status.toLowerCase()}`}
                  >
                    {requirement.status}
                  </span>
                </div>

                {requirement.tasks.length === 0 ? (
                  <p className="traceability-empty">
                    Nenhuma tarefa vinculada a este requisito.
                  </p>
                ) : (
                  <div className="traceability-tasks">
                    {requirement.tasks.map((task) => (
                      <div className="traceability-task" key={task.id}>
                        <span className="traceability-arrow">→</span>
                        <span className="traceability-task-title">{task.title}</span>
                        <span
                          className={`status-badge status-${task.status.toLowerCase()}`}
                        >
                          {task.status}
                        </span>
                        {task.responsible && (
                          <span className="task-responsible">{task.responsible}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </Card>
    </main>
  );
}
