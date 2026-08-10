import { useEffect, useState } from 'react';
import { authApi } from '../api/auth.api.js';
import { FeedbackRegion, normalizeApiError } from '../../../shared/index.js';

export function EmailVerificationBanner({ user }) {
  const [feedback, setFeedback] = useState({ message: '', variant: 'success' });
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  if (!user || user.emailVerifiedAt) return null;
  async function resend() {
    if (sending || cooldown > 0) return;
    setSending(true);
    try {
      await authApi.resendEmailVerification();
      setFeedback({ message: 'E-mail enviado com sucesso.', variant: 'success' });
    } catch (error) {
      const normalized = normalizeApiError(error);
      setFeedback({
        message: normalized.message,
        variant: normalized.retryAfterSeconds ? 'rate-limit' : 'error'
      });
      setCooldown(normalized.retryAfterSeconds || 0);
    } finally {
      setSending(false);
    }
  }
  return (
    <aside className="email-verification-banner">
      <div>
        <strong>⚠ Verifique seu e-mail.</strong>
        <span> Ações sensíveis permanecem bloqueadas até a confirmação.</span>
      </div>
      <button
        className="button button-outline button-compact"
        type="button"
        onClick={resend}
        disabled={sending || cooldown > 0}
        aria-busy={sending}
      >
        {sending
          ? 'Reenviando...'
          : cooldown > 0
            ? `Reenviar em ${cooldown}s`
            : 'Reenviar verificação'}
      </button>
      {feedback.message && (
        <FeedbackRegion
          success={feedback.variant === 'success' ? feedback.message : undefined}
          error={feedback.variant === 'error' ? feedback.message : undefined}
          rateLimit={feedback.variant === 'rate-limit' ? feedback.message : undefined}
          retryAfterSeconds={cooldown}
        />
      )}
    </aside>
  );
}
