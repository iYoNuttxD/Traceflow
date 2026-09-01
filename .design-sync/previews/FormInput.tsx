// Every cell wraps FormInput in <form className="schedule-form">: in this design
// system the field's styling lives entirely under that ancestor selector
// (global.css .schedule-form .form-field ...). Outside it the input falls back
// to browser defaults — see FormInput.md.
import { Card, FormInput } from 'traceflow';

export const Default = () => (
  <form className="schedule-form">
    <FormInput label="Nome" name="sprint-name" defaultValue="Sprint 4 — Rastreabilidade" />
  </form>
);

export const Required = () => (
  <form className="schedule-form">
    <FormInput label="Título" name="milestone-title" required defaultValue="Entrega da fase 8" />
  </form>
);

export const WithError = () => (
  <form className="schedule-form">
    <FormInput
      label="Data prevista"
      name="milestone-dueDate"
      type="datetime-local"
      required
      defaultValue=""
      error="Informe uma data igual ou posterior ao início da sprint."
    />
  </form>
);

export const Disabled = () => (
  <form className="schedule-form">
    <FormInput
      label="Repositório"
      name="project-repository"
      defaultValue="JoaoVitorSHernandes/traceflow"
      disabled
    />
  </form>
);

export const InAForm = () => (
  <Card title="Cadastrar sprint">
    <form className="schedule-form" onSubmit={(event) => event.preventDefault()} noValidate>
      <FormInput label="Nome" name="sprint-name" required defaultValue="Sprint 5" />
      <FormInput
        label="Início"
        name="sprint-startDate"
        type="datetime-local"
        required
        defaultValue="2026-09-01T09:00"
      />
      <FormInput
        label="Fim"
        name="sprint-endDate"
        type="datetime-local"
        required
        defaultValue="2026-09-15T18:00"
        error="O fim deve ser posterior ao início."
      />
      <div className="dialog-actions">
        <button type="button" className="button button-secondary">
          Cancelar
        </button>
        <button type="submit" className="button">
          Salvar sprint
        </button>
      </div>
    </form>
  </Card>
);
