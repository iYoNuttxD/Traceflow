import { useId, useRef, useState } from 'react';
import { TraceFlowIcon } from '../../../shared/index.js';
import './CollapsibleFilterPanel.css';
import { FilterActions } from './FilterActions.jsx';

function activeLabel(total) {
  if (!total) return '0 ativos';
  return `${total} ${total === 1 ? 'filtro ativo' : 'filtros ativos'}`;
}

export function CollapsibleFilterPanel({
  id,
  title = 'Buscar e filtrar',
  resultLabel,
  activeCount = 0,
  onClear,
  canClear = activeCount > 0,
  clearDisabled = false,
  className = '',
  actions,
  compact = false,
  controlsOnly = false,
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
      className={['planning-filter-panel', compact && 'planning-filter-panel--compact', className]
        .filter(Boolean)
        .join(' ')}
      aria-labelledby={controlsOnly ? undefined : titleId}
    >
      <button
        hidden={controlsOnly}
        ref={toggleRef}
        type="button"
        className="planning-filter-panel__toggle"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={toggle}
      >
        <span className="planning-filter-panel__title">
          <strong id={titleId}>{title}</strong>
          {!compact && <small aria-live="polite">{resultLabel}</small>}
        </span>
        <span className="planning-filter-panel__state">
          <span className={compact && !activeCount ? 'sr-only' : undefined}>
            {activeLabel(activeCount)}
          </span>
          <TraceFlowIcon name="arrowRight" />
        </span>
      </button>

      {actions}
      <div className="planning-filter-panel__body" id={panelId} hidden={!expanded || controlsOnly}>
        {expanded && !controlsOnly && (
          <>
            {compact && (
              <p className="planning-filter-panel__summary" aria-live="polite">
                {resultLabel}
              </p>
            )}
            {children}
            <FilterActions onClear={onClear} canClear={canClear} disabled={clearDisabled} />
          </>
        )}
      </div>
    </section>
  );
}
