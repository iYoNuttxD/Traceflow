import './SummaryPanel.css';

export function SummaryPanel({ title, description, label, metrics, busy = false }) {
  return (
    <section className="summary-panel" aria-label={label ?? title} aria-busy={busy}>
      <header className="summary-panel__heading">
        <div>
          <span className="eyebrow">Resumo</span>
          <h2>{title}</h2>
        </div>
        {description && <p>{description}</p>}
      </header>
      <dl className="summary-panel__metrics">
        {metrics.map(({ label, value, detail }) => (
          <div className="summary-panel__metric" key={label}>
            <dt>{label}</dt>
            <dd>{value ?? '—'}</dd>
            {detail && <small>{detail}</small>}
          </div>
        ))}
      </dl>
    </section>
  );
}
