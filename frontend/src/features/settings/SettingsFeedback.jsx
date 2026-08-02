export function SettingsFeedback({ error, message }) {
  return (
    <div aria-live="polite">
      {error && <div className="message message-error">{error}</div>}
      {message && <div className="message message-success">{message}</div>}
    </div>
  );
}
