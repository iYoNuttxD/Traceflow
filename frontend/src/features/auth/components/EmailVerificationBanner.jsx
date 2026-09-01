import { useRef, useState } from 'react';
import { authApi } from '../api/auth.api.js';
import {
  FeedbackRegion,
  TraceFlowIcon,
  normalizeApiError,
  useCountdown
} from '../../../shared/index.js';
import './IdentityBanner.css';

export function EmailVerificationBanner({ user }) {
  const [feedback, setFeedback] = useState({ message: '', variant: 'success' });
  const [sending, setSending] = useState(false);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const cooldown = useCountdown(retryAfterSeconds);
  const resendLock = useRef(false);
  if (!user || user.emailVerifiedAt) return null;
  async function resend() {
    if (resendLock.current || cooldown > 0) return;
    resendLock.current = true;
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
      setRetryAfterSeconds(normalized.retryAfterSeconds || 0);
    } finally {
      resendLock.current = false;
      setSending(false);
    }
  }
  return (
    <aside className="identity-banner">
      <div className="identity-banner__content">
        <span className="identity-banner__icon" aria-hidden="true">
          <TraceFlowIcon name="mail" />
        </span>
        <div>
          <strong>Verifique seu e-mail.</strong>
          <p>Ações sensíveis permanecem bloqueadas até a confirmação.</p>
        </div>
      </div>
      <button
        className="button button-primary identity-banner__action"
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
        <div className="identity-banner__feedback">
          <FeedbackRegion
            success={feedback.variant === 'success' ? feedback.message : undefined}
            error={feedback.variant === 'error' ? feedback.message : undefined}
            rateLimit={feedback.variant === 'rate-limit' ? feedback.message : undefined}
            retryAfterSeconds={retryAfterSeconds}
          />
        </div>
      )}
    </aside>
  );
}
