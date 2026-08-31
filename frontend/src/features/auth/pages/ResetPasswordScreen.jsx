import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  FeedbackRegion,
  PublicPageShell,
  StatusSurface,
  normalizeApiError,
  useCountdown
} from '../../../shared/index.js';
import { authApi } from '../api/auth.api.js';
import { AuthShell } from '../components/AuthShell.jsx';
import { PasswordField } from '../components/PasswordField.jsx';
export function ResetPasswordScreen() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const cooldown = useCountdown(retryAfterSeconds);
  const submitLock = useRef(false);
  const token = params.get('token');
  async function submit(event) {
    event.preventDefault();
    if (submitLock.current) return;
    if (password !== confirmation) {
      setError('');
      setFieldErrors({ passwordConfirmation: 'As senhas não coincidem.' });
      queueMicrotask(() => document.getElementById('passwordConfirmation')?.focus());
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    setError('');
    setFieldErrors({});
    setRetryAfterSeconds(0);
    try {
      await authApi.resetPassword(token, password);
      navigate('/login', { replace: true });
    } catch (cause) {
      const normalized = normalizeApiError(cause);
      setError(normalized.message);
      setFieldErrors(normalized.fieldErrors);
      setRetryAfterSeconds(normalized.retryAfterSeconds || 0);
      const firstInvalidField = Object.keys(normalized.fieldErrors)[0];
      if (firstInvalidField)
        queueMicrotask(() => document.getElementById(firstInvalidField)?.focus());
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <PublicPageShell>
        <StatusSurface
          title="Link de redefinição inválido"
          description="Link de redefinição inválido ou incompleto."
          icon="key"
          tone="danger"
          role="alert"
          actions={
            <Link className="button button-primary link-button" to="/login">
              Voltar para entrar
            </Link>
          }
        />
      </PublicPageShell>
    );
  }

  return (
    <AuthShell
      title="Redefinir senha"
      description="Defina uma nova senha. Todas as sessões anteriores serão revogadas."
      backTo="/login"
    >
      <form className="auth-form" onSubmit={submit}>
        <PasswordField
          id="password"
          label="Nova senha"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setFieldErrors((current) => ({ ...current, password: undefined }));
          }}
          error={fieldErrors.password}
          showRequirements
        />
        <PasswordField
          id="passwordConfirmation"
          label="Confirmar nova senha"
          value={confirmation}
          onChange={(event) => {
            setConfirmation(event.target.value);
            setFieldErrors((current) => ({ ...current, passwordConfirmation: undefined }));
          }}
          error={fieldErrors.passwordConfirmation}
        />
        <FeedbackRegion
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
            ? 'Redefinindo...'
            : cooldown > 0
              ? `Redefinir em ${cooldown}s`
              : 'Redefinir senha'}
        </button>
      </form>
    </AuthShell>
  );
}
