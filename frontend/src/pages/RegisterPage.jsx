import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/index.js';
import { FeedbackRegion, FormInput, normalizeApiError } from '../shared/index.js';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState({ name: '', email: '', password: '' });
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
    setSubmitting(true);
    setError('');
    try {
      await register(values);
      navigate('/projects');
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
      <h1>Criar conta</h1>
      <form onSubmit={submit} noValidate>
        <FormInput
          id="name"
          name="name"
          label="Nome"
          value={values.name}
          onChange={(event) => change('name', event.target.value)}
          required
          error={fieldErrors.name}
        />
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
          {submitting ? 'Criando...' : 'Criar conta'}
        </button>
      </form>
      <Link to="/login">Já tenho conta</Link>
    </main>
  );
}
