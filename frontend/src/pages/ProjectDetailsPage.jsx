import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/api.js';
import { Card } from '../components/Card.jsx';
import {
  ProjectForm,
  applyRepositoryToProjectForm,
  emptyProjectForm,
  normalizeRepository,
  updateProjectForm
} from '../components/ProjectForm.jsx';

function toFormData(project) {
  return {
    name: project.name || '',
    description: project.description || '',
    responsibleTeam: project.responsibleTeam || '',
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
  const [members, setMembers] = useState([]);
  const [memberForm, setMemberForm] = useState({ name: '', email: '', role: 'MEMBRO' });
  const [repositories, setRepositories] = useState([]);
  const [formData, setFormData] = useState(emptyProjectForm);
  const [loading, setLoading] = useState(true);
  const [loadingRepositories, setLoadingRepositories] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submittingMember, setSubmittingMember] = useState(false);
  const [repositoriesError, setRepositoriesError] = useState('');
  const [membersError, setMembersError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    async function loadProject() {
      setLoading(true);
      setError('');
      setMembersError('');

      try {
        const [projectResponse, membersResponse] = await Promise.all([
          api.get(`/projects/${id}`),
          api.get(`/projects/${id}/members`).catch((requestError) => {
            setMembersError(
              getErrorMessage(requestError, 'Não foi possível carregar os membros do projeto.')
            );
            return { data: { members: [] } };
          })
        ]);

        setProject(projectResponse.data.project);
        setFormData(toFormData(projectResponse.data.project));
        setMembers(membersResponse.data.members || []);
      } catch (requestError) {
        setError(getErrorMessage(requestError, 'Não foi possível carregar o projeto.'));
      } finally {
        setLoading(false);
      }
    }

    loadProject();
  }, [id]);

  useEffect(() => {
    async function loadRepositories() {
      setLoadingRepositories(true);
      setRepositoriesError('');

      try {
        const response = await api.get('/github/repositories');
        const validRepositories = (response.data.repositories || [])
          .map(normalizeRepository)
          .filter(
            (repository) =>
              repository.owner &&
              repository.name &&
              repository.fullName &&
              repository.url
          );
        setRepositories(validRepositories);
      } catch {
        setRepositories([]);
        setRepositoriesError('Não foi possível carregar os repositórios do GitHub.');
      } finally {
        setLoadingRepositories(false);
      }
    }

    loadRepositories();
  }, []);

  function handleChange(name, value) {
    setFormData((current) => updateProjectForm(current, name, value));
  }

  function handleMemberChange(name, value) {
    setMemberForm((current) => ({ ...current, [name]: value }));
  }

  function handleRepositoryChange(fullName) {
    const selectedRepository = repositories.find(
      (repository) => normalizeRepository(repository).fullName === fullName
    );

    if (selectedRepository) {
      setFormData((current) => applyRepositoryToProjectForm(current, selectedRepository));
    }
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

  async function handleMemberSubmit(event) {
    event.preventDefault();
    setSubmittingMember(true);
    setMembersError('');
    setSuccess('');

    try {
      const response = await api.post(`/projects/${id}/members`, memberForm);
      setMembers((current) =>
        [...current, response.data.member].sort((a, b) => a.name.localeCompare(b.name))
      );
      setMemberForm({ name: '', email: '', role: 'MEMBRO' });
      setSuccess(response.data.message);
    } catch (requestError) {
      setMembersError(
        getErrorMessage(requestError, 'Não foi possível adicionar o membro ao projeto.')
      );
    } finally {
      setSubmittingMember(false);
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
        Voltar para projetos
      </Link>

      <header className="page-header project-details-header">
        <div>
          <span className="eyebrow">Projeto #{project.id}</span>
          <h1>{project.name}</h1>
          <p>{project.description || 'Sem descrição cadastrada.'}</p>
        </div>
        <div className="project-header-actions">
          <Link className="button button-secondary link-button" to={`/projects/${project.id}/tasks`}>
            Ver tarefas do projeto
          </Link>
          <Link className="button button-secondary link-button" to={`/projects/${project.id}/kanban`}>
            Ver Kanban
          </Link>
          <Link
            className="button button-secondary link-button"
            to={`/projects/${project.id}/repository`}
          >
            Informações do Repositório
          </Link>
          <span className={`status-badge status-${project.status.toLowerCase()}`}>
            {project.status}
          </span>
        </div>
      </header>

      {error && <div className="message message-error">{error}</div>}
      {membersError && <div className="message message-error">{membersError}</div>}
      {success && <div className="message message-success">{success}</div>}

      <div className="details-layout">
        <Card title="Editar dados do projeto">
          <ProjectForm
            formData={formData}
            repositories={repositories}
            loadingRepositories={loadingRepositories}
            repositoriesError={repositoriesError}
            onChange={handleChange}
            onRepositoryChange={handleRepositoryChange}
            onSubmit={handleSubmit}
            submitLabel="Salvar alterações"
            submitting={submitting}
          />
        </Card>

        <aside className="details-sidebar">
          <Card title="Acesso ao projeto">
            <dl className="details-list">
              <div>
                <dt>Código de acesso</dt>
                <dd>{project.accessCode || 'Não informado'}</dd>
              </div>
              <div>
                <dt>Link de convite rápido</dt>
                <dd>{project.inviteLink || 'Não informado'}</dd>
              </div>
            </dl>
          </Card>

          <Card title="Membros do projeto">
            {members.length === 0 ? (
              <p className="empty-state">Nenhum membro interno cadastrado neste projeto.</p>
            ) : (
              <div className="member-list">
                {members.map((member) => (
                  <article className="member-item" key={member.id}>
                    <strong>{member.name}</strong>
                    <span>{member.email || 'Sem email'}</span>
                    <span>{member.role}</span>
                  </article>
                ))}
              </div>
            )}

            <form className="member-form" onSubmit={handleMemberSubmit}>
              <label className="field">
                <span>Nome</span>
                <input
                  type="text"
                  value={memberForm.name}
                  onChange={(event) => handleMemberChange('name', event.target.value)}
                  placeholder="Nome do membro"
                />
              </label>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  value={memberForm.email}
                  onChange={(event) => handleMemberChange('email', event.target.value)}
                  placeholder="email@exemplo.com"
                />
              </label>
              <label className="field">
                <span>Papel</span>
                <input
                  type="text"
                  value={memberForm.role}
                  onChange={(event) => handleMemberChange('role', event.target.value)}
                  placeholder="DESENVOLVEDOR"
                />
              </label>
              <button className="button button-secondary" type="submit" disabled={submittingMember}>
                {submittingMember ? 'Adicionando...' : 'Adicionar membro'}
              </button>
            </form>
          </Card>

          <Card title="Responsabilidade">
            <dl className="details-list">
              <div>
                <dt>Equipe responsável</dt>
                <dd>{project.responsibleTeam}</dd>
              </div>
            </dl>
          </Card>

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
