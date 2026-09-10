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
// `legacySeconds` é o esforço lançado antes das sessões existirem: conta no total,
// mas não é uma sessão. Com `incomplete`, o realizado conhecido é apenas parcial e
// nenhuma conclusão sobre o limite é publicada.
export function buildEffortSummary({
  estimatedHours,
  completedSeconds = 0,
  completedCount = 0,
  legacySeconds = 0,
  running = null,
  incomplete = false
}) {
  const hasEstimate = estimatedHours !== null && estimatedHours !== undefined;
  const estimatedSeconds = hasEstimate ? Math.round(estimatedHours * 3600) : null;
  const totalSeconds = completedSeconds + legacySeconds;
  const actualHours = round2(totalSeconds / 3600);
  const known = completedCount > 0 || legacySeconds > 0;
  const usageRatio =
    !incomplete && hasEstimate && estimatedSeconds > 0 ? totalSeconds / estimatedSeconds : null;

  let status = 'SEM_ESTIMATIVA';
  if (incomplete) status = 'INDISPONIVEL';
  else if (hasEstimate) {
    if (totalSeconds > estimatedSeconds) status = 'ESTOURADO';
    else if (usageRatio !== null && usageRatio >= EFFORT_WARNING_RATIO)
      status = 'PROXIMO_DO_LIMITE';
    else status = 'DENTRO_DO_PREVISTO';
  }

  return {
    unit: 'HOURS',
    estimatedHours: hasEstimate ? estimatedHours : null,
    estimatedSeconds,
    completedSeconds: totalSeconds,
    trackedSeconds: completedSeconds,
    legacySeconds,
    legacyHours: round2(legacySeconds / 3600),
    completedCount,
    actualHours: known ? actualHours : 0,
    incomplete,
    remainingSeconds:
      hasEstimate && !incomplete ? Math.max(estimatedSeconds - totalSeconds, 0) : null,
    overrunSeconds:
      hasEstimate && !incomplete ? Math.max(totalSeconds - estimatedSeconds, 0) : null,
    differenceHours: hasEstimate && !incomplete ? round2(actualHours - estimatedHours) : null,
    differencePercent:
      usageRatio === null
        ? null
        : round2(((totalSeconds - estimatedSeconds) / estimatedSeconds) * 100),
    usagePercent: usageRatio === null ? null : round2(usageRatio * 100),
    status,
    running: running
      ? { id: running.id, startedAt: running.startedAt, startedBy: running.startedBy }
      : null
  };
}
