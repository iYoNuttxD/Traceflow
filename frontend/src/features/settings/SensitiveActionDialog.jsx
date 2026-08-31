import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { normalizeApiError } from '../../shared/index.js';
import { PasswordField } from '../auth/index.js';
import { GithubSensitiveReauthentication } from './GithubSensitiveReauthentication.jsx';

export function SensitiveActionDialog({
  title,
  description,
  independence,
  confirmLabel,
  destructive = true,
  mode = 'password',
  account,
  returnTo,
  trigger,
  onConfirm,
  onClose
}) {
  const titleId = useId();
  const descriptionId = useId();
  const independenceId = useId();
  const panelRef = useRef(null);
  const cancelRef = useRef(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const close = useCallback(() => {
    if (busy) return;
    onClose();
    queueMicrotask(() => trigger?.focus?.());
  }, [busy, onClose, trigger]);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [
        ...panelRef.current.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), a[href]'
        )
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
  }, [close]);

  async function submit(event) {
    event?.preventDefault();
    if (busy || (mode === 'password' && !password)) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm(password);
      onClose();
      queueMicrotask(() => trigger?.focus?.());
    } catch (value) {
      setError(normalizeApiError(value).message);
      setBusy(false);
    }
  }

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <section
        ref={panelRef}
        className="confirm-dialog settings-sensitive-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${descriptionId}${independence ? ` ${independenceId}` : ''}`}
      >
        <h2 id={titleId}>{title}</h2>
        <div className="settings-dialog-copy">
          <p id={descriptionId}>{description}</p>
          {independence && <p id={independenceId}>{independence}</p>}
        </div>
        <form
          className="settings-form settings-dialog-form"
          onSubmit={(event) => void submit(event)}
        >
          {mode === 'password' && (
            <PasswordField
              id="sensitiveActionPassword"
              label="Senha atual"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError('');
              }}
              error={error}
              disabled={busy}
            />
          )}
          {mode === 'github' && (
            <div className="settings-panel settings-panel-info">
              <p>A confirmação será concluída no GitHub e vinculada a esta sessão.</p>
              <GithubSensitiveReauthentication
                account={account}
                returnTo={returnTo}
                onError={setError}
              />
            </div>
          )}
          {mode === 'prerequisite' && (
            <div className="settings-panel settings-panel-warning" role="alert">
              <p>Crie uma senha em Segurança antes de remover o GitHub OAuth.</p>
            </div>
          )}
          {error && mode !== 'password' && (
            <div className="message message-error" role="alert">
              <span aria-hidden="true">!</span>
              <span>{error}</span>
            </div>
          )}
          <div className="dialog-actions">
            <button
              ref={cancelRef}
              className="button button-secondary"
              type="button"
              disabled={busy}
              onClick={close}
            >
              Cancelar
            </button>
            {mode === 'prerequisite' ? (
              <Link className="button button-primary link-button" to="/settings/security">
                Ir para Segurança
              </Link>
            ) : mode === 'password' || mode === 'confirm' ? (
              <button
                className={`button ${destructive ? 'button-danger' : 'button-provider'}`}
                type="button"
                disabled={(mode === 'password' && !password) || busy}
                aria-busy={busy}
                onClick={() => void submit()}
              >
                {busy ? 'Processando...' : confirmLabel}
              </button>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  );
}
