import './DetailSurface.css';

export function DetailSurface({ title, children }) {
  return (
    <section className="detail-surface" aria-label={title}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function DescriptionSurface({ children }) {
  return (
    <DetailSurface title="Descrição">
      <p className="detail-surface__text">{children || 'Nenhuma descrição informada.'}</p>
    </DetailSurface>
  );
}
