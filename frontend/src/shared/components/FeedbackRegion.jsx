export function FeedbackRegion({ error, success }) {
  if (error)
    return (
      <div className="message message-error" role="alert">
        {error}
      </div>
    );
  if (success)
    return (
      <div className="message message-success" role="status" aria-live="polite">
        {success}
      </div>
    );
  return <div className="feedback-region" aria-live="polite" aria-atomic="true" />;
}
