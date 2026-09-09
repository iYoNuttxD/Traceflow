// Espelha as fórmulas do backend (task-time-entry.presenter.js) para que o
// widget reclassifique o estado ao vivo enquanto a sessão corre, sem consultar a API.
export const EFFORT_WARNING_RATIO = 0.7;

export const EFFORT_STATUS_LABELS = Object.freeze({
  SEM_ESTIMATIVA: 'Sem limite definido',
  DENTRO_DO_PREVISTO: 'Dentro do previsto',
  PROXIMO_DO_LIMITE: 'Perto do limite',
  ESTOURADO: 'Tempo estourado'
});

export const EFFORT_STATUS_TONES = Object.freeze({
  SEM_ESTIMATIVA: 'neutral',
  DENTRO_DO_PREVISTO: 'accent',
  PROXIMO_DO_LIMITE: 'warning',
  ESTOURADO: 'danger'
});

const pad = (value) => String(value).padStart(2, '0');
const DAY_MS = 86_400_000;

export function formatClock(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
}

export function formatHoursMinutes(totalSeconds) {
  const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h${pad(minutes)}min`;
}

export function formatTimeOfDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function dayLabel(value, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const startOfDay = (item) =>
    new Date(item.getFullYear(), item.getMonth(), item.getDate()).getTime();
  const daysAgo = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
  if (daysAgo === 0) return 'Hoje';
  if (daysAgo === 1) return 'Ontem';
  return date.toLocaleDateString('pt-BR');
}

// "Hoje, 14:02 → 15:47 · Ana" — e "parado por Bruno" só quando outra pessoa encerrou.
export function describeTimeEntry(entry, now = new Date()) {
  const starter = entry.startedBy?.name || `Usuário #${entry.startedBy?.id ?? '?'}`;
  if (entry.source === 'MANUAL') {
    return `${dayLabel(entry.endedAt, now)}, ${formatTimeOfDay(entry.endedAt)} · ${starter}`;
  }
  const range = `${dayLabel(entry.startedAt, now)}, ${formatTimeOfDay(entry.startedAt)} → ${formatTimeOfDay(entry.endedAt)}`;
  const stopper = entry.endedBy?.name;
  const stoppedByOther = Boolean(stopper) && entry.endedBy?.id !== entry.startedBy?.id;
  return stoppedByOther ? `${range} · ${starter} · parado por ${stopper}` : `${range} · ${starter}`;
}

// Enquanto a API não respondeu (ou falhou), a tarefa em mãos é a melhor fonte:
// a estimativa nunca some da tela e o realizado já conhecido aparece como base.
// Com resposta, a estimativa da tarefa ainda prevalece — ela é editada no painel
// e chega antes de qualquer nova leitura das sessões.
export function resolveEffort(effort, { estimatedEffort, actualEffort } = {}) {
  const estimatedHours =
    estimatedEffort !== undefined && estimatedEffort !== null
      ? Number(estimatedEffort)
      : (effort?.estimatedHours ?? null);
  if (effort) return { ...effort, estimatedHours };
  return {
    estimatedHours,
    completedSeconds: Math.round((Number(actualEffort) || 0) * 3600),
    completedCount: actualEffort === null || actualEffort === undefined ? 0 : 1
  };
}

// Resumo compacto para o cartão do Kanban: relógio vivo quando há sessão em
// andamento, senão o total registrado contra a estimativa. Sem dado algum, nada.
export function buildEffortChip(task, now = Date.now()) {
  if (!task || task.isFrozen) return null;
  const running = task.runningTimer || null;
  const estimated = task.estimatedEffort ?? null;
  const actual = task.actualEffort ?? null;
  if (!running && estimated === null && actual === null) return null;
  const liveSeconds = running
    ? Math.max(0, Math.floor((now - new Date(running.startedAt).getTime()) / 1000))
    : 0;
  const view = computeEffortView({
    effort: resolveEffort(null, { estimatedEffort: estimated, actualEffort: actual }),
    liveSeconds
  });
  const total = formatHoursMinutes(view.totalSeconds);
  const percent = view.usagePercent === null ? null : `${Math.round(view.usagePercent)}%`;
  const estimateLabel = view.hasEstimate
    ? ` de ${formatHoursMinutes(view.estimatedSeconds)} estimadas${percent ? ` (${percent})` : ''}`
    : '';
  return {
    running: Boolean(running),
    tone: EFFORT_STATUS_TONES[view.status] || 'neutral',
    value: running ? formatClock(liveSeconds) : total,
    detail: running
      ? (percent ?? total)
      : view.hasEstimate
        ? `/ ${formatHoursMinutes(view.estimatedSeconds)}${percent ? ` · ${percent}` : ''}`
        : '',
    title: running
      ? `Cronômetro em andamento por ${running.startedBy?.name || 'membro'} · total ${total}${estimateLabel}`
      : `Esforço registrado ${total}${estimateLabel}`
  };
}

export function computeEffortView({ effort, liveSeconds = 0 }) {
  const completedSeconds = Number(effort?.completedSeconds) || 0;
  const totalSeconds = completedSeconds + Math.max(0, liveSeconds);
  const hasEstimate = effort?.estimatedHours !== null && effort?.estimatedHours !== undefined;
  const estimatedSeconds = hasEstimate ? Math.round(Number(effort.estimatedHours) * 3600) : null;
  const usageRatio = hasEstimate && estimatedSeconds > 0 ? totalSeconds / estimatedSeconds : null;

  let status = 'SEM_ESTIMATIVA';
  if (hasEstimate) {
    if (totalSeconds > estimatedSeconds) status = 'ESTOURADO';
    else if (usageRatio !== null && usageRatio >= EFFORT_WARNING_RATIO)
      status = 'PROXIMO_DO_LIMITE';
    else status = 'DENTRO_DO_PREVISTO';
  }

  return {
    hasEstimate,
    estimatedSeconds,
    completedSeconds,
    totalSeconds,
    usagePercent: usageRatio === null ? null : usageRatio * 100,
    barPercent:
      usageRatio === null
        ? hasEstimate && totalSeconds > 0
          ? 100
          : 0
        : Math.min(usageRatio * 100, 100),
    remainingSeconds: hasEstimate ? Math.max(estimatedSeconds - totalSeconds, 0) : null,
    overrunSeconds: hasEstimate ? Math.max(totalSeconds - estimatedSeconds, 0) : null,
    status
  };
}
