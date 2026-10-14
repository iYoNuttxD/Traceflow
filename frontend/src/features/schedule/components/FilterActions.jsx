import './FilterActions.css';

/** Shared footer for automatic filters and explicit-submit filter forms. */
export function FilterActions({ onClear, canClear, disabled = false, applyLabel }) {
  if (!canClear && !applyLabel) return null;
  return (
    <div className="filter-actions">
      {canClear && (
        <button
          type="button"
          className="filter-actions__clear"
          onClick={onClear}
          disabled={disabled}
        >
          Limpar filtros
        </button>
      )}
      {applyLabel && (
        <button type="submit" className="button button-primary button-compact" disabled={disabled}>
          {applyLabel}
        </button>
      )}
    </div>
  );
}
