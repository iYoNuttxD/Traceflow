import { useId, useRef, useState } from 'react';
import { useTaskEffort } from '../hooks/useTaskEffort.js';
import {
  EFFORT_STATUS_LABELS as STATUS_LABELS,
  EFFORT_STATUS_TONES as STATUS_TONES,
  computeEffortView,
  effortProgressAria,
  formatClock,
  formatHoursMinutes,
  formatTimeOfDay,
  resolveEffort
} from './effort-summary.js';
import { TaskTimeEntriesDialog } from './TaskTimeEntriesDialog.jsx';
import './TaskEffortTracker.css';

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
      <path d="M4 3l9 5-9 5V3z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
      <path d="M5 3.5A1.5 1.5 0 0 1 6.5 5v6a1.5 1.5 0 0 1-3 0V5A1.5 1.5 0 0 1 5 3.5zm6 0A1.5 1.5 0 0 1 12.5 5v6a1.5 1.5 0 0 1-3 0V5A1.5 1.5 0 0 1 11 3.5z" />
    </svg>
  );
}

export function TaskEffortTracker({
  taskId,
  taskTitle,
  estimatedEffort,
  actualEffort,
  onEffortChange
}) {
  const titleId = useId();
  const sessionsButtonRef = useRef(null);
  const {
    running,
    entries,
    effort,
    permissions,
    loading,
    busy,
    error,
    liveSeconds,
    start,
    stop,
    addManual,
    remove,
    update,
    reload
  } = useTaskEffort({ taskId });
  const [manualOpen, setManualOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');

  const view = computeEffortView({
    effort: resolveEffort(effort, { estimatedEffort, actualEffort }),
    liveSeconds
  });
  const tone = STATUS_TONES[view.status] || 'neutral';
  const completedCount = effort?.completedCount ?? entries.length;
  const badgeLabel = loading
    ? 'Carregando...'
    : view.status === 'ESTOURADO' && view.overrunSeconds > 0
      ? `+${formatHoursMinutes(view.overrunSeconds)} acima da estimativa`
      : !running && view.totalSeconds === 0
        ? 'Não iniciado'
        : STATUS_LABELS[view.status];
  const caption = running
    ? `iniciado por ${running.startedBy?.name || 'membro'} às ${formatTimeOfDay(running.startedAt)} · total ${formatHoursMinutes(view.totalSeconds)}`
    : completedCount > 0
      ? `${completedCount} ${completedCount === 1 ? 'sessão registrada' : 'sessões registradas'}`
      : 'Nenhuma sessão registrada';

  function notify(data, message) {
    if (data?.effort) onEffortChange?.(data.effort, message);
  }

  async function handleStart() {
    notify(await start(), 'Cronômetro iniciado.');
  }

  async function handleStop() {
    notify(await stop(), 'Cronômetro parado.');
  }

  async function handleManualSubmit(event) {
    event.preventDefault();
    if (!hours.trim()) return;
    const data = await addManual({
      hours: hours.trim(),
      ...(note.trim() ? { note: note.trim() } : {})
    });
    if (!data) return;
    setHours('');
    setNote('');
    setManualOpen(false);
    notify(data, 'Lançamento manual registrado.');
  }

  async function handleDelete(entryId) {
    const data = await remove(entryId);
    notify(data, 'Sessão de tempo excluída.');
    return data;
  }

  return (
    <section
      className="task-effort"
      data-state={running ? 'running' : 'idle'}
      data-zone={tone}
      aria-labelledby={titleId}
    >
      <div className="task-effort-head">
        <span className="task-effort-title" id={titleId}>
          {running && <span className="task-effort-rec" aria-hidden="true" />}
          Esforço (horas)
        </span>
        <span className={`task-effort-badge tone-${tone}`} role="status">
          {badgeLabel}
        </span>
      </div>

      <div className="task-effort-clock-row">
        <span
          className="task-effort-clock"
          aria-label={running ? 'Tempo da sessão atual' : 'Tempo total registrado'}
        >
          {formatClock(running ? liveSeconds : view.completedSeconds)}
        </span>
        <span className="task-effort-caption">{caption}</span>
      </div>

      {view.hasEstimate ? (
        <>
          <div
            className="task-effort-bar"
            role="progressbar"
            aria-label="Consumo da estimativa"
            {...effortProgressAria(view)}
          >
            <div className="task-effort-bar-fill" style={{ width: `${view.barPercent}%` }} />
          </div>
          <div className="task-effort-foot">
            <span>
              {formatHoursMinutes(view.totalSeconds)} de {formatHoursMinutes(view.estimatedSeconds)}{' '}
              estimadas
            </span>
            <span className="task-effort-pct">
              {view.usagePercent === null ? '—' : `${Math.round(view.usagePercent)}%`}
            </span>
          </div>
        </>
      ) : (
        !loading && (
          <p className="task-effort-hint">
            Sem estimativa definida — informe o esforço estimado para acompanhar o limite.
          </p>
        )
      )}

      {error && (
        <div className="message message-error task-effort-message" role="alert">
          <span>{error}</span>
          <button
            className="button button-outline button-compact"
            type="button"
            disabled={busy || loading}
            onClick={() => void reload()}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {permissions.canOperate && (
        <div className="task-effort-controls">
          {running ? (
            <button
              className="button button-danger button-compact task-effort-main-action"
              type="button"
              disabled={busy}
              onClick={() => void handleStop()}
            >
              <PauseIcon />
              {busy ? 'Parando...' : 'Pausar'}
            </button>
          ) : (
            <button
              className="button button-primary button-compact task-effort-main-action"
              type="button"
              disabled={busy || loading}
              onClick={() => void handleStart()}
            >
              <PlayIcon />
              {busy ? 'Iniciando...' : view.completedSeconds > 0 ? 'Retomar' : 'Iniciar'}
            </button>
          )}
          <button
            className="button button-outline button-compact"
            type="button"
            aria-expanded={manualOpen}
            disabled={busy}
            onClick={() => setManualOpen((current) => !current)}
          >
            Lançar manualmente
          </button>
        </div>
      )}

      {manualOpen && (
        <form className="task-effort-manual" onSubmit={handleManualSubmit}>
          <label className="task-effort-field">
            <span>Horas</span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0.01"
              max="24"
              required
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              placeholder="Ex.: 1,5"
              disabled={busy}
            />
          </label>
          <label className="task-effort-field task-effort-field-grow">
            <span>Observação</span>
            <input
              type="text"
              maxLength={191}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Opcional"
              disabled={busy}
            />
          </label>
          <div className="task-effort-manual-actions">
            <button
              className="button button-outline button-compact"
              type="button"
              disabled={busy}
              onClick={() => setManualOpen(false)}
            >
              Cancelar
            </button>
            <button
              className="button button-primary button-compact"
              type="submit"
              disabled={busy || !hours.trim()}
            >
              {busy ? 'Salvando...' : 'Salvar lançamento'}
            </button>
          </div>
        </form>
      )}

      {!loading && (
        <button
          className="task-effort-link"
          type="button"
          ref={sessionsButtonRef}
          onClick={() => setSessionsOpen(true)}
        >
          Ver sessões registradas
        </button>
      )}

      {sessionsOpen && (
        <TaskTimeEntriesDialog
          taskId={taskId}
          taskTitle={taskTitle}
          refreshKey={`${completedCount}:${entries[0]?.id ?? ''}:${entries[0]?.updatedAt ?? ''}:${effort?.completedSeconds ?? ''}:${running?.id ?? ''}`}
          busy={busy}
          onDelete={handleDelete}
          onUpdate={async (entryId, payload) => {
            const data = await update(entryId, payload);
            notify(data, 'Sessão de tempo editada.');
            return data;
          }}
          returnFocusRef={sessionsButtonRef}
          onClose={() => setSessionsOpen(false)}
        />
      )}
    </section>
  );
}
