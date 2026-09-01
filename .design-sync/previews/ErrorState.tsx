import { Card, ErrorState } from 'traceflow';

export const WithRetry = () => (
  <ErrorState message="Não foi possível carregar as tarefas." onRetry={() => {}} />
);

export const WithoutRetry = () => (
  <ErrorState message="O projeto informado não existe mais." />
);

export const InCard = () => (
  <Card title="Projetos cadastrados">
    <ErrorState message="Não foi possível carregar os projetos." onRetry={() => {}} />
  </Card>
);
