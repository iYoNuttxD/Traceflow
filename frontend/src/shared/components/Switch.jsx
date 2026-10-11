import { useId } from 'react';
import './Switch.css';

export function Switch({ label, description, checked, disabled, onChange, describedBy }) {
  const id = useId();
  return (
    <label className="switch-control">
      <span className="switch-control__copy">
        <span id={id}>{label}</span>
        {description && (
          <span id={`${id}-description`} className="switch-control__description">
            {description}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-labelledby={id}
        aria-describedby={
          [describedBy, description ? `${id}-description` : null].filter(Boolean).join(' ') ||
          undefined
        }
      />
      <span className="switch-control__track" aria-hidden="true">
        <span />
      </span>
    </label>
  );
}
