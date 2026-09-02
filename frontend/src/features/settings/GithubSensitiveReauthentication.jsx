import { useState } from 'react';
import { authApi } from '../auth/index.js';
import { normalizeApiError } from '../../shared/index.js';

export function GithubSensitiveReauthentication({ account, returnTo, cooldown = 0, onError }) {
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
      disabled={loading || cooldown > 0}
      aria-busy={loading}
      onClick={async () => {
        if (loading || cooldown > 0) return;
        setLoading(true);
        try {
          const result = await authApi.startGithubSensitiveReauthentication(returnTo);
          window.location.assign(result.url);
        } catch (error) {
          const normalized = normalizeApiError(error);
          onError?.(normalized.message, normalized);
          setLoading(false);
        }
      }}
    >
      {loading
        ? 'Conectando ao GitHub...'
        : cooldown > 0
          ? `Confirmar identidade em ${cooldown}s`
          : 'Confirmar identidade com GitHub'}
    </button>
  );
}
