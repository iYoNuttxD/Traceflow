import { Card, ForbiddenState } from 'traceflow';

export const Default = () => <ForbiddenState />;

export const Specific = () => (
  <ForbiddenState message="Apenas administradores do projeto podem editar o cronograma." />
);

export const InCard = () => (
  <Card title="Auditoria do projeto">
    <ForbiddenState message="Apenas administradores do projeto podem ver a auditoria." />
  </Card>
);
