import { Card } from 'traceflow';

export const Overview = () => (
  <Card title="Visão geral do projeto">
    <p>Plataforma de rastreabilidade de projetos de software.</p>
    <div className="project-meta">
      <span>Equipe: Squad Rastreabilidade</span>
      <span>Repositório: JoaoVitorSHernandes/traceflow</span>
      <span>Criado em: 12/03/2026</span>
    </div>
  </Card>
);

export const Metric = () => (
  <Card title="Total de requisitos">
    <strong style={{ fontSize: '2rem' }}>48</strong>
    <p>32 aprovados, 16 em análise.</p>
  </Card>
);

export const WithList = () => (
  <Card title="Projetos cadastrados">
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
      <article className="project-item">
        <div className="project-item-header">
          <div>
            <h3>Portal do Aluno</h3>
            <p>Sem descrição cadastrada.</p>
          </div>
          <span className="status-badge status-concluido">CONCLUIDO</span>
        </div>
      </article>
    </div>
  </Card>
);

export const Untitled = () => (
  <Card>
    <p>
      Sem título: use esta variação quando a página já tem um cabeçalho e o card
      serve apenas para agrupar o conteúdo.
    </p>
  </Card>
);
