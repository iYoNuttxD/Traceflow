// Card simples reutilizavel para conteudos futuros.
// TODO: Definir variacoes visuais quando as telas forem implementadas.
export function Card({ title, children }) {
  return (
    <section className="card">
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}
