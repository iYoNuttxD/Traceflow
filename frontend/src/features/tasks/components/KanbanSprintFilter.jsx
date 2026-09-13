import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { TraceFlowIcon } from '../../../shared/index.js';
import './KanbanSprintFilter.css';

const VISIBLE_LIMIT = 8;

export function KanbanSprintFilter({ sprints, selectedIds, statusLabels = {}, onToggle, onClear }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const searchRef = useRef(null);
  const popoverRef = useRef(null);
  const [position, setPosition] = useState(null);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      const popover = popoverRef.current;
      if (!trigger || !popover) return;
      const gutter = parseFloat(getComputedStyle(popover).paddingLeft) || 0;
      setPosition({
        left: Math.max(
          gutter,
          Math.min(
            trigger.right - popover.offsetWidth,
            window.innerWidth - popover.offsetWidth - gutter
          )
        ),
        top: Math.max(
          gutter,
          Math.min(trigger.bottom + gutter, window.innerHeight - popover.offsetHeight - gutter)
        )
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, query, sprints.length]);

  useEffect(() => {
    if (!open) return undefined;
    window.requestAnimationFrame(() => {
      (sprints.length > VISIBLE_LIMIT
        ? searchRef.current
        : popoverRef.current?.querySelector('input')
      )?.focus();
    });
    const close = (restoreFocus) => {
      setOpen(false);
      setQuery('');
      if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
    };
    const handlePointerDown = (event) => {
      if (
        !containerRef.current?.contains(event.target) &&
        !popoverRef.current?.contains(event.target)
      )
        close(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(true);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, sprints.length]);

  const selected = sprints.filter((sprint) => selectedIds.includes(sprint.id));
  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
  const matches = useMemo(
    () =>
      sprints.filter((sprint) => sprint.name.toLocaleLowerCase('pt-BR').includes(normalizedQuery)),
    [normalizedQuery, sprints]
  );
  const visibleSprints = normalizedQuery ? matches : matches.slice(0, VISIBLE_LIMIT);
  const selectionLabel =
    selected.length === 0
      ? 'Projeto inteiro'
      : selected.length === 1
        ? selected[0].name
        : `${selected.length} Sprints`;

  return (
    <div className="kanban-sprint-filter" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="kanban-sprint-filter__trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={sprints.length === 0}
        onClick={() => setOpen((current) => !current)}
      >
        <strong>{selectionLabel}</strong>
        <span>{sprints.length === 0 ? 'Sem Sprints cadastradas' : 'Alterar recorte'}</span>
        <TraceFlowIcon name="arrowRight" />
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            style={position || { visibility: 'hidden' }}
            className="kanban-sprint-filter__popover"
            role="dialog"
            aria-label="Selecionar Sprints"
          >
            <div className="kanban-sprint-filter__header">
              <strong>Sprints no quadro</strong>
            </div>
            {sprints.length > VISIBLE_LIMIT && (
              <label className="kanban-sprint-filter__search">
                <span className="sr-only">Pesquisar Sprint</span>
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  placeholder="Pesquisar sprint..."
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            )}
            <ul className="kanban-sprint-filter__options">
              <li>
                <label>
                  <input type="checkbox" checked={selected.length === 0} onChange={onClear} />
                  <span>
                    <strong>Projeto inteiro</strong>
                    <small>Todas as tarefas do projeto</small>
                  </span>
                </label>
              </li>
              {visibleSprints.map((sprint) => (
                <li key={sprint.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(sprint.id)}
                      onChange={() => onToggle(sprint.id)}
                    />
                    <span>
                      <strong>{sprint.name}</strong>
                      <small>{statusLabels[sprint.id]}</small>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {visibleSprints.length === 0 && normalizedQuery ? (
              <p className="kanban-sprint-filter__empty">Nenhuma Sprint encontrada.</p>
            ) : null}
            {!normalizedQuery && sprints.length > VISIBLE_LIMIT && (
              <p className="kanban-sprint-filter__hint">
                Pesquise para encontrar outras {sprints.length - VISIBLE_LIMIT} Sprints.
              </p>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
