import { FeedbackRegion } from '../../shared/index.js';

export function SettingsFeedback({ error, message }) {
  return <FeedbackRegion error={error} success={message} />;
}
