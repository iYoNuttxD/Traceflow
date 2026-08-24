import { Link } from 'react-router';

// Sprints e Marcos saíram de dentro do Cronograma para o primeiro nível: são
// três assuntos distintos — o ciclo de execução, a entrega agrupada e a agenda —
// e empilhá-los numa tela só obrigava a rolar a página inteira para trocar de um
// para o outro. Cada um agora tem URL própria, compartilhável e recarregável.
const projectSections = [
  { key: 'tasks', label: 'Tarefas', path: 'tasks' },
  { key: 'requirements', label: 'Requisitos', path: 'requirements' },
  { key: 'kanban', label: 'Kanban', path: 'kanban' },
  { key: 'sprints', label: 'Sprints', path: 'sprints' },
  { key: 'milestones', label: 'Marcos', path: 'milestones' },
  { key: 'schedule', label: 'Cronograma', path: 'schedule' },
  { key: 'repository', label: 'Repositório', path: 'repository' },
  { key: 'traceability', label: 'Rastreabilidade', path: 'traceability' }
];

export function ProjectSectionNav({
  projectId,
  activeSection,
  showSyncButton = false,
  onSync,
  isSyncing = false
}) {
  return (
    <nav className="project-section-nav" aria-label="Navegação do projeto">
      {projectSections.map((section) => (
        <Link
          className={`project-section-nav-link ${
            activeSection === section.key ? 'project-section-nav-link-active' : ''
          }`}
          key={section.key}
          to={`/projects/${projectId}/${section.path}`}
        >
          {section.label}
        </Link>
      ))}
      {showSyncButton && (
        <button
          className="project-section-nav-link project-section-nav-sync"
          type="button"
          onClick={onSync}
          disabled={isSyncing}
        >
          {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
        </button>
      )}
    </nav>
  );
}
