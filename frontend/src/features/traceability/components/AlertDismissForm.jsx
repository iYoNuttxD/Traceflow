import { useId, useState } from 'react';
import {
  DISMISS_REASON_MAX,
  DISMISS_REASON_MIN,
  dismissReasonLength,
  validateDismissReason
} from '../model/alert-view.js';

export function AlertDismissForm({ busy, onSubmit, onCancel }) {
  const id = useId();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const length = dismissReasonLength(reason);
  function submit(event) {
    event.preventDefault();
    const message = validateDismissReason(reason);
    setError(message);
    if (!message) onSubmit(reason.trim());
  }
  return (
    <form className="trace-alert-form" onSubmit={submit} noValidate>
      <p className="field-help">
        Dispensar mantém o alerta registrado e impede que ele volte enquanto a inconsistência
        continuar. Se ela for corrigida, o alerta é resolvido automaticamente.
      </p>
      <label className="field" htmlFor={`${id}-reason`}>
        <span>Justificativa</span>
        <textarea
          id={`${id}-reason`}
          rows={4}
          value={reason}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={`${id}-count${error ? ` ${id}-error` : ''}`}
          onChange={(event) => {
            setReason(event.target.value);
            if (error) setError('');
          }}
          disabled={busy}
        />
      </label>
      <small id={`${id}-count`} className="field-help">
        {length} de {DISMISS_REASON_MAX} caracteres · mínimo {DISMISS_REASON_MIN}
      </small>
      {error && (
        <small id={`${id}-error`} className="field-error" role="alert">
          {error}
        </small>
      )}
      <div className="trace-alert-actions">
        <button
          type="button"
          className="button button-secondary"
          onClick={onCancel}
          disabled={busy}
        >
          Voltar
        </button>
        <button
          type="submit"
          className="button button-primary"
          disabled={busy}
          aria-busy={busy || undefined}
        >
          Dispensar alerta
        </button>
      </div>
    </form>
  );
}
