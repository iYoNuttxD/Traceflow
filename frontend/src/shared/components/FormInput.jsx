// Campo de formulario reutilizavel.
// TODO: Adicionar exibicao padronizada de erros de validacao.
export function FormInput({ label, error, required, id: providedId, ...inputProps }) {
  const id = providedId || inputProps.name;
  const errorId = error && id ? `${id}-error` : undefined;
  return (
    <div className="form-field">
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <input
        {...inputProps}
        id={id}
        required={required}
        aria-required={required || undefined}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId}
      />
      {error && (
        <span id={errorId} className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
