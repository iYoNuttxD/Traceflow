import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import './ConfirmDialog.css';
import { useDialogLayer } from './dialog-stack.js';

const ConfirmContext = createContext(null);

function ConfirmDialog({ dialog, close }) {
  const panelRef = useRef(null);
  const cancelRef = useRef(null);
  const isTopDialog = useDialogLayer();

  useEffect(() => {
    if (!dialog.confirmationText) cancelRef.current?.focus();
    function onKeyDown(event) {
      if (event.defaultPrevented || !isTopDialog()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        close(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [
        ...panelRef.current.querySelectorAll('input:not([disabled]), button:not([disabled])')
      ];
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
  }, [close, dialog.confirmationText, isTopDialog]);

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
        <ConfirmDialogContent dialog={dialog} close={close} cancelRef={cancelRef} />
      </section>
    </div>
  );
}

export function ConfirmDialogContent({ dialog, close, cancelRef }) {
  const fallbackRef = useRef(null);
  const confirmationRef = useRef(null);
  const [confirmation, setConfirmation] = useState('');
  useEffect(() => {
    (dialog.confirmationText ? confirmationRef : cancelRef || fallbackRef).current?.focus();
  }, [cancelRef, dialog.confirmationText]);
  const confirmed = !dialog.confirmationText || confirmation === dialog.confirmationText;
  return (
    <div className="confirm-dialog-content">
      <h2 id="confirm-dialog-title">{dialog.title}</h2>
      <p id="confirm-dialog-description">{dialog.description}</p>
      {dialog.details?.length > 0 && (
        <ul className="confirm-dialog__details">
          {dialog.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}
      {dialog.confirmationText && (
        <label className="confirm-dialog__confirmation">
          <span>
            {dialog.confirmationLabel || (
              <>
                Digite <strong>{dialog.confirmationText}</strong> para confirmar.
              </>
            )}
          </span>
          <input
            ref={confirmationRef}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
          />
        </label>
      )}
      <div className="dialog-actions">
        <button
          ref={cancelRef || fallbackRef}
          disabled={dialog.busy}
          type="button"
          className="button button-secondary"
          onClick={() => close(false)}
        >
          {dialog.cancelLabel || 'Cancelar'}
        </button>
        <button
          type="button"
          disabled={dialog.busy || !confirmed}
          className={dialog.destructive ? 'button button-danger' : 'button button-primary'}
          onClick={() => close(true)}
        >
          {dialog.confirmLabel || 'Confirmar'}
        </button>
      </div>
    </div>
  );
}

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);

  const close = useCallback((confirmed) => {
    setDialog((current) => {
      const focusTarget =
        confirmed && current?.focusAfterConfirmRef?.current
          ? current.focusAfterConfirmRef.current
          : current?.trigger;
      current?.resolve(confirmed);
      queueMicrotask(() => focusTarget?.focus?.());
      return null;
    });
  }, []);

  const confirm = useCallback(
    (options) =>
      new Promise((resolve) => {
        setDialog({
          title: options.title || 'Confirmar ação',
          description: options.description,
          cancelLabel: options.cancelLabel,
          confirmLabel: options.confirmLabel,
          destructive: options.destructive !== false,
          confirmationText: options.confirmationText,
          confirmationLabel: options.confirmationLabel,
          details: options.details,
          focusAfterConfirmRef: options.focusAfterConfirmRef,
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
