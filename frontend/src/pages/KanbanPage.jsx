// Pagina do quadro agil.
// TODO: Organizar tarefas por status conforme RF08.
import { KanbanColumn } from '../components/KanbanColumn.jsx';

export function KanbanPage() {
  return (
    <main>
      <h1>Kanban</h1>
      <p>Este quadro simples organizara as tarefas por etapa.</p>
      <div className="kanban-board">
        <KanbanColumn title="A Fazer" />
        <KanbanColumn title="Em Andamento" />
        <KanbanColumn title="Concluido" />
      </div>
    </main>
  );
}
