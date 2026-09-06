const MODERATOR_ROLES = new Set(['MANAGER', 'OWNER']);

// Limiar a partir do qual o consumo da estimativa passa a ser sinalizado como
// "próximo do limite" antes de estourar.
export const EFFORT_WARNING_RATIO = 0.7;

export function canModerateTaskTimeEntries(role) {
  return MODERATOR_ROLES.has(role);
}

// Qualquer membro que escreve no projeto opera o cronômetro; a restrição ao
// responsável foi descartada em favor do registro de quem iniciou e quem parou.
export function canOperateTaskTimer(role) {
  return Boolean(role) && role !== 'VIEWER';
}

export function formatTaskTimeEntry(entry, context = {}) {
  const role = context.membershipRole;
  const own = entry.startedById === context.actorUserId;
  return {
    id: entry.id,
    taskId: entry.taskId,
    source: entry.source,
    startedAt: entry.startedAt,
    endedAt: entry.endedAt ?? null,
    durationSeconds: entry.durationSeconds ?? null,
    note: entry.note ?? null,
    startedBy: entry.startedBy,
    endedBy: entry.endedBy ?? null,
    createdAt: entry.createdAt,
    canDelete: (own && canOperateTaskTimer(role)) || canModerateTaskTimeEntries(role)
  };
}

const round2 = (value) => Math.round(value * 100) / 100;

// Fórmulas do S1-06 (unidade única: horas). Sem estimativa não há limite e as
// diferenças ficam nulas. Estimativa zero: qualquer segundo registrado é estouro
// e o percentual não é calculado, porque a divisão por zero não tem leitura útil.
export function buildEffortSummary({
  estimatedHours,
  completedSeconds = 0,
  completedCount = 0,
  running = null
}) {
  const hasEstimate = estimatedHours !== null && estimatedHours !== undefined;
  const estimatedSeconds = hasEstimate ? Math.round(estimatedHours * 3600) : null;
  const actualHours = round2(completedSeconds / 3600);
  const usageRatio =
    hasEstimate && estimatedSeconds > 0 ? completedSeconds / estimatedSeconds : null;

  let status = 'SEM_ESTIMATIVA';
  if (hasEstimate) {
    if (completedSeconds > estimatedSeconds) status = 'ESTOURADO';
    else if (usageRatio !== null && usageRatio >= EFFORT_WARNING_RATIO)
      status = 'PROXIMO_DO_LIMITE';
    else status = 'DENTRO_DO_PREVISTO';
  }

  return {
    unit: 'HOURS',
    estimatedHours: hasEstimate ? estimatedHours : null,
    estimatedSeconds,
    completedSeconds,
    completedCount,
    actualHours: completedCount > 0 ? actualHours : 0,
    remainingSeconds: hasEstimate ? Math.max(estimatedSeconds - completedSeconds, 0) : null,
    overrunSeconds: hasEstimate ? Math.max(completedSeconds - estimatedSeconds, 0) : null,
    differenceHours: hasEstimate ? round2(actualHours - estimatedHours) : null,
    differencePercent:
      usageRatio === null
        ? null
        : round2(((completedSeconds - estimatedSeconds) / estimatedSeconds) * 100),
    usagePercent: usageRatio === null ? null : round2(usageRatio * 100),
    status,
    running: running
      ? { id: running.id, startedAt: running.startedAt, startedBy: running.startedBy }
      : null
  };
}
