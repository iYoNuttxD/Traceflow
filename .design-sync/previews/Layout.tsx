import { Card, Layout } from 'traceflow';

export const AppShell = () => (
  <Layout>
    <main className="page-container">
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
        </div>
      </Card>
    </main>
  </Layout>
);
