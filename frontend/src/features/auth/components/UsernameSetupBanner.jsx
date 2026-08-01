import { useState } from 'react';
import { authApi } from '../api/auth.api.js';
import { normalizeApiError } from '../../../shared/index.js';

export function UsernameSetupBanner({ user, onUpdated }) {
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  if (!user?.mustSetUsername) return null;
  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const response = await authApi.updateUsername(username);
      onUpdated(response.data.user);
    } catch (error) {
      setMessage(normalizeApiError(error).message);
    } finally {
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
        <button type="submit" disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar username'}
        </button>
        {message && <span role="alert">{message}</span>}
      </form>
    </aside>
  );
}
