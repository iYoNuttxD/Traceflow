import { Card, ErrorBoundary } from 'traceflow';

// Throws during render so the boundary actually catches and shows its fallback.
// React handles the throw internally — it does not surface as a page error.
function BrokenPanel() {
  throw new Error('Falha simulada de renderização.');
  return null;
}

export const CaughtError = () => (
  <ErrorBoundary>
    <BrokenPanel />
  </ErrorBoundary>
);

export const Healthy = () => (
  <ErrorBoundary>
    <Card title="Visão geral do projeto">
      <p>Quando nada falha, o ErrorBoundary é invisível: ele renderiza os filhos.</p>
      <div className="project-meta">
        <span>Equipe: Squad Rastreabilidade</span>
        <span>Status: Em andamento</span>
      </div>
    </Card>
  </ErrorBoundary>
);
