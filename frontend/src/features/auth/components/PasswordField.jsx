import { useId, useState } from 'react';
import { TraceFlowIcon } from '../../../shared/index.js';
import './PasswordField.css';

const COMMON_PASSWORDS = new Set([
  '123456789012',
  '1234567890',
  'password1234',
  'password123',
  'qwerty123456',
  'qwertyuiop12',
  'administrator',
  'iloveyou1234',
  'welcome12345',
  'letmein123456',
  'senha123456',
  'senha12345678',
  'traceflow123',
  'abc123456789',
  '000000000000'
]);

export function passwordStrength(password) {
  if (!password) return { score: 0, label: 'Não avaliada' };
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

export function passwordRequirementStates(password, { username = '', email = '' } = {}) {
  if (!password) return { length: 'neutral', policy: 'neutral' };
  const normalizedPassword = password.toLocaleLowerCase('pt-BR');
  const normalizedUsername = String(username).trim().toLocaleLowerCase('pt-BR');
  const normalizedEmail = String(email).trim().toLocaleLowerCase('pt-BR');
  const emailLocalPart = normalizedEmail.split('@')[0];
  const violatesAccountPolicy =
    COMMON_PASSWORDS.has(normalizedPassword) ||
    (normalizedUsername && normalizedPassword === normalizedUsername) ||
    (normalizedEmail && normalizedPassword === normalizedEmail) ||
    (normalizedUsername.length >= 3 && normalizedPassword.includes(normalizedUsername)) ||
    (emailLocalPart.length >= 3 && normalizedPassword.includes(emailLocalPart));
  return {
    length: password.length >= 12 && password.length <= 128 ? 'met' : 'unmet',
    policy: violatesAccountPolicy ? 'unmet' : 'met'
  };
}

function Requirement({ status, children }) {
  const copy = {
    met: ['✓', 'Atendido'],
    unmet: ['!', 'Não atendido'],
    neutral: ['○', 'Pendente'],
    info: ['i', 'Permitido']
  }[status];
  return (
    <li className="password-rule" data-status={status}>
      <span className="password-rule-icon" aria-hidden="true">
        {copy[0]}
      </span>
      <span>
        <strong>{copy[1]}</strong> — {children}
      </span>
    </li>
  );
}

export function PasswordField({
  id,
  label = 'Senha',
  value,
  onChange,
  error,
  autoComplete = 'new-password',
  showRequirements = false,
  showConfirmationStatus = false,
  confirmationValue = '',
  policyContext,
  disabled = false,
  required = true,
  minLength
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const [visible, setVisible] = useState(false);
  const strength = passwordStrength(value);
  const requirements = passwordRequirementStates(value, policyContext);
  const confirmationStatus = !value ? 'neutral' : value === confirmationValue ? 'met' : 'unmet';
  const descriptionIds =
    [
      error ? `${inputId}-error` : null,
      showRequirements ? `${inputId}-requirements` : null,
      showConfirmationStatus && !error ? `${inputId}-confirmation-status` : null
    ]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <div className="form-field password-field">
      <label htmlFor={inputId}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <div className="password-control">
        <input
          id={inputId}
          name={inputId}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          required={required}
          aria-required={required || undefined}
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
          title={visible ? 'Ocultar senha' : 'Mostrar senha'}
        >
          <TraceFlowIcon name={visible ? 'eyeOff' : 'eye'} />
        </button>
      </div>
      {error && (
        <span id={`${inputId}-error`} className="field-error" role="alert">
          {error}
        </span>
      )}
      {showRequirements && (
        <div id={`${inputId}-requirements`} className="password-requirements" aria-live="polite">
          <div className="password-strength-copy">
            <strong>Força da senha</strong>
            <span>{strength.label}</span>
          </div>
          <progress
            className="password-strength"
            max="5"
            value={strength.score}
            aria-label={`Força da senha: ${strength.label}`}
          />
          <ul className="password-requirement-list">
            <Requirement status={requirements.length}>Entre 12 e 128 caracteres</Requirement>
            <Requirement status={requirements.policy}>
              Evite senhas comuns e dados da conta
            </Requirement>
            <Requirement status="info">Espaços, Unicode e colagem</Requirement>
          </ul>
        </div>
      )}
      {showConfirmationStatus && (
        <p
          id={`${inputId}-confirmation-status`}
          className="password-confirmation-status"
          data-status={confirmationStatus}
          role="status"
        >
          {confirmationStatus === 'neutral'
            ? '○ Confirmação ainda não preenchida.'
            : confirmationStatus === 'met'
              ? '✓ As senhas coincidem.'
              : '! As senhas não coincidem.'}
        </p>
      )}
    </div>
  );
}
