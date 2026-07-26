export function KanbanColumn({ title, children, className = '', ...props }) {
  return (
    <section className={`kanban-column ${className}`.trim()} {...props}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
