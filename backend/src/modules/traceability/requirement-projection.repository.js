import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prismaClient.js';
import {
  projectRequirement,
  relatedRequirementIds,
  projectRequirementSummary,
  matchesProjection,
  projectionSummary
} from './requirement-traceability.policy.js';

import { readProjectionMetrics } from './requirement-projection-summary.repository.js';

const taskMetrics = {
  id: true,
  projectId: true,
  requirementId: true,
  status: true,
  pullRequestId: true,
  _count: { select: { commitLinks: true, issueLinks: true } }
};
const linkedTasks = { select: { task: { select: taskMetrics } } };

// Relations are fetched in batches by Prisma, never by a loop over requirements/cases/defects.
// Only the latest eligible execution is fetched, not the execution history.
export async function loadRequirementProjections(client, projectId, requirementIds) {
  const requirements = await client.requirement.findMany({
    where: { projectId, ...(requirementIds ? { id: { in: requirementIds } } : {}) },
    select: {
      id: true,
      projectId: true,
      title: true,
      status: true,
      tasks: { select: taskMetrics }
    },
    orderBy: { id: 'desc' }
  });
  if (!requirements.length) return [];
  const ids = requirements.map((row) => row.id);
  const [cases, defects] = await Promise.all([
    client.testCase.findMany({
      where: {
        projectId,
        status: 'ATIVO',
        deletedAt: null,
        OR: [
          { requirementId: { in: ids } },
          { taskLinks: { some: { task: { projectId, requirementId: { in: ids } } } } }
        ]
      },
      select: {
        id: true,
        projectId: true,
        requirementId: true,
        currentVersion: true,
        status: true,
        taskLinks: linkedTasks
      }
    }),
    client.defect.findMany({
      where: {
        projectId,
        deletedAt: null,
        OR: [
          { requirementId: { in: ids } },
          {
            taskLinks: {
              some: { relationType: 'ORIGIN', task: { projectId, requirementId: { in: ids } } }
            }
          }
        ]
      },
      select: {
        id: true,
        projectId: true,
        requirementId: true,
        status: true,
        currentCorrectionCycle: true,
        taskLinks: {
          select: { relationType: true, correctionCycle: true, task: { select: taskMetrics } }
        },
        retests: { select: { correctionCycle: true }, orderBy: { id: 'desc' }, take: 1 }
      }
    })
  ]);
  const latest = cases.length
    ? await client.$queryRaw`
    SELECT e.id FROM TestCase c JOIN TestExecution e ON e.id = (
      SELECT x.id FROM TestExecution x WHERE x.testCaseId=c.id AND x.projectId=c.projectId
        AND x.testCaseVersion=c.currentVersion ORDER BY x.executedAt DESC, x.id DESC LIMIT 1
    ) WHERE c.projectId=${projectId} AND c.id IN (${Prisma.join(cases.map((row) => row.id))})`
    : [];
  const executions = latest.length
    ? await client.testExecution.findMany({
        where: { projectId, id: { in: latest.map((row) => row.id) } },
        select: {
          id: true,
          testCaseId: true,
          testCaseVersion: true,
          result: true,
          executedAt: true,
          steps: {
            where: { result: 'FAIL' },
            select: {
              id: true,
              result: true,
              detectedDefects: {
                where: { deletedAt: null, projectId },
                select: { id: true, projectId: true }
              }
            }
          }
        }
      })
    : [];
  const byCase = new Map(executions.map((row) => [row.testCaseId, row]));
  const testsByRequirement = new Map(ids.map((id) => [id, []]));
  const defectsByRequirement = new Map(ids.map((id) => [id, []]));
  for (const row of cases) {
    row.executions = byCase.has(row.id) ? [byCase.get(row.id)] : [];
    for (const id of relatedRequirementIds(row)) testsByRequirement.get(id)?.push(row);
  }
  for (const row of defects)
    for (const id of relatedRequirementIds(row, true)) defectsByRequirement.get(id)?.push(row);
  return requirements.map((row) =>
    projectRequirement(row, testsByRequirement.get(row.id), defectsByRequirement.get(row.id))
  );
}

export const PROJECTION_SUMMARY_BATCH_SIZE = 200;

function accumulateSummary(target, rows) {
  const batch = projectionSummary(rows);
  target.total += batch.total;
  target.withDefect += batch.withDefect;
  for (const key of Object.keys(target.bySituation))
    target.bySituation[key] += batch.bySituation[key];
}

async function readProjectionPage(client, projectId, q) {
  const summary = projectionSummary([]),
    filteredSummary = projectionSummary([]),
    pageIds = [];
  const offset = (q.page - 1) * q.limit;
  let cursor;
  for (;;) {
    const requirements = await client.requirement.findMany({
      where: { projectId, ...(cursor ? { id: { lt: cursor } } : {}) },
      select: { id: true, title: true },
      orderBy: { id: 'desc' },
      take: PROJECTION_SUMMARY_BATCH_SIZE
    });
    if (!requirements.length) break;
    const metrics = await readProjectionMetrics(
      client,
      projectId,
      requirements.map((row) => row.id)
    );
    const byId = new Map(metrics.map((row) => [row.id, row]));
    const rows = requirements.map((row) => projectRequirementSummary(row, byId.get(row.id)));
    const filtered = rows.filter((row) => matchesProjection(row, q));
    for (const [index, row] of filtered.entries()) {
      const position = filteredSummary.total + index;
      if (position >= offset && pageIds.length < q.limit) pageIds.push(row.requirement.id);
    }
    accumulateSummary(summary, rows);
    accumulateSummary(filteredSummary, filtered);
    if (requirements.length < PROJECTION_SUMMARY_BATCH_SIZE) break;
    cursor = requirements.at(-1).id;
  }
  return {
    items: pageIds.length ? await loadRequirementProjections(client, projectId, pageIds) : [],
    summary,
    filteredSummary,
    pagination: {
      page: q.page,
      limit: q.limit,
      total: filteredSummary.total,
      totalPages: Math.ceil(filteredSummary.total / q.limit)
    }
  };
}

export const requirementProjectionRepository = {
  readPage(projectId, query) {
    return prisma.$transaction((tx) => readProjectionPage(tx, projectId, query), {
      isolationLevel: 'RepeatableRead'
    });
  },
  read(projectId, ids) {
    return prisma.$transaction((tx) => loadRequirementProjections(tx, projectId, ids), {
      isolationLevel: 'RepeatableRead'
    });
  },
  exists(projectId, id) {
    return prisma.requirement.findFirst({ where: { projectId, id }, select: { id: true } });
  },
  history(projectId, requirementId, where, limit) {
    return prisma.requirementTraceabilityHistoryEntry.findMany({
      where: { projectId, requirementId, ...where },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1
    });
  }
};
