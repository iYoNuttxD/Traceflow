// Card compartilhado usado pelas telas atuais.
export function Card({ title, headerAction, className = '', children }) {
  return (
    <section className={['card', className].filter(Boolean).join(' ')}>
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
