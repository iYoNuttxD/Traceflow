import { useState } from 'react';
import { authApi } from '../api/auth.api.js';
import { normalizeApiError } from '../../../shared/index.js';

export function EmailVerificationBanner({ user }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  if (!user || user.emailVerifiedAt) return null;
  async function resend() {
    setSending(true);
    try {
      setMessage((await authApi.resendEmailVerification()).data.message);
    } catch (error) {
      setMessage(normalizeApiError(error).message);
    } finally {
      setSending(false);
    }
  }
  return (
    <aside className="email-verification-banner" role="status">
      <div>
        <strong>Verifique seu e-mail.</strong>
        <span> Ações sensíveis permanecem bloqueadas até a confirmação.</span>
      </div>
      <button type="button" onClick={resend} disabled={sending}>
        {sending ? 'Enviando...' : 'Reenviar verificação'}
      </button>
      {message && <span>{message}</span>}
    </aside>
  );
}
