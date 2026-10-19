import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  ErrorState,
  FeedbackRegion,
  LoadingState,
  normalizeApiError
} from '../../../shared/index.js';
import {
  getNotificationPreferences,
  saveNotificationPreferences
} from '../api/notifications.api.js';
import { PREFERENCE_GROUPS, PREFERENCE_OPTIONS } from '../model/notification-view.js';
import './NotificationPreferencesForm.css';

export function NotificationPreferencesForm() {
  const descriptionPrefix = useId();
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState({});
  const [focusRequest, setFocusRequest] = useState(0);
  const saveRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await getNotificationPreferences({ fresh: true });
      setSaved(response.preferences);
      setDraft(response.preferences);
    } catch (failure) {
      setLoadError(
        normalizeApiError(failure, 'Não foi possível carregar as preferências de notificação.')
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (focusRequest) saveRef.current?.focus();
  }, [focusRequest]);

  const dirty =
    Boolean(draft && saved) &&
    PREFERENCE_OPTIONS.some((option) => draft[option.type] !== saved[option.type]);
  const blocked = saving || !dirty;

  async function save(event) {
    event.preventDefault();
    if (blocked) return;
    setSaving(true);
    setFeedback({});
    try {
      const response = await saveNotificationPreferences(draft);
      setSaved(response.preferences);
      setDraft(response.preferences);
      setFeedback({ success: 'Preferências salvas.' });
    } catch (failure) {
      const error = normalizeApiError(failure, 'Não foi possível salvar as preferências.');
      setFeedback(
        error.status === 429
          ? { rateLimit: error.message, retryAfterSeconds: error.retryAfterSeconds }
          : { error: error.message }
      );
    } finally {
      setSaving(false);
      setFocusRequest((value) => value + 1);
    }
  }

  if (loading) return <LoadingState message="Carregando preferências..." />;
  if (loadError)
    return (
      <ErrorState
        message={loadError.message}
        retryAfterSeconds={loadError.retryAfterSeconds}
        onRetry={load}
      />
    );

  return (
    <form className="notification-preferences" onSubmit={save} noValidate>
      {PREFERENCE_GROUPS.map((group) => (
        <fieldset key={group.key} className="notification-preferences__options">
          <legend>{group.legend}</legend>
          {PREFERENCE_OPTIONS.filter((option) => option.group === group.key).map((option) => (
            <label key={option.type} className="notification-preferences__option">
              <input
                type="checkbox"
                checked={Boolean(draft?.[option.type])}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    [option.type]: event.target.checked
                  }))
                }
                aria-describedby={`${descriptionPrefix}-${option.type}`}
              />
              <span>
                <strong>{option.label}</strong>
                <small id={`${descriptionPrefix}-${option.type}`}>{option.description}</small>
              </span>
            </label>
          ))}
        </fieldset>
      ))}
      <FeedbackRegion
        success={feedback.success}
        error={feedback.error}
        rateLimit={feedback.rateLimit}
        retryAfterSeconds={feedback.retryAfterSeconds}
      />
      <div className="notification-preferences__actions">
        <button
          ref={saveRef}
          type="submit"
          className="button button-primary"
          aria-disabled={blocked}
          aria-busy={saving || undefined}
        >
          Salvar preferências
        </button>
      </div>
    </form>
  );
}
