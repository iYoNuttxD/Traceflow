import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { FeedbackRegion, normalizeApiError } from '../../../shared/index.js';
import { authApi } from '../api/auth.api.js';
import { AuthShell } from '../components/AuthShell.jsx';
import { PasswordField } from '../components/PasswordField.jsx';
export function ResetPasswordScreen() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (!params.get('token')) return setError('Link de redefinição inválido ou incompleto.');
    if (password !== confirmation) return setError('As senhas não coincidem.');
    setSubmitting(true);
    setError('');
    try {
      await authApi.resetPassword(params.get('token'), password);
      navigate('/login', { replace: true });
    } catch (cause) {
      setError(normalizeApiError(cause).message);
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <AuthShell
      title="Redefinir senha"
      eyebrow="Segurança da conta"
      description="Defina uma nova senha. Todas as sessões anteriores serão revogadas."
      footer={<Link to="/login">Voltar para entrar</Link>}
    >
      <form className="auth-form" onSubmit={submit}>
        <PasswordField
          id="password"
          label="Nova senha"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          showRequirements
        />
        <PasswordField
          id="passwordConfirmation"
          label="Confirmar nova senha"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
        />
        <FeedbackRegion error={error} />
        <button className="button button-primary auth-submit" type="submit" disabled={submitting}>
          {submitting ? 'Redefinindo...' : 'Redefinir senha'}
        </button>
      </form>
    </AuthShell>
  );
}
