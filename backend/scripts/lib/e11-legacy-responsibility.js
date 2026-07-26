const DAY_MS = 86_400_000;

function normalizedEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export class E11ReconciliationBlockedError extends Error {
  constructor(blockedTaskIds) {
    super('Reconciliação E11 bloqueada: existem mapeamentos manuais ausentes ou inválidos.');
    this.code = 'E11_RECONCILIATION_BLOCKED';
    this.blockedTaskIds = [...new Set(blockedTaskIds.map(Number))].sort((a, b) => a - b);
  }
}

export function resolveMovementEvidence({ movement, users, memberships }) {
  if (movement.movedByUserId)
    return { status: 'ALREADY_RECONCILED', userId: movement.movedByUserId };
  const member = movement.projectMember;
  if (!member || member.projectId !== movement.projectId || !normalizedEmail(member.email)) {
    return { status: 'UNRESOLVED_PRESERVED' };
  }

  const email = normalizedEmail(member.email);
  const candidates = users.filter((user) => normalizedEmail(user.email) === email);
  if (candidates.length !== 1) return { status: 'UNRESOLVED_PRESERVED' };

  const user = candidates[0];
  const activeMembership = memberships.some(
    (membership) =>
      membership.projectId === movement.projectId &&
      membership.userId === user.id &&
      membership.isActive === true
  );
  return activeMembership
    ? { status: 'RECONCILABLE', userId: user.id }
    : { status: 'UNRESOLVED_PRESERVED' };
}

export function buildTaskMappingFile({ tasks, memberships, previousMappings = [] }) {
  const selectedByTask = new Map(
    previousMappings.map((entry) => [Number(entry.taskId), entry.selectedUserId ?? null])
  );
  return {
    mappings: tasks
      .filter((task) => task.responsible && !task.responsibleUserId)
      .sort((a, b) => a.id - b.id)
      .map((task) => ({
        taskId: task.id,
        projectId: task.projectId,
        legacyResponsible: task.responsible,
        selectedUserId: selectedByTask.get(task.id) ?? null,
        candidateMemberships: memberships
          .filter((membership) => membership.projectId === task.projectId && membership.isActive)
          .map((membership) => ({
            userId: membership.userId,
            role: membership.role,
            name: membership.user.name,
            email: membership.user.email
          }))
      }))
  };
}

export function validateTaskMappings({ tasks, mappings, memberships }) {
  const mappingByTask = new Map();
  const blocked = [];

  for (const entry of mappings || []) {
    const taskId = positiveInteger(entry.taskId);
    if (!taskId || mappingByTask.has(taskId)) {
      if (taskId) blocked.push(taskId);
      continue;
    }
    mappingByTask.set(taskId, entry);
  }

  const plan = [];
  for (const task of tasks.filter((item) => item.responsible && !item.responsibleUserId)) {
    const entry = mappingByTask.get(task.id);
    const selectedUserId = positiveInteger(entry?.selectedUserId);
    const valid =
      entry &&
      Number(entry.projectId) === task.projectId &&
      selectedUserId &&
      memberships.some(
        (membership) =>
          membership.projectId === task.projectId &&
          membership.userId === selectedUserId &&
          membership.isActive === true
      );
    if (!valid) blocked.push(task.id);
    else plan.push({ taskId: task.id, projectId: task.projectId, userId: selectedUserId });
  }

  for (const [taskId, entry] of mappingByTask) {
    const task = tasks.find((item) => item.id === taskId);
    const selectedUserId = positiveInteger(entry.selectedUserId);
    if (!task || Number(entry.projectId) !== task.projectId || !selectedUserId) {
      blocked.push(taskId);
      continue;
    }
    if (task.responsibleUserId && task.responsibleUserId !== selectedUserId) blocked.push(taskId);
  }

  return {
    plan,
    blockedTaskIds: [...new Set(blocked)].sort((a, b) => a - b)
  };
}

function safeTaskStatus(task) {
  if (task.responsible && !task.responsibleUserId) return 'MANUAL_MAPPING_REQUIRED';
  if (task.responsible && task.responsibleUserId) return 'CANONICAL_WITH_LEGACY_SNAPSHOT';
  if (task.responsibleUserId) return 'CANONICAL';
  return 'UNASSIGNED';
}

export function buildE11Audit({ tasks, movements, users, memberships }) {
  const movementResults = movements.map((movement) => ({
    movement,
    resolution: resolveMovementEvidence({ movement, users, memberships })
  }));
  const textOnlyTasks = tasks.filter((task) => task.responsible && !task.responsibleUserId);
  const tasksWithBoth = tasks.filter((task) => task.responsible && task.responsibleUserId);
  const divergent = tasksWithBoth.filter(
    (task) => task.responsibleUser && task.responsible.trim() !== task.responsibleUser.name.trim()
  );

  return {
    counts: {
      tasksTextOnly: textOnlyTasks.length,
      tasksWithResponsibleUserId: tasks.filter((task) => task.responsibleUserId).length,
      tasksWithTextAndId: tasksWithBoth.length,
      tasksPotentialDivergence: divergent.length,
      movementsTextOnly: movements.filter((movement) => movement.movedBy && !movement.movedByUserId)
        .length,
      movementsWithProjectMemberId: movements.filter((movement) => movement.projectMemberId).length,
      movementsWithMovedByUserId: movements.filter((movement) => movement.movedByUserId).length,
      movementsReconciliable: movementResults.filter(
        ({ resolution }) => resolution.status === 'RECONCILABLE'
      ).length,
      movementsUnresolved: movementResults.filter(
        ({ resolution }) => resolution.status === 'UNRESOLVED_PRESERVED'
      ).length
    },
    tasks: tasks
      .filter((task) => task.responsible || task.responsibleUserId)
      .map((task) => ({
        taskId: task.id,
        projectId: task.projectId,
        status: safeTaskStatus(task)
      })),
    movements: movementResults.map(({ movement, resolution }) => ({
      movementId: movement.id,
      projectId: movement.projectId,
      status: resolution.status
    })),
    movementPlan: movementResults
      .filter(({ resolution }) => resolution.status === 'RECONCILABLE')
      .map(({ movement, resolution }) => ({
        movementId: movement.id,
        projectId: movement.projectId,
        projectMemberId: movement.projectMemberId,
        userId: resolution.userId
      }))
  };
}

export async function loadE11LegacyState(client) {
  const [tasks, movements, users, memberships] = await Promise.all([
    client.task.findMany({
      select: {
        id: true,
        projectId: true,
        responsible: true,
        responsibleUserId: true,
        responsibleUser: { select: { name: true } }
      },
      orderBy: { id: 'asc' }
    }),
    client.taskMovement.findMany({
      select: {
        id: true,
        projectId: true,
        movedBy: true,
        projectMemberId: true,
        movedByUserId: true,
        projectMember: { select: { projectId: true, email: true } }
      },
      orderBy: { id: 'asc' }
    }),
    client.user.findMany({ select: { id: true, email: true } }),
    client.projectMembership.findMany({
      select: {
        projectId: true,
        userId: true,
        role: true,
        isActive: true,
        user: { select: { name: true, email: true } }
      }
    })
  ]);
  return { tasks, movements, users, memberships };
}

export async function auditE11LegacyResponsibilities({ client }) {
  const state = await loadE11LegacyState(client);
  const audit = buildE11Audit(state);
  return { state, audit };
}

function maintenanceAuditEvent({
  projectId,
  action,
  resourceType,
  resourceId,
  metadata,
  retentionDays
}) {
  return {
    actorUserId: null,
    actorType: 'SYSTEM',
    projectId,
    action,
    resourceType,
    resourceId: String(resourceId),
    result: 'SUCCESS',
    reasonCode: 'E11_LEGACY_RECONCILIATION',
    requestId: null,
    metadataJson: metadata,
    retentionUntil: new Date(Date.now() + retentionDays * DAY_MS)
  };
}

export async function runE11LegacyReconciliation({
  client,
  mappings = [],
  apply = false,
  auditRetentionDays = 365
}) {
  const { state, audit } = await auditE11LegacyResponsibilities({ client });
  const taskValidation = validateTaskMappings({
    tasks: state.tasks,
    mappings,
    memberships: state.memberships
  });
  const report = {
    mode: apply ? 'apply' : 'dry-run',
    before: audit.counts,
    pending: {
      tasks: taskValidation.plan.length,
      movements: audit.movementPlan.length
    },
    blockedTaskIds: taskValidation.blockedTaskIds,
    taskIds: taskValidation.plan.map((item) => item.taskId),
    movementIds: audit.movementPlan.map((item) => item.movementId),
    unresolvedMovementIds: audit.movements
      .filter((item) => item.status === 'UNRESOLVED_PRESERVED')
      .map((item) => item.movementId),
    applied: { tasks: 0, movements: 0 }
  };

  if (!apply) return report;
  if (taskValidation.blockedTaskIds.length)
    throw new E11ReconciliationBlockedError(taskValidation.blockedTaskIds);

  let appliedMovements = 0;
  await client.$transaction(async (tx) => {
    for (const item of taskValidation.plan) {
      const task = await tx.task.findUnique({
        where: { id: item.taskId },
        select: { projectId: true, responsibleUserId: true }
      });
      const membership = await tx.projectMembership.findFirst({
        where: { projectId: item.projectId, userId: item.userId, isActive: true },
        select: { id: true }
      });
      if (!task || task.projectId !== item.projectId || task.responsibleUserId || !membership) {
        throw new E11ReconciliationBlockedError([item.taskId]);
      }
      await tx.task.update({
        where: { id: item.taskId },
        data: { responsibleUserId: item.userId }
      });
      await tx.auditEvent.create({
        data: maintenanceAuditEvent({
          projectId: item.projectId,
          action: 'TASK_RESPONSIBILITY_RECONCILED',
          resourceType: 'Task',
          resourceId: item.taskId,
          metadata: { taskId: item.taskId },
          retentionDays: auditRetentionDays
        })
      });
    }

    for (const item of audit.movementPlan) {
      const movement = await tx.taskMovement.findUnique({
        where: { id: item.movementId },
        select: {
          id: true,
          projectId: true,
          movedByUserId: true,
          projectMemberId: true,
          projectMember: { select: { projectId: true, email: true } }
        }
      });
      if (
        !movement ||
        movement.projectId !== item.projectId ||
        movement.movedByUserId ||
        movement.projectMemberId !== item.projectMemberId
      )
        continue;
      const [users, memberships] = await Promise.all([
        tx.user.findMany({ select: { id: true, email: true } }),
        tx.projectMembership.findMany({
          where: { projectId: item.projectId, isActive: true },
          select: { projectId: true, userId: true, isActive: true }
        })
      ]);
      const resolution = resolveMovementEvidence({ movement, users, memberships });
      if (resolution.status !== 'RECONCILABLE' || resolution.userId !== item.userId) continue;
      await tx.taskMovement.update({
        where: { id: item.movementId },
        data: { movedByUserId: item.userId }
      });
      appliedMovements += 1;
      await tx.auditEvent.create({
        data: maintenanceAuditEvent({
          projectId: item.projectId,
          action: 'TASK_MOVEMENT_ACTOR_RECONCILED',
          resourceType: 'TaskMovement',
          resourceId: item.movementId,
          metadata: { count: 1 },
          retentionDays: auditRetentionDays
        })
      });
    }
  });

  const after = (await auditE11LegacyResponsibilities({ client })).audit.counts;
  return {
    ...report,
    applied: { tasks: taskValidation.plan.length, movements: appliedMovements },
    after
  };
}
