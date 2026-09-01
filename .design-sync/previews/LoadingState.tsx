import { Card, LoadingState } from 'traceflow';

export const Default = () => <LoadingState />;

export const WithMessage = () => <LoadingState message="Carregando artefatos do repositório..." />;

export const InCard = () => (
  <Card title="Projetos cadastrados">
    <LoadingState message="Carregando projetos..." />
  </Card>
);
