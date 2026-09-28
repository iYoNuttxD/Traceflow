import { useId, useLayoutEffect, useRef, useState } from 'react';
import { TraceFlowIcon } from '../../../shared/index.js';
import { createPortal } from 'react-dom';

/** Feature-owned help: viewport anchored, outside layout/overflow containers. */
export function DashboardHelp({ title, children }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  const panel = useRef(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!open) return;
    const content = panel.current;
    const button = trigger.current;
    function position() {
      const rect = button.getBoundingClientRect();
      const margin = 16;
      const gap = 8;
      const width = Math.min(400, window.innerWidth - margin * 2);
      content.style.width = `${width}px`;
      content.style.maxHeight = `${Math.min(512, window.innerHeight - margin * 2)}px`;
      const height = content.getBoundingClientRect().height;
      const below = rect.bottom + gap;
      const top = below + height <= window.innerHeight - margin ? below : rect.top - gap - height;
      content.style.left = `${Math.max(margin, Math.min(rect.right - width, window.innerWidth - margin - width))}px`;
      content.style.top = `${Math.max(margin, Math.min(top, window.innerHeight - margin - height))}px`;
    }
    function dismiss(event) {
      if (event.type === 'keydown') {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        setOpen(false);
        button.focus({ preventScroll: true });
      } else if (!content.contains(event.target) && !button.contains(event.target)) {
        setOpen(false);
      }
    }
    position();
    content.focus({ preventScroll: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(position);
    observer?.observe(content);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    document.addEventListener('keydown', dismiss);
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('focusin', dismiss);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      document.removeEventListener('keydown', dismiss);
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('focusin', dismiss);
    };
  }, [open]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="dashboard-help__trigger"
        aria-label={`Informações sobre ${title}`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">?</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="dialog"
            aria-label={`Informações sobre ${title}`}
            tabIndex={-1}
            className="dashboard-help__content"
          >
            <div className="dashboard-help__heading">
              <strong>{title}</strong>
              <button
                type="button"
                aria-label="Fechar informações"
                onClick={() => {
                  setOpen(false);
                  trigger.current?.focus({ preventScroll: true });
                }}
              >
                <TraceFlowIcon name="close" />
              </button>
            </div>
            {children}
          </div>,
          document.body
        )}
    </>
  );
}
