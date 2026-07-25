import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { normalizeApiError } from '../api/api.js';
export function LoginPage() {
  const { login } = useAuth(); const navigate = useNavigate(); const location = useLocation();
  const [values, setValues] = useState({ email: '', password: '' }); const [error, setError] = useState('');
  async function submit(event) { event.preventDefault(); setError(''); try { await login(values); navigate(location.state?.from || '/projects', { replace: true }); } catch (cause) { setError(normalizeApiError(cause).message); } }
  return <main className="page"><h1>Entrar</h1><form onSubmit={submit}><label>E-mail<input type="email" value={values.email} onChange={(e) => setValues({ ...values, email: e.target.value })} required /></label><label>Senha<input type="password" value={values.password} onChange={(e) => setValues({ ...values, password: e.target.value })} required /></label>{error && <p role="alert">{error}</p>}<button type="submit">Entrar</button></form><Link to="/forgot-password">Esqueci minha senha</Link> <Link to="/register">Criar conta</Link></main>;
}
