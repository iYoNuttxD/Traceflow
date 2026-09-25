const canCapture = (sprint) =>
  sprint?.status === 'EM_ANDAMENTO' && sprint.burnupCoverageStartedAt != null;

export async function captureBurnupBaseline(tx, sprint, tasks, occurredAt) {
  if (!tasks.length) return;
  await tx.sprintBurnupEvent.createMany({
    data: tasks.map((task) => ({
      projectId: sprint.projectId,
      sprintId: sprint.id,
      taskKey: task.id,
      type: 'BASELINE_TASK',
      newPoints: task.estimatedEffort,
      toStatus: task.status,
      occurredAt
    }))
  });
}

export async function captureBurnupScope(tx, sprint, plan) {
  const closing = plan.close.length
    ? await tx.sprintTask.findMany({
        where: { id: { in: plan.close.map((row) => row.id) } },
        select: {
          id: true,
          projectId: true,
          sprintId: true,
          taskId: true,
          sprint: { select: { status: true, burnupCoverageStartedAt: true } },
          task: { select: { estimatedEffort: true, status: true } }
        }
      })
    : [];
  const closingById = new Map(closing.map((row) => [row.id, row]));
  const openingIds = plan.open.map((row) => row.taskId);
  const openingTasks = openingIds.length
    ? await tx.task.findMany({
        where: { id: { in: openingIds }, projectId: sprint.projectId },
        select: { id: true, estimatedEffort: true, status: true }
      })
    : [];
  const openingById = new Map(openingTasks.map((row) => [row.id, row]));
  const events = [];
  for (const change of plan.close) {
    const row = closingById.get(change.id);
    if (!row || !row.taskId || !row.task || !canCapture(row.sprint)) continue;
    events.push({
      projectId: row.projectId,
      sprintId: row.sprintId,
      taskKey: row.taskId,
      type: 'TASK_REMOVED',
      previousPoints: row.task.estimatedEffort,
      fromStatus: change.exitStatus ?? row.task.status,
      occurredAt: change.at
    });
  }
  if (canCapture(sprint)) {
    for (const change of plan.open) {
      const task = openingById.get(change.taskId);
      if (!task) throw new Error('Burnup scope entry requires a project-scoped Task');
      events.push({
        projectId: sprint.projectId,
        sprintId: sprint.id,
        taskKey: task.id,
        type: 'TASK_ADDED',
        newPoints: task.estimatedEffort,
        toStatus: task.status,
        occurredAt: change.addedAt
      });
    }
  }
  if (events.length) await tx.sprintBurnupEvent.createMany({ data: events });
}

export async function captureBurnupEstimate(tx, task, newPoints, occurredAt) {
  if (task.estimatedEffort === newPoints || task.sprintId == null) return;
  const participation = await tx.sprintTask.findFirst({
    where: { sprintId: task.sprintId, taskId: task.id, removedAt: null, closedAt: null },
    select: {
      sprint: {
        select: { projectId: true, status: true, burnupCoverageStartedAt: true }
      }
    }
  });
  if (!canCapture(participation?.sprint) || participation.sprint.projectId !== task.projectId)
    return;
  await tx.sprintBurnupEvent.create({
    data: {
      projectId: task.projectId,
      sprintId: task.sprintId,
      taskKey: task.id,
      type: 'ESTIMATE_CHANGED',
      previousPoints: task.estimatedEffort,
      newPoints,
      occurredAt
    }
  });
}

export async function captureBurnupStatus(tx, task, toStatus, occurredAt) {
  if (task.sprintId == null) return;
  const participation = await tx.sprintTask.findFirst({
    where: { sprintId: task.sprintId, taskId: task.id, removedAt: null, closedAt: null },
    select: {
      sprint: {
        select: { projectId: true, status: true, burnupCoverageStartedAt: true }
      }
    }
  });
  if (!canCapture(participation?.sprint) || participation.sprint.projectId !== task.projectId)
    return;
  await tx.sprintBurnupEvent.create({
    data: {
      projectId: task.projectId,
      sprintId: task.sprintId,
      taskKey: task.id,
      type: 'STATUS_CHANGED',
      fromStatus: task.status,
      toStatus,
      occurredAt
    }
  });
}
