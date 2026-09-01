import { Link } from 'react-router';
import '../../../shared/styles/internal-tabs.css';
import '../styles/project-tabs.css';

const projectSections = [
  { key: 'overview', label: 'Visão geral', path: '' },
  { key: 'tasks', label: 'Tarefas', path: 'tasks' },
  { key: 'requirements', label: 'Requisitos', path: 'requirements' },
  { key: 'kanban', label: 'Kanban', path: 'kanban' },
  { key: 'repository', label: 'Repositório', path: 'repository' },
  { key: 'traceability', label: 'Rastreabilidade', path: 'traceability' }
];

export function ProjectSectionNav({ projectId, activeSection }) {
  return (
    <nav className="internal-tabs project-section-tabs" aria-label="Navegação do projeto">
      {projectSections.map((section) => (
        <Link
          className={`internal-tab ${activeSection === section.key ? 'internal-tab--active' : ''}`}
          key={section.key}
          to={`/projects/${projectId}${section.path ? `/${section.path}` : ''}`}
          aria-current={activeSection === section.key ? 'page' : undefined}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
