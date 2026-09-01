import './PublicPageShell.css';

export function PublicPageShell({ children, className = '' }) {
  const classes = ['public-page-shell', className].filter(Boolean).join(' ');

  return (
    <main className={classes}>
      <div className="public-page-brand">
        <span className="public-page-brand__mark" aria-hidden="true">
          <span />
        </span>
        <span>TRACEFLOW</span>
      </div>
      <div className="public-page-shell__content">{children}</div>
    </main>
  );
}
