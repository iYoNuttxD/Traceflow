export function AuthShell({ eyebrow, title, description, children, footer }) {
  return (
    <main className="auth-page">
      <section className="auth-shell" aria-labelledby="auth-title">
        <div className="auth-card">
          <header className="auth-header">
            <span className="auth-brand">TRACEFLOW</span>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h1 id="auth-title">{title}</h1>
            {description && <p>{description}</p>}
          </header>
          {children}
          {footer && <footer className="auth-footer">{footer}</footer>}
        </div>
      </section>
    </main>
  );
}
