import { traceabilityMutation } from '../../traceability/requirement-reconciliation.repository.js';
import { prisma } from '../../../database/prismaClient.js';
import { lockProject } from '../../../database/locks.js';
import { auditRepository } from '../../audit/audit.repository.js';
import { createTaskInTransaction } from '../../tasks/task.repository.js';
import { reconcileDefect } from './defect-projection.repository.js';
const searchId = (value) => (Number(value) <= 2147483647 ? Number(value) : 0);
const identity = { id: true, name: true };
const title = { id: true, title: true };
const evidence = {
  id: true,
  executionId: true,
  executionStepId: true,
  scope: true,
  kind: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  sha256: true
};
const detectionInclude = {
  evidence: { select: evidence },
  execution: {
    include: {
      version: true,
      evidence: { select: evidence },
      testCase: { select: { id: true, projectId: true } }
    }
  },
  detectedDefects: {
    where: { deletedAt: null },
    select: { id: true, title: true, severity: true, status: true }
  }
};
const include = {
  responsibleUser: { select: identity },
  requirement: { select: title },
  detectedStep: { include: detectionInclude },
  taskLinks: {
    include: {
      task: {
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          responsibleUser: { select: identity },
          requirementId: true,
          pullRequestId: true,
          commitLinks: { select: { commitId: true } }
        }
      }
    },
    orderBy: [{ correctionCycle: 'asc' }, { id: 'asc' }]
  },
  retests: {
    include: {
      execution: {
        select: {
          id: true,
          result: true,
          testCaseVersion: true,
          executedAt: true,
          environment: true,
          executedByDisplayNameSnapshot: true,
          testedReferenceSnapshot: true
        }
      }
    },
    orderBy: { id: 'desc' }
  },
  _count: { select: { history: true } }
};
export function createDefectRepository(client = prisma) {
  return {
    transaction(work, traceability) {
      return client.$transaction(
        (tx) =>
          traceability
            ? traceabilityMutation(tx, traceability, () => work(createDefectRepository(tx)))
            : work(createDefectRepository(tx)),
        {
          isolationLevel: 'ReadCommitted',
          timeout: 15000
        }
      );
    },
    lockProject(id) {
      return lockProject(client, id);
    },
    async lock(id) {
      await client.$queryRaw`SELECT id FROM Defect WHERE id = ${id} FOR UPDATE`;
      return this.find(id);
    },
    find(id) {
      return client.defect.findFirst({ where: { id, deletedAt: null }, include });
    },
    membership(projectId, userId) {
      return client.projectMembership.findFirst({
        where: { projectId, userId, isActive: true },
        include: { user: { select: identity } }
      });
    },
    project(id) {
      return client.project.findUnique({ where: { id }, select: { id: true } });
    },
    requirement(projectId, id) {
      return client.requirement.findFirst({ where: { id, projectId }, select: title });
    },
    tasks(projectId, ids) {
      return client.task.findMany({
        where: { id: { in: ids }, projectId },
        select: { ...title, status: true },
        orderBy: { id: 'asc' }
      });
    },
    detection(id) {
      return client.testExecutionStep.findUnique({ where: { id }, include: detectionInclude });
    },
    create(data, originTaskIds) {
      return client.defect.create({
        data: {
          ...data,
          taskLinks: {
            create: originTaskIds.map((taskId) => ({
              taskId,
              relationType: 'ORIGIN',
              correctionCycle: 0
            }))
          }
        },
        include
      });
    },
    async update(id, data, originTaskIds) {
      if (originTaskIds) {
        await client.defectTask.deleteMany({ where: { defectId: id, relationType: 'ORIGIN' } });
        if (originTaskIds.length)
          await client.defectTask.createMany({
            data: originTaskIds.map((taskId) => ({
              defectId: id,
              taskId,
              relationType: 'ORIGIN',
              correctionCycle: 0
            }))
          });
      }
      return client.defect.update({
        where: { id },
        data: { ...data, revision: { increment: 1 } },
        include
      });
    },
    history(data) {
      return client.defectHistoryEntry.create({ data });
    },
    audit(data) {
      return auditRepository.create(data, client);
    },
    reconcile(id, actorUserId, reason) {
      return reconcileDefect(client, id, actorUserId, reason);
    },
    link(defectId, taskId, correctionCycle) {
      return client.defectTask.create({
        data: { defectId, taskId, relationType: 'CORRECTION', correctionCycle }
      });
    },
    createTask(projectId, data, audit, calculateStatus) {
      return createTaskInTransaction(client, projectId, data, audit, calculateStatus);
    },
    taskLookup: {
      findProjectById: (id) => client.project.findUnique({ where: { id } }),
      findRequirementById: (id) =>
        client.requirement.findUnique({ where: { id }, select: { id: true, projectId: true } }),
      findActiveMembership: (projectId, userId) =>
        client.projectMembership.findFirst({ where: { projectId, userId, isActive: true } })
    },
    addRetest(defectId, testExecutionId, correctionCycle) {
      return client.defectRetest.create({ data: { defectId, testExecutionId, correctionCycle } });
    },
    async historyPage(defectId, q) {
      const where = { defectId };
      const [items, total] = await Promise.all([
        client.defectHistoryEntry.findMany({
          where,
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          skip: (q.page - 1) * q.limit,
          take: q.limit
        }),
        client.defectHistoryEntry.count({ where })
      ]);
      return { items, total, ...q };
    },
    async retestsPage(defectId, q) {
      const where = { defectId };
      const [items, total] = await Promise.all([
        client.defectRetest.findMany({
          where,
          include: {
            execution: {
              select: {
                id: true,
                result: true,
                testCaseVersion: true,
                executedAt: true,
                testedReferenceSnapshot: true
              }
            }
          },
          orderBy: { id: 'desc' },
          skip: (q.page - 1) * q.limit,
          take: q.limit
        }),
        client.defectRetest.count({ where })
      ]);
      return { items, total, ...q };
    },
    async list(projectId, q) {
      const where = { projectId, deletedAt: null };
      for (const field of ['status', 'severity', 'responsibleUserId', 'requirementId'])
        if (q[field]) where[field] = q[field];
      const and = [];
      for (const [field, relationType] of [
        ['originTaskId', 'ORIGIN'],
        ['correctionTaskId', 'CORRECTION']
      ])
        if (q[field]) and.push({ taskLinks: { some: { taskId: q[field], relationType } } });
      if (and.length) where.AND = and;
      if (q.testCaseId) where.detectedStep = { execution: { testCaseId: q.testCaseId } };
      if (q.search) {
        const match = /^DEF-(\d+)$/i.exec(q.search);
        if (match) where.id = searchId(match[1]);
        else where.title = { contains: q.search };
      }
      const [items, total, groups] = await Promise.all([
        client.defect.findMany({
          where,
          include: {
            responsibleUser: { select: identity },
            requirement: { select: title },
            detectedStep: {
              select: { position: true, execution: { select: { id: true, testCaseId: true } } }
            },
            taskLinks: {
              where: { relationType: 'CORRECTION' },
              select: {
                correctionCycle: true,
                task: { select: { id: true, status: true } }
              }
            }
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (q.page - 1) * q.limit,
          take: q.limit
        }),
        client.defect.count({ where }),
        client.defect.groupBy({
          by: ['status'],
          where: { projectId, deletedAt: null },
          _count: true
        })
      ]);
      const summary = { total: 0, ABERTO: 0, EM_CORRECAO: 0, AGUARDANDO_RETESTE: 0, VALIDADO: 0 };
      for (const row of groups) {
        summary[row.status] = row._count;
        summary.total += row._count;
      }
      return { items, total, summary, page: q.page, limit: q.limit };
    },
    async candidates(projectId, q) {
      const where = { result: 'FAIL', execution: { projectId } };
      if (q.search) {
        const match = /^(EXEC|TC)-(\d+)$/i.exec(q.search);
        if (match) {
          if (match[1].toUpperCase() === 'EXEC') where.executionId = searchId(match[2]);
          else where.execution.testCaseId = searchId(match[2]);
        } else
          where.OR = [
            { observedResult: { contains: q.search } },
            {
              execution: {
                version: { snapshotJson: { path: '$.title', string_contains: q.search } }
              }
            }
          ];
      }
      const [items, total] = await Promise.all([
        client.testExecutionStep.findMany({
          where,
          include: detectionInclude,
          orderBy: { id: 'desc' },
          skip: (q.page - 1) * q.limit,
          take: q.limit
        }),
        client.testExecutionStep.count({ where })
      ]);
      return { items, total, page: q.page, limit: q.limit };
    }
  };
}
export const defectRepository = createDefectRepository();
