import { useState } from 'react';
import { authApi } from '../auth/index.js';
import { normalizeApiError } from '../../shared/index.js';

export function GithubSensitiveReauthentication({ account, returnTo, onError }) {
  const [loading, setLoading] = useState(false);

  if (!account || account.hasLocalPassword) return null;
  if (!account.hasGithubIdentity) {
    return (
      <p className="danger-impact">
        A conta não possui senha local nem identidade GitHub válida para confirmar esta ação.
      </p>
    );
  }
  if (account.recentlyReauthenticated) {
    return (
      <p className="settings-callout" role="status">
        Identidade GitHub confirmada recentemente.
      </p>
    );
  }

  return (
    <button
      className="button button-secondary"
      type="button"
      disabled={loading}
      aria-busy={loading}
      onClick={async () => {
        if (loading) return;
        setLoading(true);
        try {
          const result = await authApi.startGithubSensitiveReauthentication(returnTo);
          window.location.assign(result.url);
        } catch (error) {
          onError?.(normalizeApiError(error).message);
          setLoading(false);
        }
      }}
    >
      {loading ? 'Conectando ao GitHub...' : 'Confirmar identidade com GitHub'}
    </button>
  );
}
