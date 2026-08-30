import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { BackButton, TraceFlowIcon } from '../../../shared/index.js';
import './NewProjectDialog.css';

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

export function NewProjectDialog({
  open,
  initialView = 'choose',
  onClose,
  createContent,
  joinContent
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef(null);
  const triggerRef = useRef(null);
  const contentRef = useRef(null);
  const createChoiceRef = useRef(null);
  const joinChoiceRef = useRef(null);
  const pendingFocusRef = useRef(null);
  const initialFocusFrameRef = useRef(null);
  const [view, setView] = useState(initialView);

  useLayoutEffect(() => {
    if (!open || !pendingFocusRef.current) return;

    const focusRequest = pendingFocusRef.current;
    let target = null;

    if (view === 'choose') {
      target = focusRequest === 'create' ? createChoiceRef.current : joinChoiceRef.current;
    } else if (focusRequest === view) {
      target = contentRef.current?.querySelector(focusableSelector);
    }

    if (!target) return;
    target.focus();
    pendingFocusRef.current = null;
  }, [open, view]);

  useEffect(() => {
    if (!open) return undefined;
    triggerRef.current = document.activeElement;
    setView(initialView);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    initialFocusFrameRef.current = window.requestAnimationFrame(() => {
      panelRef.current?.querySelector(focusableSelector)?.focus();
      initialFocusFrameRef.current = null;
    });

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll(focusableSelector)].filter(
        (element) => !element.hasAttribute('hidden')
      );
      if (!focusable.length) return;
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
      if (initialFocusFrameRef.current !== null) {
        window.cancelAnimationFrame(initialFocusFrameRef.current);
        initialFocusFrameRef.current = null;
      }
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      pendingFocusRef.current = null;
      queueMicrotask(() => triggerRef.current?.focus?.());
    };
  }, [initialView, onClose, open]);

  if (!open) return null;

  const heading =
    view === 'create' ? 'Criar projeto' : view === 'join' ? 'Entrar com código' : 'Novo projeto';

  function changeView(nextView) {
    if (initialFocusFrameRef.current !== null) {
      window.cancelAnimationFrame(initialFocusFrameRef.current);
      initialFocusFrameRef.current = null;
    }
    pendingFocusRef.current = nextView;
    setView(nextView);
  }

  function returnToChooser() {
    pendingFocusRef.current = view;
    setView('choose');
  }

  return (
    <div
      className="new-project-dialog__backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        ref={panelRef}
        className="new-project-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="new-project-dialog__header">
          <div>
            <h2 id={titleId}>{heading}</h2>
            <p id={descriptionId}>
              {view === 'choose'
                ? 'Escolha como deseja continuar.'
                : view === 'create'
                  ? 'Vincule um repositório autorizado para criar o projeto.'
                  : 'Use o código ou link compartilhado pelo proprietário do projeto.'}
            </p>
          </div>
          <div className="new-project-dialog__actions">
            {view !== 'choose' && <BackButton onClick={returnToChooser} label="Voltar às opções" />}
            <button
              className="new-project-dialog__close"
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              title="Fechar"
            >
              <TraceFlowIcon name="close" />
            </button>
          </div>
        </header>

        {view === 'choose' ? (
          <div className="new-project-dialog__choices">
            <button ref={createChoiceRef} type="button" onClick={() => changeView('create')}>
              <TraceFlowIcon name="plus" />
              <span>
                <strong>Criar projeto</strong>
                <small>Use a integração GitHub já autorizada.</small>
              </span>
            </button>
            <button ref={joinChoiceRef} type="button" onClick={() => changeView('join')}>
              <TraceFlowIcon name="code" />
              <span>
                <strong>Entrar com código</strong>
                <small>Confirme um código ou link de acesso.</small>
              </span>
            </button>
          </div>
        ) : (
          <div ref={contentRef} className="new-project-dialog__content">
            {view === 'create' ? createContent : joinContent}
          </div>
        )}
      </section>
    </div>
  );
}
