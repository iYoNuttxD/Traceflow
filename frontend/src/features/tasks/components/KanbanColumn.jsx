export function KanbanColumn({ title, count, children, className = '', ...props }) {
  return (
    <section className={`kanban-column ${className}`.trim()} {...props}>
      <header className="kanban-column__header">
        <h2>{title}</h2>
        <span aria-label={`${count} ${count === 1 ? 'tarefa' : 'tarefas'}`}>{count}</span>
      </header>
      {children}
    </section>
  );
}
