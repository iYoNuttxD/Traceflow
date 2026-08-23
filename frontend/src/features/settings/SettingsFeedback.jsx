import { FeedbackRegion } from '../../shared/index.js';

export function SettingsFeedback({ error, message, retryAfterSeconds = 0 }) {
  return (
    <FeedbackRegion
      error={retryAfterSeconds ? undefined : error}
      rateLimit={retryAfterSeconds ? error : undefined}
      retryAfterSeconds={retryAfterSeconds}
      success={message}
    />
  );
}
