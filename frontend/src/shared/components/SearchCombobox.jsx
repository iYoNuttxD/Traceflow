import './SearchCombobox.css';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const defaultLabel = (option) => option?.title || option?.name || String(option?.id || '');
const EMPTY_OPTIONS = Object.freeze([]);
const neverDisabled = () => false;

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
  isQueryValid,
  openOnFocus = true,
  getOptionLabel = defaultLabel,
  isOptionDisabled = neverDisabled,
  renderOption,
  onSearch,
  onSelect,
  onClear,
  queryClearLabel = '',
  onQueryClear,
  emptyMessage = 'Nenhum resultado encontrado.',
  loadingMessage = 'Pesquisando...',
  searchErrorMessage = 'Não foi possível concluir a pesquisa.'
}) {
  const generatedId = useId();
  const inputId = id || `search-combobox-${generatedId}`;
  const listboxId = `${inputId}-results`;
  const errorId = `${inputId}-error`;
  const helpId = `${inputId}-help`;
  const requestRef = useRef(0);
  const inputRef = useRef(null);
  const fieldRef = useRef(null);
  const listRef = useRef(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dismissed, setDismissed] = useState(true);
  const [popoverPosition, setPopoverPosition] = useState(null);

  const normalizedOptions = useMemo(() => options || [], [options]);
  const trimmedQuery = query.trim();
  const hasQuery = isQueryValid
    ? isQueryValid(trimmedQuery)
    : trimmedQuery.length >= minQueryLength;
  const expanded = hasQuery && !dismissed && !disabled && !selectedOption;
  const searchEnabled = hasQuery && !selectedOption && !disabled && (openOnFocus || expanded);

  useEffect(() => {
    if (!expanded) return undefined;
    const outside = (event) => {
      if (fieldRef.current?.contains(event.target) || listRef.current?.contains(event.target))
        return;
      setDismissed(true);
      setActiveIndex(-1);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [expanded]);

  useLayoutEffect(() => {
    if (!expanded) {
      setPopoverPosition(null);
      return undefined;
    }

    const place = () => {
      const trigger = inputRef.current;
      const popover = listRef.current;
      if (!trigger || !popover) return;

      const triggerRect = trigger.getBoundingClientRect();
      const rootFontSize =
        Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const gap = rootFontSize * 0.25;
      const viewportGutter = rootFontSize * 0.5;
      const dialogRect = fieldRef.current?.closest('[role="dialog"]')?.getBoundingClientRect();
      const hasDialogBoundary = dialogRect && dialogRect.width > 0 && dialogRect.height > 0;
      const boundaryTop = hasDialogBoundary
        ? Math.max(viewportGutter, dialogRect.top + viewportGutter)
        : viewportGutter;
      const boundaryRight = hasDialogBoundary
        ? Math.min(window.innerWidth - viewportGutter, dialogRect.right - viewportGutter)
        : window.innerWidth - viewportGutter;
      const boundaryBottom = hasDialogBoundary
        ? Math.min(window.innerHeight - viewportGutter, dialogRect.bottom - viewportGutter)
        : window.innerHeight - viewportGutter;
      const boundaryLeft = hasDialogBoundary
        ? Math.max(viewportGutter, dialogRect.left + viewportGutter)
        : viewportGutter;
      const preferredMaxHeight = Math.min(rootFontSize * 18, window.innerHeight * 0.4);
      const contentHeight = Math.min(
        popover.scrollHeight || rootFontSize * 2.75,
        preferredMaxHeight
      );
      const spaceBelow = Math.max(0, boundaryBottom - triggerRect.bottom - gap);
      const spaceAbove = Math.max(0, triggerRect.top - gap - boundaryTop);
      const placement = spaceBelow < contentHeight && spaceAbove > spaceBelow ? 'above' : 'below';
      const availableHeight = placement === 'above' ? spaceAbove : spaceBelow;
      const maxHeight = Math.min(preferredMaxHeight, availableHeight);
      const popoverHeight = Math.min(contentHeight, maxHeight);
      const maxLeft = Math.max(boundaryLeft, boundaryRight - triggerRect.width);
      const left = Math.max(boundaryLeft, Math.min(triggerRect.left, maxLeft));
      const top =
        placement === 'above'
          ? Math.max(boundaryTop, triggerRect.top - gap - popoverHeight)
          : triggerRect.bottom + gap;
      const nextPosition = {
        left,
        top,
        width: triggerRect.width,
        maxHeight,
        placement
      };

      setPopoverPosition((current) =>
        current &&
        current.left === nextPosition.left &&
        current.top === nextPosition.top &&
        current.width === nextPosition.width &&
        current.maxHeight === nextPosition.maxHeight &&
        current.placement === nextPosition.placement
          ? current
          : nextPosition
      );
    };

    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            place();
          });
    observer?.observe(inputRef.current);
    observer?.observe(listRef.current);

    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      observer?.disconnect();
    };
  }, [expanded, loading, results, searchError]);

  useEffect(() => {
    requestRef.current += 1;
    const request = requestRef.current;
    setActiveIndex(-1);
    setSearchError('');

    if (!searchEnabled) {
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
          setSearchError(requestError?.response?.data?.message || searchErrorMessage);
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
    searchEnabled,
    getOptionLabel,
    hasQuery,
    normalizedOptions,
    onSearch,
    searchErrorMessage,
    selectedOption,
    trimmedQuery
  ]);

  useLayoutEffect(() => {
    if (!expanded || activeIndex < 0) return;
    const activeOption = listRef.current?.querySelectorAll('[role="option"]')?.[activeIndex];
    activeOption?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [activeIndex, expanded, listboxId]);

  function choose(option) {
    if (isOptionDisabled(option)) return;
    onSelect(option);
    setQuery('');
    setResults([]);
    setActiveIndex(-1);
    setDismissed(true);
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown' && !expanded && hasQuery) {
      event.preventDefault();
      setDismissed(false);
      return;
    }
    if (event.key === 'Escape' && expanded) {
      event.preventDefault();
      event.stopPropagation();
      setDismissed(true);
      setActiveIndex(-1);
      return;
    }
    if (!expanded || loading || results.length === 0) return;
    const enabledIndexes = results.reduce((indexes, option, index) => {
      if (!isOptionDisabled(option)) indexes.push(index);
      return indexes;
    }, []);
    if (!enabledIndexes.length) return;
    const enabledPosition = enabledIndexes.indexOf(activeIndex);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(enabledIndexes[(enabledPosition + 1) % enabledIndexes.length]);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(
        enabledIndexes[enabledPosition <= 0 ? enabledIndexes.length - 1 : enabledPosition - 1]
      );
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(enabledIndexes[0]);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(enabledIndexes.at(-1));
    } else if (
      event.key === 'Enter' &&
      activeIndex >= 0 &&
      !isOptionDisabled(results[activeIndex])
    ) {
      event.preventDefault();
      choose(results[activeIndex]);
    }
  }

  const resultsList = (
    <ul
      ref={listRef}
      id={listboxId}
      className="sprint-combobox-results"
      role="listbox"
      data-placement={popoverPosition?.placement}
      style={
        popoverPosition
          ? {
              left: popoverPosition.left,
              top: popoverPosition.top,
              width: popoverPosition.width,
              maxHeight: popoverPosition.maxHeight
            }
          : { visibility: 'hidden' }
      }
      onMouseDown={(event) => {
        if (event.target.closest('[role="option"]')) event.preventDefault();
      }}
    >
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
        results.map((option, index) => {
          const optionDisabled = isOptionDisabled(option);
          return (
            <li
              id={`${listboxId}-option-${index}`}
              className={[
                index === activeIndex ? 'sprint-combobox-option--active' : '',
                optionDisabled ? 'sprint-combobox-option--disabled' : ''
              ]
                .filter(Boolean)
                .join(' ')}
              key={option.id}
              role="option"
              aria-selected={!optionDisabled && index === activeIndex}
              aria-disabled={optionDisabled || undefined}
              onClick={() => choose(option)}
              onMouseEnter={() => {
                if (!optionDisabled) setActiveIndex(index);
              }}
            >
              {renderOption ? renderOption(option) : getOptionLabel(option)}
            </li>
          );
        })
      )}
    </ul>
  );

  const describedBy = [error && errorId, help && helpId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="sprint-combobox-field" ref={fieldRef}>
      <label htmlFor={inputId}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>

      {selectedOption && (
        <div className="sprint-combobox-selection" id={inputId} role="group" aria-label={label}>
          <span>{getOptionLabel(selectedOption)}</span>
          {!disabled && (
            <button
              type="button"
              onClick={() => {
                onClear?.();
                setQuery('');
                setDismissed(true);
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
            ref={inputRef}
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
            onClick={() => setDismissed(false)}
            onBlur={() => {
              setDismissed(true);
            }}
            onKeyDown={handleKeyDown}
          />

          {queryClearLabel && query && (
            <button
              type="button"
              className="sprint-combobox-query-clear"
              aria-label={queryClearLabel}
              title={queryClearLabel}
              onClick={() => {
                requestRef.current += 1;
                setQuery('');
                setResults([]);
                setActiveIndex(-1);
                setDismissed(true);
                onQueryClear?.();
                inputRef.current?.focus();
              }}
            >
              ×
            </button>
          )}

          {expanded &&
            createPortal(
              resultsList,
              fieldRef.current?.closest('[role="dialog"]') || document.body
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
