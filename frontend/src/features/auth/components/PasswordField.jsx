import { useId, useState } from 'react';

export function passwordStrength(password) {
  let score = 0;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (/\p{L}/u.test(password) && /\p{N}/u.test(password)) score += 1;
  if (/[^\p{L}\p{N}]/u.test(password)) score += 1;
  if (new Set(password).size >= 10) score += 1;
  return {
    score,
    label: ['Muito fraca', 'Fraca', 'Razoável', 'Forte', 'Muito forte'][
      Math.min(Math.max(score - 1, 0), 4)
    ]
  };
}

export function PasswordField({
  id,
  label = 'Senha',
  value,
  onChange,
  error,
  autoComplete = 'new-password',
  showRequirements = false,
  disabled = false,
  required = true,
  minLength
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const [visible, setVisible] = useState(false);
  const strength = passwordStrength(value);
  const descriptionIds =
    [error ? `${inputId}-error` : null, showRequirements ? `${inputId}-requirements` : null]
      .filter(Boolean)
      .join(' ') || undefined;
  return (
    <div className="form-field password-field">
      <label htmlFor={inputId}>
        {label}
        <span aria-hidden="true"> *</span>
      </label>
      <div className="password-control">
        <input
          id={inputId}
          name={inputId}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          required={required}
          disabled={disabled}
          minLength={minLength}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          aria-describedby={descriptionIds}
        />
        <button
          className="password-toggle"
          type="button"
          disabled={disabled}
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
        >
          {visible ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
      {error && (
        <span id={`${inputId}-error`} className="field-error" role="alert">
          {error}
        </span>
      )}
      {showRequirements && (
        <div id={`${inputId}-requirements`} className="password-requirements">
          <progress
            className="password-strength"
            max="5"
            value={Math.max(strength.score, 1)}
            aria-label={`Força da senha: ${strength.label}`}
          />
          <p>
            Força informativa: <strong>{strength.label}</strong>
          </p>
          <ul>
            <li data-met={value.length >= 12}>Entre 12 e 128 caracteres</li>
            <li>Evite senhas comuns e dados da conta</li>
            <li>Espaços, Unicode e colagem são permitidos</li>
          </ul>
        </div>
      )}
    </div>
  );
}
