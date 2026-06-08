import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, syncProjectGithub } from '../api/api.js';
import { Card } from '../components/Card.jsx';
import {
  ProjectForm,
  emptyProjectForm,
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

function formatDateTime(value) {
  if (!value) {
    return 'Ainda não realizada.';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

function formatSyncSummary(summary) {
  if (!summary) {
    return '';
  }

  const parts = [];

  if (summary.commits) {
    parts.push(
      `Commits: ${summary.commits.found ?? 0} encontrados, ${summary.commits.created ?? 0} novos.`
    );
  }

  if (summary.pullRequests) {
    parts.push(
      `Pull requests: ${summary.pullRequests.found ?? 0} encontrados, ${summary.pullRequests.created ?? 0} novos, ${summary.pullRequests.updated ?? 0} atualizados.`
    );
  }

  if (summary.issues) {
    parts.push(
      `Issues: ${summary.issues.found ?? 0} encontradas, ${summary.issues.created ?? 0} novas, ${summary.issues.updated ?? 0} atualizadas.`
    );
  }

  return parts.join(' ');
}

function formatProjectStatus(status) {
  const labels = {
    ATIVO: 'Ativo',
    INATIVO: 'Inativo',
    ARQUIVADO: 'Arquivado'
  };

  return labels[status] || status || 'Não informado';
}

function getRepositoryName(project) {
  if (project.githubRepositoryFullName) {
    return project.githubRepositoryFullName;
  }

  if (project.githubOwner && (project.githubRepositoryName || project.githubRepo)) {
    return `${project.githubOwner}/${project.githubRepositoryName || project.githubRepo}`;
  }

  return project.githubRepo || project.githubRepositoryName || '';
}

function getRepositoryUrl(project) {
  return project.githubRepositoryUrl || project.githubUrl || '';
}

function buildInviteUrl(project) {
  if (!project.accessCode) {
    return '';
  }

  return `${window.location.origin}/join/${project.accessCode}`;
}

export function ProjectDetailsPage() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [members, setMembers] = useState([]);
  const [memberForm, setMemberForm] = useState({ name: '', email: '', role: 'MEMBRO' });
  const [formData, setFormData] = useState(emptyProjectForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submittingMember, setSubmittingMember] = useState(false);
  const [syncingGithub, setSyncingGithub] = useState(false);
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

  function handleChange(name, value) {
    setFormData((current) => updateProjectForm(current, name, value));
  }

  function handleMemberChange(name, value) {
    setMemberForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const response = await api.put(`/projects/${id}`, {
        name: formData.name,
        description: formData.description,
        responsibleTeam: formData.responsibleTeam,
        status: formData.status
      });
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

  async function handleGithubSync() {
    setSyncingGithub(true);
    setError('');
    setSuccess('');

    try {
      const response = await syncProjectGithub(id);
      const syncSummary = formatSyncSummary(response.summary);

      setProject((current) =>
        current
          ? {
              ...current,
              githubLastSyncAt: new Date().toISOString()
            }
          : current
      );
      setSuccess(
        syncSummary
          ? `Sincronização GitHub concluída com sucesso. ${syncSummary}`
          : response.message || 'Sincronização GitHub concluída com sucesso.'
      );
    } catch (requestError) {
      setError(
        getErrorMessage(requestError, 'Não foi possível sincronizar o repositório GitHub.')
      );
    } finally {
      setSyncingGithub(false);
    }
  }

  async function handleCopyInviteLink() {
    const inviteUrl = buildInviteUrl(project);

    if (!inviteUrl) {
      setError('Código de acesso não disponível para copiar convite.');
      setSuccess('');
      return;
    }

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setError('');
      setSuccess('Link de convite copiado.');
    } catch {
      setSuccess('');
      setError('Não foi possível copiar o link de convite.');
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

  const repositoryName = getRepositoryName(project);
  const repositoryUrl = getRepositoryUrl(project);
  const githubSyncStatus = project.githubLastSyncAt ? 'Sincronizado' : 'Não sincronizado';

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
            Tarefas
          </Link>
          <Link
            className="button button-secondary link-button"
            to={`/projects/${project.id}/requirements`}
          >
            Requisitos
          </Link>
          <Link className="button button-secondary link-button" to={`/projects/${project.id}/kanban`}>
            Kanban
          </Link>
          <Link
            className="button button-secondary link-button"
            to={`/projects/${project.id}/repository`}
          >
            Repositório
          </Link>
          <button
            className="button button-primary"
            type="button"
            onClick={handleGithubSync}
            disabled={syncingGithub}
          >
            {syncingGithub ? 'Sincronizando...' : 'Sincronizar'}
          </button>
        </div>
      </header>

      {error && <div className="message message-error">{error}</div>}
      {membersError && <div className="message message-error">{membersError}</div>}
      {success && <div className="message message-success">{success}</div>}

      <section className="project-overview">
        <Card title="Visão geral do projeto">
          <dl className="overview-grid">
            <div>
              <dt>Status do projeto</dt>
              <dd>
                <span className={`status-badge status-${project.status.toLowerCase()}`}>
                  {formatProjectStatus(project.status)}
                </span>
              </dd>
            </div>
            <div>
              <dt>Status GitHub</dt>
              <dd>
                <span
                  className={`status-badge ${
                    project.githubLastSyncAt ? 'status-ativo' : 'status-pendente'
                  }`}
                >
                  {githubSyncStatus}
                </span>
              </dd>
            </div>
            <div>
              <dt>Repositório GitHub</dt>
              <dd>
                {repositoryName ? (
                  repositoryUrl ? (
                    <a href={repositoryUrl} target="_blank" rel="noreferrer">
                      {repositoryName}
                    </a>
                  ) : (
                    repositoryName
                  )
                ) : (
                  'Não informado'
                )}
              </dd>
            </div>
            <div>
              <dt>Última sincronização</dt>
              <dd>{formatDateTime(project.githubLastSyncAt)}</dd>
            </div>
            <div>
              <dt>Membros</dt>
              <dd>{members.length}</dd>
            </div>
            <div>
              <dt>Código de acesso</dt>
              <dd className="overview-value-with-action">
                <span>{project.accessCode || 'Não informado'}</span>
                {project.accessCode && (
                  <button
                    className="copy-invite-button"
                    type="button"
                    onClick={handleCopyInviteLink}
                  >
                    Copiar convite
                  </button>
                )}
              </dd>
            </div>
            <div>
              <dt>Área ou equipe responsável</dt>
              <dd>{project.responsibleTeam || 'Não informada'}</dd>
            </div>
            <div>
              <dt>Criado em</dt>
              <dd>{formatDateTime(project.createdAt)}</dd>
            </div>
            <div>
              <dt>Atualizado em</dt>
              <dd>{formatDateTime(project.updatedAt)}</dd>
            </div>
          </dl>
        </Card>
      </section>

      <div className="project-details-stack">
        <Card title="Editar dados do projeto">
          <ProjectForm
            formData={formData}
            onChange={handleChange}
            onSubmit={handleSubmit}
            submitLabel="Salvar alterações"
            submitting={submitting}
            showRepositoryField={false}
          />
        </Card>

        <Card title="Membros do projeto">
          {members.length === 0 ? (
            <p className="empty-state">Nenhum membro interno cadastrado neste projeto.</p>
          ) : (
            <div className="member-list member-list-wide">
              {members.map((member) => (
                <article className="member-item" key={member.id}>
                  <strong>{member.name}</strong>
                  <span>{member.email || 'Sem email'}</span>
                  <span>{member.role}</span>
                </article>
              ))}
            </div>
          )}

          <form className="member-form member-form-wide" onSubmit={handleMemberSubmit}>
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
      </div>
    </main>
  );
}
