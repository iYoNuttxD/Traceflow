import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { FeedbackRegion, LoadingState, normalizeApiError } from '../../../shared/index.js';
import { authApi } from '../api/auth.api.js';
import { AuthShell } from '../components/AuthShell.jsx';
import { useAuth } from '../AuthContext.jsx';
export function VerifyEmailScreen() {
  const auth = useAuth();
  const user = auth?.user;
  const refresh = auth?.refresh;
  const [params] = useSearchParams();
  const [state, setState] = useState({ loading: true, success: '', error: '' });
  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setState({
        loading: false,
        success: '',
        error: 'Link de verificação inválido ou incompleto.'
      });
      return;
    }
    authApi
      .verifyEmail(token)
      .then(async (response) => {
        if (user?.id === response.data.user?.id && refresh) await refresh();
        setState({ loading: false, success: response.data.message, error: '' });
      })
      .catch((cause) =>
        setState({ loading: false, success: '', error: normalizeApiError(cause).message })
      );
  }, [params, refresh, user?.id]);
  return (
    <AuthShell
      title="Verificar e-mail"
      eyebrow="Confirmação de conta"
      footer={<Link to="/projects">Ir para projetos</Link>}
    >
      {state.loading ? (
        <LoadingState message="Verificando e-mail..." />
      ) : (
        <FeedbackRegion success={state.success} error={state.error} />
      )}
    </AuthShell>
  );
}
