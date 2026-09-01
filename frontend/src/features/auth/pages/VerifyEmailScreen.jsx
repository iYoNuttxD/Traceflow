import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PublicPageShell, StatusSurface, normalizeApiError } from '../../../shared/index.js';
import { authApi } from '../api/auth.api.js';
import { useAuth } from '../AuthContext.jsx';
import { runSingleFlight } from '../../../shared/services/single-flight.js';
export function VerifyEmailScreen() {
  const auth = useAuth();
  const user = auth?.user;
  const refresh = auth?.refresh;
  const [params] = useSearchParams();
  const [state, setState] = useState({ loading: true, success: '', error: '' });
  useEffect(() => {
    let active = true;
    const token = params.get('token');
    if (!token) {
      setState({
        loading: false,
        success: '',
        error: 'Link de verificação inválido ou incompleto.'
      });
      return () => {
        active = false;
      };
    }
    runSingleFlight(`verify-email:${token}`, () => authApi.verifyEmail(token))
      .then(async (response) => {
        if (!active) return;
        if (user?.id === response.data.user?.id && refresh) await refresh();
        if (!active) return;
        setState({ loading: false, success: response.data.message, error: '' });
      })
      .catch((cause) => {
        if (active)
          setState({ loading: false, success: '', error: normalizeApiError(cause).message });
      });
    return () => {
      active = false;
    };
  }, [params, refresh, user?.id]);

  const visualState = state.loading ? 'loading' : state.error ? 'error' : 'success';
  const content = {
    loading: {
      title: 'Verificando e-mail',
      description: 'Aguarde enquanto validamos o link.',
      icon: 'refresh',
      tone: 'info',
      role: 'status'
    },
    success: {
      title: 'E-mail verificado',
      description: state.success,
      icon: 'check',
      tone: 'success',
      role: 'status'
    },
    error: {
      title: 'Não foi possível verificar',
      description: state.error,
      icon: 'mail',
      tone: 'danger',
      role: 'alert'
    }
  }[visualState];

  return (
    <PublicPageShell>
      <StatusSurface
        {...content}
        focusKey={visualState}
        actions={
          visualState === 'loading' ? undefined : (
            <Link className="button button-primary link-button" to="/projects">
              Ir para projetos
            </Link>
          )
        }
      />
    </PublicPageShell>
  );
}
