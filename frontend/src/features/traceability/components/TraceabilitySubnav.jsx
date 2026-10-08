import { Link } from 'react-router';
import '../../../shared/styles/internal-tabs.css';
import './TraceabilitySubnav.css';

const sections = [
  { key: 'requirements', label: 'Requisitos', path: '' },
  { key: 'alerts', label: 'Alertas', path: '/alerts' },
  { key: 'unlinked', label: 'Tarefas sem vínculo técnico', path: '/unlinked-tasks' }
];

export function TraceabilitySubnav({ projectId, active, openAlerts }) {
  return (
    <nav className="internal-tabs traceability-subnav" aria-label="Seções da rastreabilidade">
      {sections.map((section) => {
        const current = section.key === active;
        return (
          <Link
            key={section.key}
            to={`/projects/${projectId}/traceability${section.path}`}
            className={`internal-tab${current ? ' internal-tab--active' : ''}`}
            aria-current={current ? 'page' : undefined}
          >
            {section.key === 'alerts' && openAlerts > 0
              ? `${section.label} (${openAlerts})`
              : section.label}
          </Link>
        );
      })}
    </nav>
  );
}
