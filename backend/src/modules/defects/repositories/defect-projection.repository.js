import { correctionProjection } from '../defect.schema.js';
// Callers hold Project before Task/Defect locks. Keep this leaf independent of services.
export async function reconcileDefect(tx, id, actorUserId, reason = 'TASK_STATUS_CHANGED') {
  await tx.$queryRaw`SELECT id FROM Defect WHERE id = ${id} FOR UPDATE`;
  const row = await tx.defect.findUnique({
    where: { id },
    include: {
      taskLinks: {
        where: { relationType: 'CORRECTION' },
        include: { task: { select: { status: true } } }
      },
      retests: {
        include: { execution: { select: { id: true, result: true } } },
        orderBy: { id: 'desc' }
      }
    }
  });
  if (!row || row.deletedAt) return row;
  const tasks = row.taskLinks
    .filter((l) => l.correctionCycle === row.currentCorrectionCycle)
    .map((l) => l.task);
  const pass = row.retests.find(
    (r) => r.correctionCycle === row.currentCorrectionCycle && r.execution.result === 'PASS'
  );
  const next = correctionProjection(tasks, pass?.execution.id);
  if (next.status !== row.status) {
    await tx.defect.update({
      where: { id },
      data: { status: next.status, revision: { increment: 1 } }
    });
    await tx.defectHistoryEntry.create({
      data: {
        projectId: row.projectId,
        defectId: id,
        actorUserId: actorUserId ?? null,
        action: 'STATUS_CHANGED',
        metadataJson: { from: row.status, to: next.status, reason }
      }
    });
  }
  return { ...row, ...next };
}
export async function reconcileTaskDefects(tx, taskId, actorUserId) {
  const links = await tx.defectTask.findMany({
    where: { taskId, relationType: 'CORRECTION', defect: { deletedAt: null } },
    select: {
      defectId: true,
      correctionCycle: true,
      defect: { select: { currentCorrectionCycle: true } }
    },
    orderBy: { defectId: 'asc' }
  });
  for (const id of [
    ...new Set(
      links
        .filter((l) => l.correctionCycle === l.defect.currentCorrectionCycle)
        .map((l) => l.defectId)
    )
  ])
    await reconcileDefect(tx, id, actorUserId);
}
