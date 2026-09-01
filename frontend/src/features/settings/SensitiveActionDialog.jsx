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
  cooldown = 0,
  onConfirm,
  onError,
  onSuccess,
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
  const displayedError =
    error && cooldown > 0 ? `${error} Tente novamente em ${cooldown}s.` : error;

  const close = useCallback(() => {
    if (busy) return;
    onClose();
    queueMicrotask(() => {
      if (trigger?.isConnected) trigger.focus();
    });
  }, [busy, onClose, trigger]);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    if (busy) cancelRef.current?.focus();
  }, [busy]);

  useEffect(() => {
    if (!busy && error && mode === 'password') {
      panelRef.current?.querySelector('#sensitiveActionPassword')?.focus();
    }
  }, [busy, error, mode]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = [
        ...panel.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href]')
      ];
      if (!focusable.length) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!panel.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
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
    if (busy || cooldown > 0 || (mode === 'password' && !password)) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm(password);
      onSuccess?.();
      onClose();
    } catch (value) {
      const normalized = normalizeApiError(value);
      setError(normalized.message);
      onError?.(normalized);
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
        tabIndex="-1"
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
              error={displayedError}
              disabled={busy}
            />
          )}
          {mode === 'github' && (
            <div className="settings-panel settings-panel-info">
              <p>A confirmação será concluída no GitHub e vinculada a esta sessão.</p>
              <GithubSensitiveReauthentication
                account={account}
                returnTo={returnTo}
                cooldown={cooldown}
                onError={(message, normalized) => {
                  setError(message);
                  onError?.(normalized);
                }}
              />
            </div>
          )}
          {mode === 'prerequisite' && (
            <div className="settings-panel settings-panel-warning" role="alert">
              <p>Crie uma senha em Segurança antes de remover o GitHub OAuth.</p>
            </div>
          )}
          {displayedError && mode !== 'password' && (
            <div className="message message-error" role="alert">
              <span aria-hidden="true">!</span>
              <span>{displayedError}</span>
            </div>
          )}
          <div className="dialog-actions">
            <button
              ref={cancelRef}
              className="button button-secondary"
              type="button"
              aria-disabled={busy || undefined}
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
                disabled={(mode === 'password' && !password) || busy || cooldown > 0}
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
