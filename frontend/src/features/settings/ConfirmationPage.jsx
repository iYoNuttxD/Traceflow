import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { normalizeApiError } from '../../shared/index.js';
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
  return (
    <main className="auth-status-page">
      <h1>{type === 'email' ? 'Confirmação de e-mail' : 'Reativação da conta'}</h1>
      {state.loading ? (
        <p>Validando link...</p>
      ) : state.error ? (
        <div className="message message-error">{state.error}</div>
      ) : (
        <div className="message message-success">
          Operação concluída. Entre novamente para continuar.
        </div>
      )}
      <Link to="/login">Ir para o login</Link>
    </main>
  );
}
