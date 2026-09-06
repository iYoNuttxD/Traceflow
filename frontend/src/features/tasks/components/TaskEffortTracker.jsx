import { useId, useState } from 'react';
import { useTaskEffort } from '../hooks/useTaskEffort.js';
import { useConfirm } from '../../../shared/index.js';
import {
  EFFORT_STATUS_LABELS as STATUS_LABELS,
  EFFORT_STATUS_TONES as STATUS_TONES,
  computeEffortView,
  describeTimeEntry,
  formatClock,
  formatHoursMinutes,
  formatTimeOfDay,
  resolveEffort
} from './effort-summary.js';
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

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true">
      <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
      <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3h11V2h-11v1z" />
    </svg>
  );
}

export function TaskEffortTracker({ taskId, estimatedEffort, actualEffort, onEffortChange }) {
  const confirm = useConfirm();
  const titleId = useId();
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
    reload
  } = useTaskEffort({ taskId });
  const [manualOpen, setManualOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
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
    setHistoryOpen(true);
    notify(data, 'Lançamento manual registrado.');
  }

  async function handleDelete(entry) {
    const confirmed = await confirm({
      title: 'Excluir sessão de tempo',
      description:
        'A sessão sairá do histórico e o esforço realizado da tarefa será recalculado. Esta ação não poderá ser desfeita.',
      confirmLabel: 'Excluir'
    });
    if (!confirmed) return;
    notify(await remove(entry.id), 'Sessão de tempo excluída.');
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
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(view.usagePercent ?? (view.totalSeconds > 0 ? 100 : 0))}
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
        <details className="task-effort-sessions" open={historyOpen}>
          <summary
            onClick={(event) => {
              event.preventDefault();
              setHistoryOpen((current) => !current);
            }}
          >
            {historyOpen ? 'Ocultar sessões registradas' : 'Ver sessões registradas'}
          </summary>
          {historyOpen && (
            <ul className="task-effort-entries" aria-label="Sessões registradas">
              {entries.length === 0 ? (
                <li className="task-effort-empty">Nenhuma sessão registrada.</li>
              ) : (
                entries.map((entry) => (
                  <li key={entry.id}>
                    <div className="task-effort-entry">
                      <span className="task-effort-entry-when">{describeTimeEntry(entry)}</span>
                      {entry.source === 'MANUAL' && <span className="task-effort-tag">manual</span>}
                      {entry.note && <span className="task-effort-entry-note">{entry.note}</span>}
                    </div>
                    <div className="task-effort-entry-side">
                      <strong>{formatHoursMinutes(entry.durationSeconds || 0)}</strong>
                      {entry.canDelete && (
                        <button
                          className="task-effort-icon-button"
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDelete(entry)}
                          aria-label="Excluir sessão"
                          title="Excluir sessão"
                        >
                          <TrashIcon />
                        </button>
                      )}
                    </div>
                  </li>
                ))
              )}
            </ul>
          )}
        </details>
      )}
    </section>
  );
}
