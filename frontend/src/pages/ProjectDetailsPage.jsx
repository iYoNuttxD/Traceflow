import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/api.js';
import { Card } from '../components/Card.jsx';
import { ProjectForm, emptyProjectForm } from '../components/ProjectForm.jsx';

function toFormData(project) {
  return {
    name: project.name || '',
    description: project.description || '',
    githubOwner: project.githubOwner || '',
    githubRepo: project.githubRepo || '',
    githubUrl: project.githubUrl || '',
    status: project.status || 'ATIVO'
  };
}

function getErrorMessage(error, fallback) {
  return error.response?.data?.message || fallback;
}

export function ProjectDetailsPage() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [formData, setFormData] = useState(emptyProjectForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    async function loadProject() {
      setLoading(true);
      setError('');

      try {
        const response = await api.get(`/projects/${id}`);
        setProject(response.data.project);
        setFormData(toFormData(response.data.project));
      } catch (requestError) {
        setError(getErrorMessage(requestError, 'Não foi possível carregar o projeto.'));
      } finally {
        setLoading(false);
      }
    }

    loadProject();
  }, [id]);

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const response = await api.put(`/projects/${id}`, formData);
      setProject(response.data.project);
      setFormData(toFormData(response.data.project));
      setSuccess(response.data.message);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível atualizar o projeto.'));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="page-container">
        <p className="empty-state">Carregando projeto...</p>
      </main>
    );
  }

  if (!project) {
    return (
      <main className="page-container">
        <div className="message message-error">{error || 'Projeto não encontrado.'}</div>
        <Link className="text-link" to="/projects">
          Voltar para projetos
        </Link>
      </main>
    );
  }

  return (
    <main className="page-container">
      <Link className="back-link" to="/projects">
        ← Voltar para projetos
      </Link>

      <header className="page-header project-details-header">
        <div>
          <span className="eyebrow">Projeto #{project.id}</span>
          <h1>{project.name}</h1>
          <p>{project.description || 'Sem descrição cadastrada.'}</p>
        </div>
        <span className={`status-badge status-${project.status.toLowerCase()}`}>
          {project.status}
        </span>
      </header>

      {error && <div className="message message-error">{error}</div>}
      {success && <div className="message message-success">{success}</div>}

      <div className="details-layout">
        <Card title="Editar dados do projeto">
          <ProjectForm
            formData={formData}
            onChange={handleChange}
            onSubmit={handleSubmit}
            submitLabel="Salvar alterações"
            submitting={submitting}
          />
        </Card>

        <aside className="details-sidebar">
          <Card title="Repositório GitHub">
            <dl className="details-list">
              <div>
                <dt>Owner</dt>
                <dd>{project.githubOwner || 'Não informado'}</dd>
              </div>
              <div>
                <dt>Repositório</dt>
                <dd>{project.githubRepo || 'Não informado'}</dd>
              </div>
              <div>
                <dt>URL</dt>
                <dd>
                  {project.githubUrl ? (
                    <a href={project.githubUrl} target="_blank" rel="noreferrer">
                      Abrir no GitHub
                    </a>
                  ) : (
                    'Não informada'
                  )}
                </dd>
              </div>
            </dl>
          </Card>

          <Card title="Registro">
            <dl className="details-list">
              <div>
                <dt>Criado em</dt>
                <dd>{new Date(project.createdAt).toLocaleString('pt-BR')}</dd>
              </div>
              <div>
                <dt>Atualizado em</dt>
                <dd>{new Date(project.updatedAt).toLocaleString('pt-BR')}</dd>
              </div>
            </dl>
          </Card>
        </aside>
      </div>
    </main>
  );
}
