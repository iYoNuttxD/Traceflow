import { useEffect, useId, useRef } from 'react';
import { TraceFlowIcon } from './TraceFlowIcon.jsx';
import './StatusSurface.css';

export function StatusSurface({
  title,
  description,
  icon = 'info',
  tone = 'info',
  role,
  actions,
  children,
  focusKey = title
}) {
  const titleId = useId();
  const titleRef = useRef(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, [focusKey]);

  return (
    <section
      className={`status-surface status-surface--${tone}`}
      aria-labelledby={titleId}
      role={role}
    >
      <span className="status-surface__icon" aria-hidden="true">
        <TraceFlowIcon name={icon} />
      </span>
      <h1 id={titleId} ref={titleRef} tabIndex="-1">
        {title}
      </h1>
      {description && <p className="status-surface__description">{description}</p>}
      {children}
      {actions && <div className="status-surface__actions">{actions}</div>}
    </section>
  );
}
