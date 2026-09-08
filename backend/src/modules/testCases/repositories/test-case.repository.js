import { auditRepository } from '../../audit/audit.repository.js';
import { Prisma } from '@prisma/client';
import { createTestExecutionRepository } from './test-execution.repository.js';
import { prisma } from '../../../database/prismaClient.js';

const identity = { id: true, name: true };
const title = { id: true, title: true };
const detail = {
  responsibleUser: { select: identity },
  requirement: { select: title },
  steps: { orderBy: { position: 'asc' } },
  taskLinks: { include: { task: { select: title } }, orderBy: { taskId: 'asc' } },
  executions: { orderBy: [{ executedAt: 'desc' }, { id: 'desc' }], take: 1 }
};
const latestJoin = Prisma.sql`LEFT JOIN TestExecution e ON e.id = (SELECT e2.id FROM TestExecution e2 WHERE e2.testCaseId = c.id ORDER BY e2.executedAt DESC, e2.id DESC LIMIT 1)`;
export function createTestCaseRepository(client = prisma) {
  return {
    executions: createTestExecutionRepository(client),
    transaction(work) {
      return client.$transaction((tx) => work(createTestCaseRepository(tx)), {
        isolationLevel: 'ReadCommitted',
        timeout: 15000
      });
    },
    async lock(id) {
      await client.$queryRaw`SELECT id FROM TestCase WHERE id = ${id} FOR UPDATE`;
      return this.find(id);
    },
    find(id) {
      return client.testCase.findFirst({ where: { id, deletedAt: null }, include: detail });
    },
    project(id) {
      return client.project.findUnique({ where: { id }, select: { id: true } });
    },
    membership(projectId, userId) {
      return client.projectMembership.findFirst({
        where: { projectId, userId, isActive: true },
        include: { user: { select: identity } }
      });
    },
    requirement(projectId, id) {
      return client.requirement.findFirst({ where: { id, projectId }, select: title });
    },
    tasks(projectId, ids) {
      return client.task.findMany({
        where: { id: { in: ids }, projectId },
        select: title,
        orderBy: { id: 'asc' }
      });
    },
    create(data, steps, taskIds) {
      return client.testCase.create({
        data: {
          ...data,
          steps: { create: steps.map((s, i) => ({ ...s, position: i + 1 })) },
          taskLinks: { create: taskIds.map((taskId) => ({ taskId })) }
        },
        include: detail
      });
    },
    async update(id, data, steps, taskIds) {
      if (steps) {
        await client.testCaseStep.deleteMany({ where: { testCaseId: id } });
        await client.testCaseStep.createMany({
          data: steps.map((s, i) => ({
            testCaseId: id,
            position: i + 1,
            action: s.action,
            expectedResult: s.expectedResult
          }))
        });
      }
      if (taskIds) {
        await client.testCaseTask.deleteMany({ where: { testCaseId: id } });
        if (taskIds.length)
          await client.testCaseTask.createMany({
            data: taskIds.map((taskId) => ({ testCaseId: id, taskId }))
          });
      }
      return client.testCase.update({ where: { id }, data, include: detail });
    },
    version(data) {
      return client.testCaseVersion.create({ data });
    },
    currentVersion(testCaseId, version) {
      return client.testCaseVersion.findUnique({
        where: { testCaseId_version: { testCaseId, version } }
      });
    },
    history(data) {
      return client.testCaseHistoryEntry.create({ data });
    },
    audit(data) {
      return auditRepository.create(data, client);
    },
    async list(projectId, q) {
      const filters = [Prisma.sql`c.projectId = ${projectId}`, Prisma.sql`c.deletedAt IS NULL`];
      if (q.status) filters.push(Prisma.sql`c.status = ${q.status}`);
      if (q.responsibleUserId)
        filters.push(Prisma.sql`c.responsibleUserId = ${q.responsibleUserId}`);
      if (q.requirementId) filters.push(Prisma.sql`c.requirementId = ${q.requirementId}`);
      if (q.taskId)
        filters.push(
          Prisma.sql`EXISTS (SELECT 1 FROM TestCaseTask t WHERE t.testCaseId=c.id AND t.taskId=${q.taskId})`
        );
      if (q.latestResult === 'NEVER_EXECUTED') filters.push(Prisma.sql`e.id IS NULL`);
      else if (q.latestResult) filters.push(Prisma.sql`e.result = ${q.latestResult}`);
      if (q.search) {
        const id = /^TC-(\d+)$/i.exec(q.search);
        filters.push(
          id ? Prisma.sql`c.id = ${Number(id[1])}` : Prisma.sql`LOCATE(${q.search}, c.title) > 0`
        );
      }
      const where = Prisma.join(filters, ' AND ');
      const [ids, total, summary] = await Promise.all([
        client.$queryRaw`SELECT c.id FROM TestCase c ${latestJoin} WHERE ${where} ORDER BY c.createdAt DESC,c.id DESC LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}`,
        client.$queryRaw`SELECT COUNT(*) AS total FROM TestCase c ${latestJoin} WHERE ${where}`,
        client.$queryRaw`SELECT COUNT(*) AS total, COALESCE(SUM(c.status='ATIVO'),0) AS active, COALESCE(SUM(c.requirementId IS NULL AND NOT EXISTS(SELECT 1 FROM TestCaseTask t WHERE t.testCaseId=c.id)),0) AS withoutTraceability, COALESCE(SUM(e.id IS NULL),0) AS neverExecuted, COALESCE(SUM(e.result='FAIL'),0) AS withFailure FROM TestCase c ${latestJoin} WHERE c.projectId=${projectId} AND c.deletedAt IS NULL`
      ]);
      const items = ids.length
        ? await client.testCase.findMany({
            where: { id: { in: ids.map((r) => r.id) } },
            include: {
              responsibleUser: { select: identity },
              requirement: { select: title },
              _count: { select: { taskLinks: true } },
              executions: detail.executions
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
          })
        : [];
      return {
        items,
        total: Number(total[0].total),
        summary: Object.fromEntries(Object.entries(summary[0]).map(([k, v]) => [k, Number(v)]))
      };
    },
    versions(testCaseId, q) {
      return Promise.all([
        client.testCaseVersion.findMany({
          where: { testCaseId },
          orderBy: { version: 'desc' },
          skip: (q.page - 1) * q.limit,
          take: q.limit
        }),
        client.testCaseVersion.count({ where: { testCaseId } })
      ]);
    },
    historyPage(testCaseId, where, limit) {
      return client.testCaseHistoryEntry.findMany({
        where: { testCaseId, ...where },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: limit + 1
      });
    }
  };
}
export const testCaseRepository = createTestCaseRepository();
