import { prisma } from '../../../database/prismaClient.js';
const prSelect = { id: true, number: true, title: true, state: true, githubUrl: true };
const commitSelect = {
  id: true,
  hash: true,
  message: true,
  authorName: true,
  date: true,
  githubUrl: true
};
export function createTestExecutionRepository(client = prisma) {
  return {
    reference(projectId, type, id) {
      return type === 'PULL_REQUEST'
        ? client.pullRequest.findFirst({ where: { id, projectId }, select: prSelect })
        : client.commit.findFirst({ where: { id, projectId }, select: commitSelect });
    },
    create(data, steps) {
      return client.testExecution.create({
        data: { ...data, steps: { create: steps } },
        include: { steps: { orderBy: { position: 'asc' } } }
      });
    },
    addEvidence(data) {
      return client.testEvidence.createMany({ data });
    },
    find(id) {
      return client.testExecution.findUnique({
        where: { id },
        include: {
          version: true,
          steps: {
            orderBy: { position: 'asc' },
            include: {
              detectedDefects: {
                where: { deletedAt: null },
                select: { id: true, title: true, severity: true, status: true }
              }
            }
          },
          evidence: { orderBy: { id: 'asc' } }
        }
      });
    },
    evidence(id) {
      return client.testEvidence.findUnique({ where: { id } });
    },
    page(testCaseId, where, limit) {
      return client.testExecution.findMany({
        where: { testCaseId, ...where },
        orderBy: [{ executedAt: 'desc' }, { id: 'desc' }],
        take: limit + 1
      });
    },
    async candidates(testCaseId, projectId, search, limit, priorityTaskIds) {
      const linkedTask = priorityTaskIds
        ? { projectId, id: { in: priorityTaskIds } }
        : { projectId, testCaseLinks: { some: { testCaseId } } };
      const relatedPr = { tasks: { some: linkedTask } };
      const relatedCommit = { taskLinks: { some: { task: linkedTask } } };
      const prSearch = search
        ? {
            OR: [
              { title: { contains: search } },
              ...(/^#?\d+$/.test(search) ? [{ number: Number(search.replace('#', '')) }] : [])
            ]
          }
        : {};
      const commitSearch = search
        ? { OR: [{ hash: { contains: search } }, { message: { contains: search } }] }
        : {};
      const prSelection = {
        ...prSelect,
        tasks: { where: linkedTask, select: { id: true }, orderBy: { id: 'asc' }, take: 100 }
      };
      const commitSelection = {
        ...commitSelect,
        taskLinks: {
          where: { task: linkedTask },
          select: { taskId: true },
          orderBy: { taskId: 'asc' },
          take: 100
        }
      };
      const queries = [
        client.pullRequest.findMany({
          where: { projectId, ...relatedPr, ...prSearch },
          select: prSelection,
          orderBy: { id: 'desc' },
          take: limit
        }),
        client.commit.findMany({
          where: { projectId, ...relatedCommit, ...commitSearch },
          select: commitSelection,
          orderBy: { id: 'desc' },
          take: limit
        })
      ];
      if (search || priorityTaskIds)
        queries.push(
          client.pullRequest.findMany({
            where: { projectId, NOT: relatedPr, ...prSearch },
            select: prSelection,
            orderBy: { id: 'desc' },
            take: limit
          }),
          client.commit.findMany({
            where: { projectId, NOT: relatedCommit, ...commitSearch },
            select: commitSelection,
            orderBy: { id: 'desc' },
            take: limit
          })
        );
      const rows = await Promise.all(queries);
      return rows
        .flatMap((items, i) =>
          items.map((ref) => ({
            type: i % 2 === 0 ? 'PULL_REQUEST' : 'COMMIT',
            ref,
            relatedTaskIds:
              i % 2 === 0 ? ref.tasks.map((t) => t.id) : ref.taskLinks.map((t) => t.taskId)
          }))
        )
        .slice(0, limit);
    }
  };
}
export const testExecutionRepository = createTestExecutionRepository();
