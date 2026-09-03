import { useId, useRef, useState } from 'react';
import { TraceFlowIcon } from '../../../shared/index.js';
import './CollapsibleFilterPanel.css';

function activeLabel(total) {
  if (!total) return '0 ativos';
  return `${total} ${total === 1 ? 'filtro ativo' : 'filtros ativos'}`;
}

export function CollapsibleFilterPanel({
  id,
  title = 'Buscar e filtrar',
  resultLabel,
  activeCount = 0,
  className = '',
  children
}) {
  const generatedId = useId();
  const panelId = id || `planning-filter-panel-${generatedId}`;
  const titleId = `${panelId}-title`;
  const toggleRef = useRef(null);
  const [expanded, setExpanded] = useState(false);

  function toggle() {
    setExpanded((current) => {
      if (current) queueMicrotask(() => toggleRef.current?.focus());
      return !current;
    });
  }

  return (
    <section
      className={['planning-filter-panel', className].filter(Boolean).join(' ')}
      aria-labelledby={titleId}
    >
      <button
        ref={toggleRef}
        type="button"
        className="planning-filter-panel__toggle"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={toggle}
      >
        <span className="planning-filter-panel__title">
          <strong id={titleId}>{title}</strong>
          <small aria-live="polite">{resultLabel}</small>
        </span>
        <span className="planning-filter-panel__state">
          <span>{activeLabel(activeCount)}</span>
          <TraceFlowIcon name="arrowRight" />
        </span>
      </button>

      <div className="planning-filter-panel__body" id={panelId} hidden={!expanded}>
        {expanded ? children : null}
      </div>
    </section>
  );
}
