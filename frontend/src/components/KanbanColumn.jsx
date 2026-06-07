export function KanbanColumn({ title, children }) {
  return (
    <section className="kanban-column">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
