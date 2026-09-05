import { useId } from 'react';
import { TraceFlowIcon } from '../../../shared/index.js';
import './TaskDetailsPanel.css';

export function TaskDetailsLayout({ children, aside }) {
  return (
    <div className={`task-detail-layout${aside ? '' : ' task-detail-layout--single'}`}>
      <section className="task-detail-main">{children}</section>
      {aside}
    </div>
  );
}

export function TaskInformation({ details }) {
  const titleId = useId();
  return (
    <>
      <p className="task-detail-description">{details.description}</p>
      <section className="task-detail-section" aria-labelledby={titleId}>
        <h3 id={titleId}>Informações</h3>
        <dl className="task-detail-grid">
          <div>
            <dt>Prioridade</dt>
            <dd>
              {details.priority.key ? (
                <span className={`priority-badge priority-${details.priority.key.toLowerCase()}`}>
                  {details.priority.label}
                </span>
              ) : (
                details.priority.label
              )}
            </dd>
          </div>
          <div>
            <dt>Responsável</dt>
            <dd className="task-detail-responsible">
              <span aria-hidden="true">{details.responsible.initial}</span>
              {details.responsible.label}
            </dd>
          </div>
          <div>
            <dt>Prazo</dt>
            <dd className={details.deadline.overdue ? 'task-detail-deadline--overdue' : ''}>
              {details.deadline.label}
              {details.deadline.overdue && <small>Atrasada</small>}
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              {details.status.key ? (
                <span className={`status-badge status-${details.status.key.toLowerCase()}`}>
                  {details.status.label}
                </span>
              ) : (
                details.status.label
              )}
            </dd>
          </div>
        </dl>
        <dl className="task-detail-secondary-grid">
          <div>
            <dt>Esforço estimado</dt>
            <dd>{details.estimatedEffort}</dd>
          </div>
          <div>
            <dt>Esforço realizado</dt>
            <dd>{details.actualEffort}</dd>
          </div>
          <div>
            <dt>Criado em</dt>
            <dd>{details.createdAt}</dd>
          </div>
        </dl>
      </section>
    </>
  );
}

export function TaskTraceabilityGrid({ children }) {
  const titleId = useId();
  return (
    <section className="task-detail-section task-detail-traceability" aria-labelledby={titleId}>
      <div className="task-detail-section-heading">
        <h3 id={titleId}>Rastreabilidade</h3>
      </div>
      <div className="task-detail-traceability-grid">{children}</div>
    </section>
  );
}

export function ArtifactCategory({ label, count, children }) {
  return (
    <article>
      <header className="task-detail-artifact-heading">
        <span>{label}</span>
        <strong
          aria-label={
            count == null
              ? `Quantidade de ${label.toLocaleLowerCase('pt-BR')} indisponível`
              : `${count} ${label.toLocaleLowerCase('pt-BR')}`
          }
        >
          {count ?? '—'}
        </strong>
      </header>
      <div className="task-detail-artifact-body">{children}</div>
    </article>
  );
}

export function GithubExternalAction({ href }) {
  return (
    <a
      className="button button-compact task-detail-external-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      Abrir no GitHub
      <TraceFlowIcon name="externalLink" />
    </a>
  );
}
