// Pessoa sempre com o nome congelado no relatório, nunca o nome atual da conta.
export function publicReportPerson(person) {
  if (!person) return null;
  return {
    userId: person.userId,
    displayName: person.displayNameSnapshot,
    username: person.usernameSnapshot ?? null
  };
}

export function publicReport(report) {
  return {
    id: report.id,
    projectId: report.projectId,
    status: report.status,
    filters: {
      startDate: report.startDate ?? null,
      endDate: report.endDate ?? null,
      timeZone: report.timeZone ?? null,
      sprintId: report.sprintId ?? null
    },
    requestedBy: publicReportPerson(report.requester),
    snapshotVersion: report.snapshotVersion ?? null,
    createdAt: report.createdAt,
    startedAt: report.startedAt ?? null,
    finishedAt: report.finishedAt ?? null,
    durationMs: report.durationMs ?? null,
    error: report.errorCode
      ? { code: report.errorCode, message: report.errorMessage || 'O relatório não foi gerado.' }
      : null
  };
}

// O snapshot só é exposto quando a geração terminou com sucesso.
export function publicReportDetail(report) {
  return {
    ...publicReport(report),
    snapshot: report.status === 'SUCCEEDED' ? report.snapshot : null,
    people: report.status === 'SUCCEEDED' ? report.people.map(publicReportPerson) : []
  };
}

export function publicReportSummary({ counts, latest }) {
  const count = (status) => counts[status] ?? 0;
  return {
    total: Object.values(counts).reduce((sum, value) => sum + value, 0),
    succeeded: count('SUCCEEDED'),
    active: count('QUEUED') + count('RUNNING'),
    failed: count('FAILED'),
    latestSucceeded: latest ? { id: latest.id, finishedAt: latest.finishedAt } : null
  };
}
