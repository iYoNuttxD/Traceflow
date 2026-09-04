import { useEffect, useId, useRef } from 'react';
import { TraceFlowIcon } from '../../../shared/index.js';
import './KanbanDialog.css';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

export function KanbanDialog({
  title,
  description,
  size = 'default',
  returnFocusRef,
  onClose,
  headerActions,
  children
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const returnTarget = returnFocusRef?.current || document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.querySelector('[data-dialog-close]')?.focus();
    });

    function handleKeyDown(event) {
      if (event.defaultPrevented) return;
      if (!panelRef.current?.contains(event.target)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll(focusableSelector)].filter(
        (element) => !element.hasAttribute('hidden')
      );
      if (!focusable.length) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      queueMicrotask(() => {
        if (returnTarget?.isConnected) returnTarget.focus();
      });
    };
  }, [returnFocusRef]);

  return (
    <div
      className="kanban-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={panelRef}
        className={`kanban-dialog kanban-dialog--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <header className="kanban-dialog__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <div className="kanban-dialog__controls">
            {headerActions}
            <button
              type="button"
              className="kanban-dialog__close"
              data-dialog-close
              onClick={onClose}
              aria-label={`Fechar ${title.toLocaleLowerCase('pt-BR')}`}
              title="Fechar"
            >
              <TraceFlowIcon name="close" />
            </button>
          </div>
        </header>
        <div className="kanban-dialog__body">{children}</div>
      </section>
    </div>
  );
}
