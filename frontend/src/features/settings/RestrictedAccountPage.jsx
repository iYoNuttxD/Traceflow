import { Link } from 'react-router';
import { useState } from 'react';
import { normalizeApiError } from '../../shared/index.js';
import { useAuth } from '../auth/index.js';
import { settingsApi } from './settings.api.js';
import './RestrictedAccountPage.css';

export function RestrictedAccountPage() {
  const { user, logout } = useAuth();
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const deletion = user?.accountStatus === 'DELETION_PENDING';
  return (
    <main className="restricted-page">
      <p className="eyebrow">Conta em modo restrito</p>
      <h1>{deletion ? 'Exclusão pendente' : 'Conta desativada'}</h1>
      <p>
        {deletion
          ? 'Você pode exportar seus dados ou cancelar a exclusão durante o prazo de carência.'
          : 'Seus projetos e dados continuam preservados. Confirme a reativação por e-mail para voltar a usar o TraceFlow.'}
      </p>
      {error && <div className="message message-error">{error}</div>}
      {feedback && <div className="message message-success">{feedback}</div>}
      <div className="restricted-actions">
        {deletion ? (
          <Link to="/settings/privacy">Gerenciar exclusão e exportação</Link>
        ) : (
          <button
            type="button"
            onClick={async () => {
              try {
                await settingsApi.startReactivation();
                setFeedback('Enviamos um link de reativação ao seu e-mail.');
              } catch (value) {
                setError(normalizeApiError(value).message);
              }
            }}
          >
            Enviar link de reativação
          </button>
        )}
        <Link to="/settings/account">Ver dados da conta</Link>
        <button type="button" onClick={() => void logout()}>
          Sair
        </button>
      </div>
    </main>
  );
}
