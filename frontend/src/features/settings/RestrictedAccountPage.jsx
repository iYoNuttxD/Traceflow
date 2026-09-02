import { Link } from 'react-router';
import { useState } from 'react';
import {
  FeedbackRegion,
  PublicPageShell,
  StatusSurface,
  normalizeApiError
} from '../../shared/index.js';
import { useAuth } from '../auth/index.js';
import { settingsApi } from './settings.api.js';

export function RestrictedAccountPage() {
  const { user, logout } = useAuth();
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [requesting, setRequesting] = useState(false);
  const deletion = user?.accountStatus === 'DELETION_PENDING';

  async function requestReactivation() {
    if (requesting) return;
    setRequesting(true);
    setFeedback('');
    setError('');
    try {
      await settingsApi.startReactivation();
      setFeedback('Enviamos um link de reativação ao seu e-mail.');
    } catch (value) {
      setError(normalizeApiError(value).message);
    } finally {
      setRequesting(false);
    }
  }

  return (
    <PublicPageShell>
      <StatusSurface
        title={deletion ? 'Exclusão pendente' : 'Conta desativada'}
        description={
          deletion
            ? 'Você pode exportar seus dados ou cancelar a exclusão durante o prazo de carência.'
            : 'Seus projetos e dados continuam preservados. Confirme a reativação por e-mail para voltar a usar o TraceFlow.'
        }
        icon={deletion ? 'alert' : 'lock'}
        tone={deletion ? 'warning' : 'info'}
        actions={
          <>
            {deletion ? (
              <Link className="button button-primary link-button" to="/settings/privacy">
                Gerenciar exclusão e exportação
              </Link>
            ) : (
              <button
                className="button button-primary"
                type="button"
                onClick={() => void requestReactivation()}
                disabled={requesting}
                aria-busy={requesting}
              >
                {requesting ? 'Enviando...' : 'Enviar link de reativação'}
              </button>
            )}
            <Link className="button button-secondary link-button" to="/settings/account">
              Ver dados da conta
            </Link>
            <button className="button button-secondary" type="button" onClick={() => void logout()}>
              Sair
            </button>
          </>
        }
      >
        {(error || feedback) && <FeedbackRegion error={error} success={feedback} />}
      </StatusSurface>
    </PublicPageShell>
  );
}
