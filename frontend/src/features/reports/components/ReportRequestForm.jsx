import { useState } from 'react';
import { FormInput } from '../../../shared/index.js';
import { dashboardTimeZone } from '../../indicators/index.js';

// Mesmo teto do painel: o relatório lê todas as visões com o mesmo recorte.
const MAX_PERIOD_DAYS = 366;

export function validateReportRequest({ startDate, endDate }) {
  const errors = {};
  if (Boolean(startDate) !== Boolean(endDate)) {
    errors[startDate ? 'endDate' : 'startDate'] = 'Informe as duas datas ou deixe ambas vazias.';
    return errors;
  }
  if (startDate && startDate > endDate) {
    errors.endDate = 'A data final deve ser igual ou posterior à inicial.';
    return errors;
  }
  if (startDate) {
    const days = (Date.parse(endDate) - Date.parse(startDate)) / 86400000 + 1;
    if (days > MAX_PERIOD_DAYS)
      errors.endDate = `O período deve ter no máximo ${MAX_PERIOD_DAYS} dias.`;
  }
  return errors;
}

export function buildReportRequest({ startDate, endDate, sprintId }) {
  return {
    ...(startDate ? { startDate, endDate, timeZone: dashboardTimeZone() } : {}),
    ...(sprintId ? { sprintId: Number(sprintId) } : {})
  };
}

export function ReportRequestForm({ sprints, submitting, serverErrors = {}, onSubmit, onCancel }) {
  const [form, setForm] = useState({ startDate: '', endDate: '', sprintId: '' });
  const [errors, setErrors] = useState({});
  const visibleErrors = { ...serverErrors, ...errors };
  const change = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };
  function submit(event) {
    event.preventDefault();
    const found = validateReportRequest(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    onSubmit(buildReportRequest(form));
  }
  return (
    <form className="schedule-form report-request-form" onSubmit={submit} noValidate>
      <div className="report-request-form__fields">
        <FormInput
          label="Data inicial"
          name="report-startDate"
          type="date"
          value={form.startDate}
          error={visibleErrors.startDate}
          onChange={change('startDate')}
        />
        <FormInput
          label="Data final"
          name="report-endDate"
          type="date"
          value={form.endDate}
          error={visibleErrors.endDate}
          onChange={change('endDate')}
        />
        <div className="form-field">
          <label htmlFor="report-sprintId">Sprint</label>
          <select
            id="report-sprintId"
            name="report-sprintId"
            value={form.sprintId}
            onChange={change('sprintId')}
          >
            <option value="">Todas as Sprints do recorte</option>
            {sprints.map((sprint) => (
              <option key={sprint.id} value={sprint.id}>
                {sprint.name}
              </option>
            ))}
          </select>
          {visibleErrors.sprintId && (
            <span className="field-error" role="alert">
              {visibleErrors.sprintId}
            </span>
          )}
        </div>
      </div>
      <p className="field-help">
        Sem datas, o relatório considera todo o histórico. O período tem no máximo {MAX_PERIOD_DAYS}{' '}
        dias, como no painel de Indicadores. A rastreabilidade mostra sempre a situação atual dos
        requisitos. A geração acontece em segundo plano.
      </p>
      <div className="form-actions">
        <button
          className="button button-secondary"
          type="button"
          disabled={submitting}
          onClick={onCancel}
        >
          Cancelar
        </button>
        <button
          className="button button-primary"
          type="submit"
          disabled={submitting}
          aria-busy={submitting}
        >
          {submitting ? 'Solicitando...' : 'Gerar relatório'}
        </button>
      </div>
    </form>
  );
}
