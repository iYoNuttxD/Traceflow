import { useState } from 'react';
import { Link } from 'react-router';
import { FeedbackRegion, FormInput, normalizeApiError } from '../../../shared/index.js';
import { authApi } from '../api/auth.api.js';
import { AuthShell } from '../components/AuthShell.jsx';
export function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      setMessage((await authApi.forgotPassword(email)).data.message);
    } catch (cause) {
      setError(normalizeApiError(cause).message);
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <AuthShell
      title="Recuperar senha"
      eyebrow="Acesso à conta"
      description="Se a conta existir, enviaremos instruções para o e-mail informado."
      footer={<Link to="/login">Voltar para entrar</Link>}
    >
      <form className="auth-form" onSubmit={submit}>
        <FormInput
          id="email"
          name="email"
          label="E-mail"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
        />
        <FeedbackRegion success={message} error={error} />
        <button className="button button-primary auth-submit" type="submit" disabled={submitting}>
          {submitting ? 'Enviando...' : 'Enviar instruções'}
        </button>
      </form>
    </AuthShell>
  );
}
