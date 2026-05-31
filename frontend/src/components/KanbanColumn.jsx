// Coluna placeholder para o futuro quadro agil.
// TODO: Renderizar tarefas e mudancas de status durante a implementacao de RF08.
export function KanbanColumn({ title, children }) {
  return (
    <section className="kanban-column">
      <h2>{title}</h2>
      {children || <p>Tarefas serao exibidas aqui.</p>}
    </section>
  );
}
