import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PublicPageShell, StatusSurface, normalizeApiError } from '../../shared/index.js';
import { runSingleFlight } from '../../shared/services/single-flight.js';
import { settingsApi } from './settings.api.js';

export function ConfirmationPage({ type }) {
  const [params] = useSearchParams();
  const [state, setState] = useState({ loading: true, error: '' });
  useEffect(() => {
    let active = true;
    const token = params.get('token');
    const operation = type === 'email' ? settingsApi.confirmEmail : settingsApi.confirmReactivation;
    if (!token) {
      setState({ loading: false, error: 'Link inválido ou incompleto.' });
      return () => {
        active = false;
      };
    }
    runSingleFlight(`settings-confirmation:${type}:${token}`, () => operation(token))
      .then(() => {
        if (active) setState({ loading: false, error: '' });
      })
      .catch((value) => {
        if (active) setState({ loading: false, error: normalizeApiError(value).message });
      });
    return () => {
      active = false;
    };
  }, [params, type]);
  const success = !state.loading && !state.error;
  const title = state.loading
    ? 'Validando confirmação'
    : success
      ? type === 'email'
        ? 'E-mail confirmado'
        : 'Conta reativada'
      : 'Não foi possível confirmar';
  const description = state.loading
    ? 'Aguarde enquanto validamos o link.'
    : success
      ? type === 'email'
        ? 'E-mail alterado. Faça login novamente.'
        : 'Conta reativada. Faça login novamente.'
      : state.error;

  return (
    <PublicPageShell>
      <StatusSurface
        title={title}
        description={description}
        icon={state.loading ? 'refresh' : success ? 'check' : 'mail'}
        tone={state.loading ? 'info' : success ? 'success' : 'danger'}
        role={state.loading || success ? 'status' : 'alert'}
        focusKey={`${type}:${state.loading}:${success}:${state.error}`}
        actions={
          state.loading ? undefined : (
            <Link className="button button-primary link-button" to="/login">
              Ir para o login
            </Link>
          )
        }
      />
    </PublicPageShell>
  );
}
