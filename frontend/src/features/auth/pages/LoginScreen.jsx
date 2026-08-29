import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import {
  FeedbackRegion,
  FormInput,
  normalizeApiError,
  useCountdown
} from '../../../shared/index.js';
import { useAuth } from '../AuthContext.jsx';
import { AuthShell } from '../components/AuthShell.jsx';
import { PasswordField } from '../components/PasswordField.jsx';
import { authApi } from '../api/auth.api.js';
import { githubOAuthErrorMessage } from '../github-oauth-error.js';
import { sanitizeInternalReturnTo } from '../return-to.js';
import './LoginScreen.css';

export function LoginScreen() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState({ identifier: '', password: '', rememberMe: false });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [githubSubmitting, setGithubSubmitting] = useState(false);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const cooldown = useCountdown(retryAfterSeconds);
  const submitLock = useRef(false);
  const githubLock = useRef(false);
  const returnTo = sanitizeInternalReturnTo(location.state?.from || '/projects');
  const searchParams = new URLSearchParams(location.search);
  const githubError =
    searchParams.get('github') === 'error'
      ? githubOAuthErrorMessage(searchParams.get('reason'))
      : undefined;
  function change(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }
  async function submit(event) {
    event.preventDefault();
    if (submitLock.current) return;
    const validation = {};
    if (!values.identifier.trim()) validation.identifier = 'Campo obrigatório.';
    if (!values.password) validation.password = 'Campo obrigatório.';
    if (Object.keys(validation).length) {
      setFieldErrors(validation);
      queueMicrotask(() => document.getElementById(Object.keys(validation)[0])?.focus());
      return;
    }
    setError('');
    setRetryAfterSeconds(0);
    submitLock.current = true;
    setSubmitting(true);
    try {
      await login(values);
      navigate(returnTo, { replace: true });
    } catch (cause) {
      const normalized = normalizeApiError(cause);
      setError(normalized.message);
      setRetryAfterSeconds(normalized.retryAfterSeconds || 0);
      setFieldErrors(normalized.fieldErrors);
      const firstInvalidField = Object.keys(normalized.fieldErrors)[0];
      if (firstInvalidField)
        queueMicrotask(() => document.getElementById(firstInvalidField)?.focus());
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }
  async function loginWithGithub() {
    if (githubLock.current) return;
    setError('');
    setRetryAfterSeconds(0);
    githubLock.current = true;
    setGithubSubmitting(true);
    try {
      const result = await authApi.startGithubLogin({
        rememberMe: values.rememberMe,
        returnTo
      });
      window.location.assign(result.url);
    } catch (cause) {
      const normalized = normalizeApiError(cause);
      setError(normalized.message);
      setRetryAfterSeconds(normalized.retryAfterSeconds || 0);
      githubLock.current = false;
      setGithubSubmitting(false);
    }
  }
  return (
    <AuthShell
      title="Entrar"
      eyebrow="Acesso seguro"
      description="Acesse com seu nome de usuário ou e-mail."
      footer={
        <p>
          Não possui conta?{' '}
          <Link to="/register" state={{ from: returnTo }}>
            Criar conta
          </Link>
        </p>
      }
    >
      <form className="auth-form" onSubmit={submit} noValidate>
        <FormInput
          id="identifier"
          name="identifier"
          label="Nome de usuário ou e-mail"
          value={values.identifier}
          onChange={(event) => change('identifier', event.target.value)}
          autoComplete="username"
          required
          error={fieldErrors.identifier}
        />
        <PasswordField
          id="password"
          label="Senha"
          value={values.password}
          onChange={(event) => change('password', event.target.value)}
          autoComplete="current-password"
          error={fieldErrors.password}
        />
        <div className="auth-options">
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={values.rememberMe}
              onChange={(event) => change('rememberMe', event.target.checked)}
            />{' '}
            Manter sessão ativa
          </label>
          <Link to="/forgot-password">Esqueci minha senha</Link>
        </div>
        <FeedbackRegion
          error={cooldown ? undefined : error || githubError}
          rateLimit={cooldown ? error : undefined}
          retryAfterSeconds={retryAfterSeconds}
        />
        <button
          className="button button-primary auth-submit"
          type="submit"
          disabled={submitting || cooldown > 0}
          aria-busy={submitting}
        >
          {submitting ? 'Entrando...' : cooldown > 0 ? `Entrar em ${cooldown}s` : 'Entrar'}
        </button>
        <div className="auth-divider">
          <span>ou</span>
        </div>
        <button
          className="button github-login-button"
          type="button"
          disabled={submitting || githubSubmitting || cooldown > 0}
          aria-busy={githubSubmitting}
          onClick={() => void loginWithGithub()}
        >
          {githubSubmitting ? 'Conectando ao GitHub...' : 'Entrar com GitHub'}
        </button>
      </form>
    </AuthShell>
  );
}
