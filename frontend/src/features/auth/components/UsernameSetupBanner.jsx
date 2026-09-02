import { useRef, useState } from 'react';
import { authApi } from '../api/auth.api.js';
import {
  FeedbackRegion,
  TraceFlowIcon,
  normalizeApiError,
  useCountdown
} from '../../../shared/index.js';
import './IdentityBanner.css';

export function UsernameSetupBanner({ user, onUpdated }) {
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const cooldown = useCountdown(retryAfterSeconds);
  const submitLock = useRef(false);
  if (!user?.mustSetUsername) return null;
  async function submit(event) {
    event.preventDefault();
    if (submitLock.current || cooldown > 0) return;
    submitLock.current = true;
    setSaving(true);
    setMessage('');
    setRetryAfterSeconds(0);
    try {
      const response = await authApi.updateUsername(username);
      onUpdated(response.data.user);
    } catch (error) {
      const normalized = normalizeApiError(error);
      setMessage(normalized.message);
      setRetryAfterSeconds(normalized.retryAfterSeconds || 0);
    } finally {
      submitLock.current = false;
      setSaving(false);
    }
  }
  return (
    <aside className="identity-banner">
      <form className="username-setup-form" onSubmit={submit}>
        <div className="identity-banner__content">
          <span className="identity-banner__icon" aria-hidden="true">
            <TraceFlowIcon name="users" />
          </span>
          <strong>Escolha seu nome de usuário.</strong>
        </div>
        <div className="username-setup-form__controls">
          <div className="username-setup-form__field">
            <label htmlFor="setup-username">Novo nome de usuário</label>
            <input
              id="setup-username"
              name="username"
              value={username}
              onChange={(event) => setUsername(event.target.value.toLowerCase())}
              autoComplete="username"
              minLength="3"
              maxLength="30"
              required
            />
          </div>
          <button
            className="button button-primary identity-banner__action"
            type="submit"
            disabled={saving || cooldown > 0}
            aria-busy={saving}
          >
            {saving
              ? 'Salvando...'
              : cooldown > 0
                ? `Salvar username em ${cooldown}s`
                : 'Salvar username'}
          </button>
        </div>
        {message && (
          <div className="identity-banner__feedback">
            <FeedbackRegion
              error={cooldown ? undefined : message}
              rateLimit={cooldown ? message : undefined}
              retryAfterSeconds={retryAfterSeconds}
            />
          </div>
        )}
      </form>
    </aside>
  );
}
