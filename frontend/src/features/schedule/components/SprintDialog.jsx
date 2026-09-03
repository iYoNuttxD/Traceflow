import { useEffect, useId, useRef } from 'react';
import { TraceFlowIcon } from '../../../shared/index.js';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

export function SprintDialog({
  open,
  title,
  description,
  size = 'default',
  initialFocusSelector,
  returnFocusRef,
  busy = false,
  onClose,
  children
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    if (!open) return undefined;
    const returnTarget = returnFocusRef?.current || document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => {
      if (
        panelRef.current?.contains(document.activeElement) &&
        document.activeElement !== panelRef.current
      ) {
        return;
      }
      const target = initialFocusSelector
        ? panelRef.current?.querySelector(initialFocusSelector)
        : panelRef.current?.querySelector(focusableSelector);
      target?.focus();
    });

    function handleKeyDown(event) {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') {
        if (busyRef.current) return;
        event.preventDefault();
        onClose();
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
  }, [initialFocusSelector, onClose, open, returnFocusRef]);

  if (!open) return null;

  return (
    <div
      className="sprint-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (!busy && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={panelRef}
        className={`sprint-dialog sprint-dialog--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <header className="sprint-dialog__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <button
            type="button"
            className="sprint-dialog__close"
            disabled={busy}
            onClick={onClose}
            aria-label={`Fechar ${title.toLocaleLowerCase('pt-BR')}`}
            title="Fechar"
          >
            <TraceFlowIcon name="close" />
          </button>
        </header>
        <div className="sprint-dialog__body">{children}</div>
      </section>
    </div>
  );
}
