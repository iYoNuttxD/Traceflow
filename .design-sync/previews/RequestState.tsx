import { Card, RequestState } from 'traceflow';

const projects = (
  <div className="project-list">
    <article className="project-item">
      <div className="project-item-header">
        <div>
          <h3>TRACEFLOW</h3>
          <p>Plataforma de rastreabilidade de projetos de software.</p>
        </div>
        <span className="status-badge status-ativo">ATIVO</span>
      </div>
    </article>
  </div>
);

export const Loading = () => (
  <Card title="Projetos cadastrados">
    <RequestState loading>{projects}</RequestState>
  </Card>
);

export const Failed = () => (
  <Card title="Projetos cadastrados">
    <RequestState
      error="Não foi possível carregar os projetos."
      onRetry={() => {}}
    >
      {projects}
    </RequestState>
  </Card>
);

export const Forbidden = () => (
  <Card title="Auditoria do projeto">
    <RequestState forbidden error="Apenas administradores do projeto podem ver a auditoria.">
      {projects}
    </RequestState>
  </Card>
);

export const Empty = () => (
  <Card title="Projetos cadastrados">
    <RequestState empty>{projects}</RequestState>
  </Card>
);

export const Loaded = () => (
  <Card title="Projetos cadastrados">
    <RequestState>{projects}</RequestState>
  </Card>
);
