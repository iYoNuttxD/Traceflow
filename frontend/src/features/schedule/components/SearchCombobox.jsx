import { useEffect, useId, useMemo, useRef, useState } from 'react';

const defaultLabel = (option) => option?.title || option?.name || String(option?.id || '');
const EMPTY_OPTIONS = Object.freeze([]);

export function SearchCombobox({
  id,
  label,
  placeholder,
  options = EMPTY_OPTIONS,
  selectedOption = null,
  disabled = false,
  required = false,
  error = '',
  help = '',
  minQueryLength = 2,
  getOptionLabel = defaultLabel,
  renderOption,
  onSearch,
  onSelect,
  onClear,
  emptyMessage = 'Nenhum resultado encontrado.',
  loadingMessage = 'Pesquisando...'
}) {
  const generatedId = useId();
  const inputId = id || `search-combobox-${generatedId}`;
  const listboxId = `${inputId}-results`;
  const errorId = `${inputId}-error`;
  const helpId = `${inputId}-help`;
  const requestRef = useRef(0);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dismissed, setDismissed] = useState(false);

  const normalizedOptions = useMemo(() => options || [], [options]);
  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length >= minQueryLength;
  const expanded = hasQuery && !dismissed && !disabled && !selectedOption;

  useEffect(() => {
    requestRef.current += 1;
    const request = requestRef.current;
    setActiveIndex(-1);
    setSearchError('');

    if (!hasQuery || selectedOption || disabled) {
      setLoading(false);
      setResults([]);
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);
    const timeoutId = window.setTimeout(
      async () => {
        try {
          const found = onSearch
            ? await onSearch(trimmedQuery, controller.signal)
            : normalizedOptions.filter((option) =>
                getOptionLabel(option)
                  .toLocaleLowerCase('pt-BR')
                  .includes(trimmedQuery.toLocaleLowerCase('pt-BR'))
              );
          if (request !== requestRef.current || controller.signal.aborted) return;
          setResults(found || []);
        } catch (requestError) {
          if (controller.signal.aborted || request !== requestRef.current) return;
          setResults([]);
          setSearchError(
            requestError?.response?.data?.message || 'Não foi possível concluir a pesquisa.'
          );
        } finally {
          if (request === requestRef.current && !controller.signal.aborted) setLoading(false);
        }
      },
      onSearch ? 300 : 0
    );

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [
    disabled,
    getOptionLabel,
    hasQuery,
    normalizedOptions,
    onSearch,
    selectedOption,
    trimmedQuery
  ]);

  function choose(option) {
    onSelect(option);
    setQuery('');
    setResults([]);
    setActiveIndex(-1);
    setDismissed(false);
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape' && expanded) {
      event.preventDefault();
      setDismissed(true);
      setActiveIndex(-1);
      return;
    }
    if (!expanded || loading || results.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? results.length - 1 : current - 1));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(results.length - 1);
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      choose(results[activeIndex]);
    }
  }

  const describedBy = [error && errorId, help && helpId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="sprint-combobox-field">
      <label htmlFor={inputId}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>

      {selectedOption && (
        <div className="sprint-combobox-selection">
          <span>{getOptionLabel(selectedOption)}</span>
          {!disabled && (
            <button
              type="button"
              onClick={() => {
                onClear?.();
                setQuery('');
              }}
              aria-label={`Remover ${getOptionLabel(selectedOption)}`}
              title="Remover seleção"
            >
              ×
            </button>
          )}
        </div>
      )}

      {!selectedOption && (
        <div className="sprint-combobox">
          <input
            id={inputId}
            type="search"
            role="combobox"
            value={query}
            disabled={disabled}
            placeholder={placeholder}
            autoComplete="off"
            aria-autocomplete="list"
            aria-required={required || undefined}
            aria-expanded={expanded}
            aria-controls={listboxId}
            aria-activedescendant={
              expanded && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
            }
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={describedBy}
            onChange={(event) => {
              setQuery(event.target.value);
              setDismissed(false);
            }}
            onKeyDown={handleKeyDown}
          />

          {expanded && (
            <ul id={listboxId} className="sprint-combobox-results" role="listbox">
              {loading ? (
                <li className="sprint-combobox-state" role="status">
                  {loadingMessage}
                </li>
              ) : searchError ? (
                <li className="sprint-combobox-state sprint-combobox-state--error" role="alert">
                  {searchError}
                </li>
              ) : results.length === 0 ? (
                <li className="sprint-combobox-state" role="status">
                  {emptyMessage}
                </li>
              ) : (
                results.map((option, index) => (
                  <li
                    id={`${listboxId}-option-${index}`}
                    className={index === activeIndex ? 'sprint-combobox-option--active' : ''}
                    key={option.id}
                    role="option"
                    aria-selected={index === activeIndex}
                    onClick={() => choose(option)}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    {renderOption ? renderOption(option) : getOptionLabel(option)}
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}

      {help && (
        <p className="field-help" id={helpId}>
          {help}
        </p>
      )}
      {error && (
        <p className="field-error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
