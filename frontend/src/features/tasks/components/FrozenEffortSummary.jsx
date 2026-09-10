import { useId } from 'react';
import {
  EFFORT_STATUS_LABELS,
  EFFORT_STATUS_TONES,
  computeEffortView,
  formatClock,
  formatHoursMinutes
} from './effort-summary.js';
import { formatEffortHours } from './kanban-display.js';
import './TaskEffortTracker.css';

const unavailable = 'Indisponível no snapshot';

// Espelho estático do rastreador para a visão congelada: mesma estrutura visual,
// sem controles, sem cronômetro vivo e sem leitura da tarefa atual (FIX-04).
export function FrozenEffortSummary({ task }) {
  const titleId = useId();
  const complete = task.snapshotAvailable === true && task.snapshotVersion >= 2;
  const actualKnown = complete && task.actualEffort !== undefined;
  const actualHours = actualKnown ? task.actualEffort : null;
  const estimatedHours = task.estimatedEffort ?? null;
  const view = computeEffortView({
    effort: {
      estimatedHours,
      completedSeconds: Math.round((actualHours ?? 0) * 3600),
      completedCount: actualHours == null ? 0 : 1
    },
    liveSeconds: 0
  });
  const tone = actualKnown ? EFFORT_STATUS_TONES[view.status] : 'neutral';
  const badge = !actualKnown
    ? unavailable
    : view.status === 'ESTOURADO' && view.overrunSeconds > 0
      ? `+${formatHoursMinutes(view.overrunSeconds)} acima da estimativa`
      : EFFORT_STATUS_LABELS[view.status];
  const estimateNote =
    estimatedHours === null ? 'sem estimativa' : `estimativa ${formatEffortHours(estimatedHours)}`;
  const caption = !actualKnown
    ? `Esforço realizado ${unavailable.toLocaleLowerCase('pt-BR')} · ${estimateNote}`
    : actualHours == null
      ? `Esforço realizado não informado no encerramento · ${estimateNote}`
      : view.hasEstimate
        ? 'Esforço realizado no encerramento da sprint'
        : 'Esforço realizado no encerramento da sprint · sem estimativa';

  return (
    <section className="task-effort" data-state="idle" data-zone={tone} aria-labelledby={titleId}>
      <div className="task-effort-head">
        <span className="task-effort-title" id={titleId}>
          Esforço (horas)
        </span>
        <span className={`task-effort-badge tone-${tone}`}>{badge}</span>
      </div>
      <div className="task-effort-clock-row">
        <span className="task-effort-clock" aria-label="Tempo total registrado no encerramento">
          {actualKnown ? formatClock(view.completedSeconds) : '—'}
        </span>
        <span className="task-effort-caption">{caption}</span>
      </div>
      {actualKnown && view.hasEstimate && (
        <>
          <div
            className="task-effort-bar"
            role="progressbar"
            aria-label="Consumo da estimativa no encerramento"
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
      )}
    </section>
  );
}
