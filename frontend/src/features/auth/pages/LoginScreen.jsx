import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { FeedbackRegion, FormInput, normalizeApiError } from '../../../shared/index.js';
import { useAuth } from '../AuthContext.jsx';
import { AuthShell } from '../components/AuthShell.jsx';
import { PasswordField } from '../components/PasswordField.jsx';

export function LoginScreen() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState({ identifier: '', password: '', rememberMe: false });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
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
      navigate(location.state?.from || '/projects', { replace: true });
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
  return (
    <AuthShell
      title="Entrar"
      eyebrow="Acesso seguro"
      description="Acesse com seu nome de usuário ou e-mail."
      footer={
        <p>
          Não possui conta? <Link to="/register">Criar conta</Link>
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
        <FeedbackRegion error={error} />
        <button className="button button-primary auth-submit" type="submit" disabled={submitting}>
          {submitting ? 'Entrando...' : 'Entrar'}
        </button>
        <div className="auth-divider">
          <span>ou</span>
        </div>
        <button className="button github-login-placeholder" type="button" disabled>
          Entrar com GitHub — Em breve
        </button>
      </form>
    </AuthShell>
  );
}
