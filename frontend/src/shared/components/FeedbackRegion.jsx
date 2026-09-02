function principalMessage(error, success) {
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
  return null;
}

export function FeedbackRegion({ error, success, notice }) {
  const principal = principalMessage(error, success);
  if (!principal && !notice) {
    return <div className="feedback-region" aria-live="polite" aria-atomic="true" />;
  }
  return (
    <>
      {principal}
      {notice ? (
        <div className="message message-error" role="alert">
          {notice}
        </div>
      ) : null}
    </>
  );
}
