import { useRef, useState } from 'react';
import { authApi } from '../api/auth.api.js';
import { FeedbackRegion, normalizeApiError, useCountdown } from '../../../shared/index.js';

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
    <aside className="email-verification-banner">
      <form className="username-setup-form" onSubmit={submit}>
        <strong>Escolha seu nome de usuário público.</strong>
        <input
          aria-label="Novo nome de usuário"
          value={username}
          onChange={(event) => setUsername(event.target.value.toLowerCase())}
          minLength="3"
          maxLength="30"
          required
        />
        <button type="submit" disabled={saving || cooldown > 0} aria-busy={saving}>
          {saving
            ? 'Salvando...'
            : cooldown > 0
              ? `Salvar username em ${cooldown}s`
              : 'Salvar username'}
        </button>
        {message && (
          <FeedbackRegion
            error={cooldown ? undefined : message}
            rateLimit={cooldown ? message : undefined}
            retryAfterSeconds={retryAfterSeconds}
          />
        )}
      </form>
    </aside>
  );
}
