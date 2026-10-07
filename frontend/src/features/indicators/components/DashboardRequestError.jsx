import { FeedbackRegion } from '../../../shared/index.js';
import { useCountdown } from '../../../shared/hooks/useCountdown.js';

// Mount with the request identity as key so a previous context never owns this timer.
export function DashboardRequestError({ error, prefix = '', onRetry }) {
  const rateLimited = error.status === 429;
  const remaining = useCountdown(rateLimited ? error.retryAfterSeconds : 0);
  const message = [prefix, error.message].filter(Boolean).join(' ');
  return (
    <div className="dashboard-panel__error">
      <FeedbackRegion
        error={rateLimited ? undefined : message}
        rateLimit={rateLimited ? message : undefined}
        retryAfterSeconds={error.retryAfterSeconds}
        remainingRetryAfterSeconds={remaining}
      />
      <button type="button" disabled={remaining > 0} onClick={onRetry}>
        Tentar novamente
      </button>
    </div>
  );
}
