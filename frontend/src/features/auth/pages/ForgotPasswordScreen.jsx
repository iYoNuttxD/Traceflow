import { useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  FeedbackRegion,
  FormInput,
  normalizeApiError,
  useCountdown
} from '../../../shared/index.js';
import { authApi } from '../api/auth.api.js';
import { AuthShell } from '../components/AuthShell.jsx';
export function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const cooldown = useCountdown(retryAfterSeconds);
  const submitLock = useRef(false);
  async function submit(event) {
    event.preventDefault();
    if (submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    setError('');
    setMessage('');
    setRetryAfterSeconds(0);
    try {
      setMessage((await authApi.forgotPassword(email)).data.message);
    } catch (cause) {
      const normalized = normalizeApiError(cause);
      setError(normalized.message);
      setRetryAfterSeconds(normalized.retryAfterSeconds || 0);
    } finally {
      submitLock.current = false;
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
        <FeedbackRegion
          success={message}
          error={cooldown ? undefined : error}
          rateLimit={cooldown ? error : undefined}
          retryAfterSeconds={retryAfterSeconds}
        />
        <button
          className="button button-primary auth-submit"
          type="submit"
          disabled={submitting || cooldown > 0}
          aria-busy={submitting}
        >
          {submitting
            ? 'Enviando...'
            : cooldown > 0
              ? `Enviar em ${cooldown}s`
              : 'Enviar instruções'}
        </button>
      </form>
    </AuthShell>
  );
}
