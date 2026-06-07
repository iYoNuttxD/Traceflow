import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { projectMembersApi } from '../api/api.js';
import { Card } from '../components/Card.jsx';

function getErrorMessage(error, fallback) {
  return error.response?.data?.message || fallback;
}

export function JoinProjectPage() {
  const { accessCode } = useParams();
  const [formData, setFormData] = useState({
    accessCode: accessCode || '',
    name: '',
    email: ''
  });
  const [joinedProject, setJoinedProject] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function handleChange(name, value) {
    setFormData((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const response = await projectMembersApi.joinProject(formData);
      setJoinedProject(response.data.project);
      setSuccess(response.data.message);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Não foi possível entrar no projeto.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page-container join-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">TRACEFLOW</span>
          <h1>Entrar no projeto</h1>
          <p>Use o código de acesso para se tornar membro interno do projeto.</p>
        </div>
      </header>

      {error && <div className="message message-error">{error}</div>}
      {success && <div className="message message-success">{success}</div>}

      <Card title="Dados de entrada">
        <form className="member-form join-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Código de acesso</span>
            <input
              type="text"
              value={formData.accessCode}
              onChange={(event) => handleChange('accessCode', event.target.value)}
              placeholder="TRC-ABC123"
            />
          </label>
          <label className="field">
            <span>Nome</span>
            <input
              type="text"
              value={formData.name}
              onChange={(event) => handleChange('name', event.target.value)}
              placeholder="Seu nome"
            />
          </label>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={formData.email}
              onChange={(event) => handleChange('email', event.target.value)}
              placeholder="email@exemplo.com"
            />
          </label>
          <button className="button button-primary" type="submit" disabled={submitting}>
            {submitting ? 'Entrando...' : 'Entrar no projeto'}
          </button>
        </form>
      </Card>

      {joinedProject && (
        <Link className="button button-secondary link-button join-project-link" to={`/projects/${joinedProject.id}`}>
          Abrir projeto
        </Link>
      )}
    </main>
  );
}
