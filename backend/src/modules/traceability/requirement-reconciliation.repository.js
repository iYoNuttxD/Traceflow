import { prisma } from '../../database/prismaClient.js';
import { lockProject } from '../../database/locks.js';
import { loadRequirementProjections } from './requirement-projection.repository.js';
import { relatedRequirementIds } from './requirement-traceability.policy.js';

const unique = (ids) => [...new Set(ids.filter(Boolean))].sort((a, b) => a - b);
const taskLinks = { select: { relationType: true, task: { select: { requirementId: true } } } };
const caseLinks = { select: { task: { select: { requirementId: true } } } };

// Include both former and new paths. A task move can also affect tests/defects
// shared with requirements other than its own. Detection coverage is per step.
export async function affectedRequirementIds(tx, context) {
  const {
    projectId,
    requirementIds = [],
    taskIds = [],
    testCaseIds = [],
    defectIds = []
  } = context;
  const tasks = await tx.task.findMany({
    where: {
      projectId,
      OR: [{ id: { in: unique(taskIds) } }, { requirementId: { in: unique(requirementIds) } }]
    },
    select: { id: true, requirementId: true }
  });
  const allTaskIds = tasks.map((row) => row.id);
  const defects = await tx.defect.findMany({
    where: {
      projectId,
      OR: [
        { id: { in: unique(defectIds) } },
        { taskLinks: { some: { taskId: { in: allTaskIds } } } }
      ]
    },
    select: {
      requirementId: true,
      taskLinks,
      detectedStep: { select: { execution: { select: { testCaseId: true } } } }
    }
  });
  const cases = await tx.testCase.findMany({
    where: {
      projectId,
      OR: [
        {
          id: {
            in: unique([
              ...testCaseIds,
              ...defects.map((row) => row.detectedStep.execution.testCaseId)
            ])
          }
        },
        { taskLinks: { some: { taskId: { in: allTaskIds } } } }
      ]
    },
    select: { requirementId: true, taskLinks: caseLinks }
  });
  return unique([
    ...requirementIds,
    ...tasks.map((row) => row.requirementId),
    ...cases.flatMap((row) => relatedRequirementIds(row)),
    ...defects.flatMap((row) => relatedRequirementIds(row))
  ]);
}

export async function reconcileRequirements(
  tx,
  {
    projectId,
    requirementIds,
    reason = 'RECONCILIATION',
    sourceEntityType,
    sourceEntityId,
    dryRun = false
  }
) {
  // Same first lock as canonical writers, including when the state does not exist.
  if (!dryRun) await lockProject(tx, projectId);
  const rows = await loadRequirementProjections(tx, projectId, unique(requirementIds));
  const states = await tx.requirementTraceabilityState.findMany({
    where: { requirementId: { in: rows.map((row) => row.requirement.id) } }
  });
  const byId = new Map(states.map((state) => [state.requirementId, state]));
  const persisted = await tx.requirement.findMany({
    where: { id: { in: rows.map((row) => row.requirement.id) } },
    select: { id: true, status: true }
  });
  const oldStatuses = new Map(persisted.map((row) => [row.id, row.status]));
  const statusChanges = rows
    .filter((row) => oldStatuses.get(row.requirement.id) !== row.requirement.status)
    .map((row) => ({
      requirementId: row.requirement.id,
      fromStatus: oldStatuses.get(row.requirement.id),
      toStatus: row.requirement.status
    }));
  const changes = [];
  for (const row of rows.toSorted((a, b) => a.requirement.id - b.requirement.id)) {
    const requirementId = row.requirement.id;
    const state = byId.get(requirementId);
    // Repair legacy macro values even when the detailed situation has not changed.
    // A status-only synchronization must not invent a detailed history transition.
    if (!dryRun)
      await tx.requirement.updateMany({
        where: { id: requirementId, status: { not: row.requirement.status } },
        data: { status: row.requirement.status }
      });
    if (state?.currentSituation === row.situation) continue;
    const entry = {
      projectId,
      requirementId,
      fromSituation: state?.currentSituation ?? null,
      toSituation: row.situation,
      reason: state ? reason : 'BASELINE_INITIALIZED',
      sourceEntityType,
      sourceEntityId,
      metadataJson: { rulesVersion: 3 }
    };
    changes.push(entry);
    if (dryRun) continue;
    if (state)
      await tx.requirementTraceabilityState.update({
        where: { requirementId },
        data: { currentSituation: row.situation }
      });
    else
      await tx.requirementTraceabilityState.create({
        data: { requirementId, currentSituation: row.situation }
      });
    await tx.requirementTraceabilityHistoryEntry.create({ data: entry });
  }
  return {
    requirements: rows.length,
    withoutState: rows.length - states.length,
    changes,
    statusChanges
  };
}

async function resolveContext(tx, context) {
  if (context.projectId) return context;
  const [model, ids] = context.taskIds?.length
    ? ['task', context.taskIds]
    : ['requirement', context.requirementIds];
  const row = await tx[model].findUnique({ where: { id: ids[0] }, select: { projectId: true } });
  return { ...context, projectId: row?.projectId };
}

export async function traceabilityMutation(tx, context, work) {
  const scope = await resolveContext(tx, context);
  if (!scope.projectId) return work();
  await lockProject(tx, scope.projectId);
  const before = await affectedRequirementIds(tx, scope);
  const result = await work();
  if (scope.createdEntity && result?.id) {
    scope[scope.createdEntity] = [...(scope[scope.createdEntity] || []), result.id];
    scope.sourceEntityId = result.id;
  }
  const after = await affectedRequirementIds(tx, scope);
  await reconcileRequirements(tx, { ...scope, requirementIds: unique([...before, ...after]) });
  if (result?.requirement?.id && result.requirement.status !== undefined) {
    const current = await tx.requirement.findUnique({
      where: { id: result.requirement.id },
      select: { status: true }
    });
    if (current) result.requirement.status = current.status;
  }
  if (
    scope.sourceEntityType === 'Requirement' &&
    result?.id &&
    scope.reason !== 'REQUIREMENT_DELETED'
  ) {
    const current = await tx.requirement.findUnique({
      where: { id: result.id },
      select: { status: true }
    });
    if (current) return { ...result, status: current.status };
  }
  return result;
}

export function traceabilityTransaction(context, work, client = prisma) {
  return client.$transaction((tx) => traceabilityMutation(tx, context, () => work(tx)), {
    isolationLevel: 'ReadCommitted',
    timeout: 15000
  });
}

export function reconcileProject(
  projectId,
  { dryRun = true, reason = 'RECONCILIATION' } = {},
  client = prisma
) {
  return client.$transaction(
    async (tx) => {
      if (!dryRun) await lockProject(tx, projectId);
      const rows = await tx.requirement.findMany({ where: { projectId }, select: { id: true } });
      return reconcileRequirements(tx, {
        projectId,
        requirementIds: rows.map((row) => row.id),
        dryRun,
        reason
      });
    },
    { isolationLevel: dryRun ? 'RepeatableRead' : 'ReadCommitted', timeout: 15000 }
  );
}
