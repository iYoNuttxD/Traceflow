import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/index.js';
import { FeedbackRegion, FormInput, normalizeApiError } from '../shared/index.js';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function change(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit(event) {
    event.preventDefault();
    const validation = Object.fromEntries(
      Object.entries(values)
        .filter(([, value]) => !value.trim())
        .map(([field]) => [field, 'Campo obrigatório.'])
    );
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
      queueMicrotask(() =>
        document.getElementById(Object.keys(normalized.fieldErrors)[0])?.focus()
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page">
      <h1>Entrar</h1>
      <form onSubmit={submit} noValidate>
        <FormInput
          id="email"
          name="email"
          label="E-mail"
          type="email"
          value={values.email}
          onChange={(event) => change('email', event.target.value)}
          required
          error={fieldErrors.email}
        />
        <FormInput
          id="password"
          name="password"
          label="Senha"
          type="password"
          value={values.password}
          onChange={(event) => change('password', event.target.value)}
          required
          error={fieldErrors.password}
        />
        <FeedbackRegion error={error} />
        <button type="submit" disabled={submitting}>
          {submitting ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
      <Link to="/forgot-password">Esqueci minha senha</Link> <Link to="/register">Criar conta</Link>
    </main>
  );
}
