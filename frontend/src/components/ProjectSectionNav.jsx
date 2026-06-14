import { Link } from 'react-router-dom';

const projectSections = [
  { key: 'tasks', label: 'Tarefas', path: 'tasks' },
  { key: 'requirements', label: 'Requisitos', path: 'requirements' },
  { key: 'kanban', label: 'Kanban', path: 'kanban' },
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
