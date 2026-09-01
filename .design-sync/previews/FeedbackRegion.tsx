import { Card, FeedbackRegion } from 'traceflow';

export const Success = () => <FeedbackRegion success="Projeto cadastrado com sucesso." />;

export const Error = () => (
  <FeedbackRegion error="Não foi possível salvar a sprint. Tente novamente." />
);

export const AboveAForm = () => (
  <Card title="Cadastrar sprint">
    <FeedbackRegion error="A data de fim deve ser posterior à data de início." />
    <form className="schedule-form">
      <div className="form-field">
        <label htmlFor="feedback-demo-name">Nome</label>
        <input id="feedback-demo-name" defaultValue="Sprint 5" />
      </div>
    </form>
  </Card>
);
