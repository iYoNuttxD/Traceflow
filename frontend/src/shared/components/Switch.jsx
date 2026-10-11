import './Switch.css';

export function Switch({ label, checked, disabled, onChange, describedBy }) {
  return (
    <label className="switch-control">
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-describedby={describedBy}
      />
      <span className="switch-control__track" aria-hidden="true">
        <span />
      </span>
    </label>
  );
}
