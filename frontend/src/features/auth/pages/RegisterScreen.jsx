import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { FeedbackRegion, FormInput, normalizeApiError } from '../../../shared/index.js';
import { useAuth } from '../AuthContext.jsx';
import { AuthShell } from '../components/AuthShell.jsx';
import { PasswordField } from '../components/PasswordField.jsx';
import { sanitizeInternalReturnTo } from '../return-to.js';

export function RegisterScreen() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = sanitizeInternalReturnTo(location.state?.from || '/projects');
  const [values, setValues] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    passwordConfirmation: ''
  });
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
    for (const field of ['name', 'username', 'email', 'password', 'passwordConfirmation'])
      if (!values[field]) validation[field] = 'Campo obrigatório.';
    if (
      values.username &&
      !/^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/.test(values.username.toLowerCase())
    )
      validation.username = 'Use de 3 a 30 caracteres válidos, sem separador nas extremidades.';
    if (values.password !== values.passwordConfirmation)
      validation.passwordConfirmation = 'As senhas não coincidem.';
    if (Object.keys(validation).length) {
      setFieldErrors(validation);
      queueMicrotask(() => document.getElementById(Object.keys(validation)[0])?.focus());
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const payload = { ...values };
      delete payload.passwordConfirmation;
      await register(payload);
      navigate(returnTo);
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
      title="Criar conta"
      eyebrow="Identidade TRACEFLOW"
      description="Cadastre somente os dados necessários para usar o produto."
      footer={
        <>
          <p>
            Já possui conta?{' '}
            <Link to="/login" state={{ from: returnTo }}>
              Entrar
            </Link>
          </p>
          <p className="auth-privacy">
            Usamos estes dados para autenticação, colaboração e comunicações transacionais. Consulte
            o aviso de privacidade após entrar.
          </p>
        </>
      }
    >
      <form className="auth-form" onSubmit={submit} noValidate>
        <FormInput
          id="name"
          name="name"
          label="Nome completo"
          value={values.name}
          onChange={(event) => change('name', event.target.value)}
          autoComplete="name"
          required
          error={fieldErrors.name}
        />
        <FormInput
          id="username"
          name="username"
          label="Nome de usuário"
          value={values.username}
          onChange={(event) => change('username', event.target.value.toLowerCase())}
          autoComplete="username"
          required
          error={fieldErrors.username}
        />
        <FormInput
          id="email"
          name="email"
          label="E-mail"
          type="email"
          value={values.email}
          onChange={(event) => change('email', event.target.value)}
          autoComplete="email"
          required
          error={fieldErrors.email}
        />
        <PasswordField
          id="password"
          value={values.password}
          onChange={(event) => change('password', event.target.value)}
          error={fieldErrors.password}
          showRequirements
        />
        <PasswordField
          id="passwordConfirmation"
          label="Confirmar senha"
          value={values.passwordConfirmation}
          onChange={(event) => change('passwordConfirmation', event.target.value)}
          error={fieldErrors.passwordConfirmation}
        />
        <FeedbackRegion error={error} />
        <button className="button button-primary auth-submit" type="submit" disabled={submitting}>
          {submitting ? 'Criando...' : 'Criar conta'}
        </button>
      </form>
    </AuthShell>
  );
}
