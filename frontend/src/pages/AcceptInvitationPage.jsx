import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../features/auth/index.js';
import { normalizeApiError } from '../shared/index.js';
export function AcceptInvitationPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  async function accept() {
    try {
      const { data } = await authApi.acceptInvitation(params.get('token'));
      navigate(`/projects/${data.membership.projectId}`);
    } catch (cause) {
      setError(normalizeApiError(cause).message);
    }
  }
  return (
    <main className="page">
      <h1>Aceitar convite</h1>
      <p>Confirme para entrar no projeto com a sua conta atual.</p>
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={() => void accept()}>
        Aceitar convite
      </button>
    </main>
  );
}
