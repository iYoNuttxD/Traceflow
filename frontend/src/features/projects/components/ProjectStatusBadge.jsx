import './ProjectStatusBadge.css';

const statusPresentation = Object.freeze({
  ATIVO: { label: 'Ativo', variant: 'success' },
  INATIVO: { label: 'Inativo', variant: 'neutral' },
  ARQUIVADO: { label: 'Arquivado', variant: 'warning' }
});

export function ProjectStatusBadge({ status }) {
  const presentation = statusPresentation[status];
  if (!presentation) return null;

  return (
    <span className={`project-status-badge project-status-badge--${presentation.variant}`}>
      <span className="project-status-badge__dot" aria-hidden="true" />
      {presentation.label}
    </span>
  );
}
