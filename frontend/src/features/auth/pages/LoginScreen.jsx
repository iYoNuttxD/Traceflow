import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { FeedbackRegion, FormInput, normalizeApiError } from '../../../shared/index.js';
import { useAuth } from '../AuthContext.jsx';
import { AuthShell } from '../components/AuthShell.jsx';
import { PasswordField } from '../components/PasswordField.jsx';
import { authApi } from '../api/auth.api.js';
import { sanitizeInternalReturnTo } from '../return-to.js';

const githubErrors = Object.freeze({
  email_conflict:
    'Já existe uma conta TraceFlow associada a este endereço. Entre com sua conta atual e vincule o GitHub em Configurações.',
  verified_email_required:
    'Sua conta GitHub precisa ter um e-mail principal verificado para criar uma conta TraceFlow.',
  invalid_state: 'A confirmação com GitHub não é mais válida. Inicie novamente.',
  expired_state: 'A confirmação com GitHub expirou. Inicie novamente.',
  unavailable: 'O login com GitHub está indisponível agora. Tente novamente mais tarde.',
  oauth_failed: 'Não foi possível conectar ao GitHub agora. Tente novamente mais tarde.'
});

export function LoginScreen() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState({ identifier: '', password: '', rememberMe: false });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [githubSubmitting, setGithubSubmitting] = useState(false);
  const returnTo = sanitizeInternalReturnTo(location.state?.from || '/projects');
  const githubReason = new URLSearchParams(location.search).get('reason');
  function change(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }
  async function submit(event) {
    event.preventDefault();
    const validation = {};
    if (!values.identifier.trim()) validation.identifier = 'Campo obrigatório.';
    if (!values.password) validation.password = 'Campo obrigatório.';
    if (Object.keys(validation).length) {
      setFieldErrors(validation);
      queueMicrotask(() => document.getElementById(Object.keys(validation)[0])?.focus());
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await login(values);
      navigate(returnTo, { replace: true });
    } catch (cause) {
      const normalized = normalizeApiError(cause);
      setError(normalized.message);
      setFieldErrors(normalized.fieldErrors);
      const firstInvalidField = Object.keys(normalized.fieldErrors)[0];
      if (firstInvalidField)
        queueMicrotask(() => document.getElementById(firstInvalidField)?.focus());
    } finally {
      setSubmitting(false);
    }
  }
  async function loginWithGithub() {
    if (githubSubmitting) return;
    setError('');
    setGithubSubmitting(true);
    try {
      const result = await authApi.startGithubLogin({
        rememberMe: values.rememberMe,
        returnTo
      });
      window.location.assign(result.url);
    } catch (cause) {
      setError(normalizeApiError(cause).message);
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
        <FeedbackRegion error={error || githubErrors[githubReason]} />
        <button className="button button-primary auth-submit" type="submit" disabled={submitting}>
          {submitting ? 'Entrando...' : 'Entrar'}
        </button>
        <div className="auth-divider">
          <span>ou</span>
        </div>
        <button
          className="button github-login-button"
          type="button"
          disabled={submitting || githubSubmitting}
          aria-busy={githubSubmitting}
          onClick={() => void loginWithGithub()}
        >
          {githubSubmitting ? 'Conectando ao GitHub...' : 'Entrar com GitHub'}
        </button>
      </form>
    </AuthShell>
  );
}
