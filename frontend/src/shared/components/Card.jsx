// Card compartilhado usado pelas telas atuais.
export function Card({ title, headerAction, children }) {
  return (
    <section className="card">
      {title && (
        <header className="card-heading">
          <h2>{title}</h2>
          {headerAction}
        </header>
      )}
      {children}
    </section>
  );
}
