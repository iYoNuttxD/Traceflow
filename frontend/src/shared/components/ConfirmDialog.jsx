import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ConfirmContext = createContext(null);

function ConfirmDialog({ dialog, close }) {
  const panelRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    cancelRef.current?.focus();
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...panelRef.current.querySelectorAll('button:not([disabled])')];
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
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [close]);

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && close(false)}
    >
      <section
        ref={panelRef}
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
      >
        <h2 id="confirm-dialog-title">{dialog.title}</h2>
        <p id="confirm-dialog-description">{dialog.description}</p>
        <div className="dialog-actions">
          {/* "Voltar", e não "Cancelar": quando a ação confirmada é "Cancelar
              sprint", dois botões escritos "Cancelar" disputariam o mesmo verbo
              com efeitos opostos. */}
          <button
            ref={cancelRef}
            type="button"
            className="button button-secondary"
            onClick={() => close(false)}
          >
            Voltar
          </button>
          <button
            type="button"
            className={dialog.destructive ? 'button button-danger' : 'button button-primary'}
            onClick={() => close(true)}
          >
            {dialog.confirmLabel || 'Confirmar'}
          </button>
        </div>
      </section>
    </div>
  );
}

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);

  const close = useCallback((confirmed) => {
    setDialog((current) => {
      current?.resolve(confirmed);
      queueMicrotask(() => current?.trigger?.focus?.());
      return null;
    });
  }, []);

  const confirm = useCallback(
    (options) =>
      new Promise((resolve) => {
        setDialog({
          title: options.title || 'Confirmar ação',
          description: options.description,
          confirmLabel: options.confirmLabel,
          destructive: options.destructive !== false,
          trigger: document.activeElement,
          resolve
        });
      }),
    []
  );

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog && <ConfirmDialog dialog={dialog} close={close} />}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm deve ser usado dentro de ConfirmProvider.');
  return confirm;
}
