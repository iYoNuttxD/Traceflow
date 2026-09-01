import { Card, EmptyState } from 'traceflow';

export const Milestones = () => (
  <EmptyState
    title="Nenhum marco cadastrado."
    description="Cadastre marcos para acompanhar as entregas previstas do projeto."
  />
);

export const TitleOnly = () => <EmptyState title="Nenhum requisito encontrado para este filtro." />;

export const InCard = () => (
  <Card title="Marcos do projeto">
    <EmptyState
      title="Nenhum marco cadastrado."
      description="Cadastre marcos para acompanhar as entregas previstas do projeto."
    />
  </Card>
);
