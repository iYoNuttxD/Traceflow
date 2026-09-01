import { FeedbackRegion } from '../../shared/index.js';

export function SettingsFeedback({ error, warning, message, retryAfterSeconds = 0 }) {
  const rateLimitMessage = error || warning;
  return (
    <FeedbackRegion
      error={retryAfterSeconds ? undefined : error}
      warning={retryAfterSeconds ? undefined : warning}
      rateLimit={retryAfterSeconds ? rateLimitMessage : undefined}
      remainingRetryAfterSeconds={retryAfterSeconds}
      success={message}
    />
  );
}
