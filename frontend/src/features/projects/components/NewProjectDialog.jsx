import { useEffect, useId, useRef, useState } from 'react';
import { ProjectIcon } from './ProjectIcon.jsx';
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
  const [view, setView] = useState(initialView);

  useEffect(() => {
    if (!open) return undefined;
    triggerRef.current = document.activeElement;
    setView(initialView);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.querySelector(focusableSelector)?.focus();
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
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      queueMicrotask(() => triggerRef.current?.focus?.());
    };
  }, [initialView, onClose, open]);

  if (!open) return null;

  const heading =
    view === 'create' ? 'Criar projeto' : view === 'join' ? 'Entrar com código' : 'Novo projeto';

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
          <button
            className="new-project-dialog__close"
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            title="Fechar"
          >
            <ProjectIcon name="close" />
          </button>
        </header>

        {view === 'choose' ? (
          <div className="new-project-dialog__choices">
            <button type="button" onClick={() => setView('create')}>
              <ProjectIcon name="plus" />
              <span>
                <strong>Criar projeto</strong>
                <small>Use a integração GitHub já autorizada.</small>
              </span>
            </button>
            <button type="button" onClick={() => setView('join')}>
              <ProjectIcon name="code" />
              <span>
                <strong>Entrar com código</strong>
                <small>Confirme um código ou link de acesso.</small>
              </span>
            </button>
          </div>
        ) : (
          <div className="new-project-dialog__content">
            {initialView === 'choose' && (
              <button
                className="new-project-dialog__back"
                type="button"
                onClick={() => setView('choose')}
              >
                Voltar às opções
              </button>
            )}
            {view === 'create' ? createContent : joinContent}
          </div>
        )}
      </section>
    </div>
  );
}
