import { traceabilityTransaction } from '../traceability/requirement-reconciliation.repository.js';
import { lockActiveProject } from '../projects/active-project-write.js';
import { AppError } from '../../shared/errors/index.js';
// Repository do modulo de tarefas. Todo acesso ao banco passa pelo Prisma.
import { prisma } from '../../database/prismaClient.js';
import { auditRepository } from '../audit/audit.repository.js';
import { captureBurnupEstimate, captureBurnupScope } from '../sprints/sprint-burnup.events.js';

const pullRequestSelect = {
  id: true,
  number: true,
  title: true,
  state: true,
  authorUsername: true,
  githubUrl: true,
  createdAtGithub: true
};

const taskCommitSelect = {
  id: true,
  hash: true,
  message: true,
  authorName: true,
  authorUsername: true,
  date: true,
  githubUrl: true,
  branchLinks: {
    select: { branch: { select: { name: true } } },
    orderBy: { branch: { name: 'asc' } }
  }
};

const taskIssueSelect = {
  id: true,
  number: true,
  title: true,
  state: true,
  authorUsername: true,
  labels: true,
  githubUrl: true,
  createdAtGithub: true,
  closedAtGithub: true
};

const taskRequirementSelect = {
  id: true,
  title: true,
  type: true,
  status: true
};

export const taskInclude = {
  defectLinks: {
    where: { relationType: 'CORRECTION' },
    select: { defect: { select: { id: true, title: true, status: true, deletedAt: true } } }
  },
  responsibleUser: { select: { id: true, name: true } },
  // Sessão de tempo em andamento (S1-06): o cartão do Kanban mostra o cronômetro
  // sem uma consulta por tarefa.
  timeEntries: {
    where: { endedAt: null },
    select: { id: true, startedAt: true, startedBy: { select: { id: true, name: true } } },
    take: 1
  },
  requirement: {
    select: taskRequirementSelect
  },
  pullRequest: {
    select: pullRequestSelect
  },
  commitLinks: {
    select: {
      commit: {
        select: taskCommitSelect
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  },
  issueLinks: {
    select: {
      issue: {
        select: taskIssueSelect
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  }
};

export async function createTaskInTransaction(tx, projectId, data, auditEvent) {
  const task = await tx.task.create({ data: { ...data, projectId }, include: taskInclude });
  if (auditEvent) await auditRepository.create({ ...auditEvent, resourceId: String(task.id) }, tx);
  return task;
}

export const taskRepository = {
  async findActiveMembership(projectId, userId) {
    return prisma.projectMembership.findFirst({ where: { projectId, userId, isActive: true } });
  },
  async findProjectById(projectId) {
    return prisma.project.findUnique({
      where: { id: projectId }
    });
  },

  async createTaskAtomic(projectId, data, auditEvent) {
    return traceabilityTransaction(
      {
        projectId,
        requirementIds: [data.requirementId],
        reason: 'TASK_CREATED',
        sourceEntityType: 'Task',
        createdEntity: 'taskIds'
      },
      (tx) => createTaskInTransaction(tx, projectId, data, auditEvent)
    );
  },

  async findTasksByProject(projectId, filters = {}) {
    const search = typeof filters.search === 'string' ? filters.search.trim() : '';

    return prisma.task.findMany({
      where: {
        projectId,
        ...(search
          ? {
              OR: [
                { title: { contains: search } },
                { responsible: { contains: search } },
                { status: { contains: search } }
              ]
            }
          : {})
      },
      include: taskInclude,
      orderBy: { createdAt: 'desc' }
    });
  },

  async findTaskById(id) {
    return prisma.task.findUnique({
      where: { id },
      include: taskInclude
    });
  },

  async findPullRequestById(id) {
    return prisma.pullRequest.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true
      }
    });
  },

  async findRequirementById(id) {
    return prisma.requirement.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true
      }
    });
  },

  async findCommitById(id) {
    return prisma.commit.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true
      }
    });
  },

  async findIssueById(id) {
    return prisma.issue.findUnique({
      where: { id },
      select: {
        id: true,
        projectId: true
      }
    });
  },

  async findTaskCommit(taskId, commitId) {
    return prisma.taskCommit.findUnique({
      where: {
        taskId_commitId: {
          taskId,
          commitId
        }
      }
    });
  },

  async findTaskCommits(taskId) {
    const links = await prisma.taskCommit.findMany({
      where: { taskId },
      select: {
        commit: {
          select: taskCommitSelect
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return links.map((link) => link.commit);
  },

  async findTaskIssue(taskId, issueId) {
    return prisma.taskIssue.findUnique({
      where: {
        taskId_issueId: {
          taskId,
          issueId
        }
      }
    });
  },

  async findTaskIssues(taskId) {
    const links = await prisma.taskIssue.findMany({
      where: { taskId },
      select: {
        issue: {
          select: taskIssueSelect
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return links.map((link) => link.issue);
  },

  async updateTaskAtomic(id, data, { historyEntries, auditEvent, previousRequirementId }) {
    return traceabilityTransaction(
      {
        taskIds: [id],
        requirementIds: [previousRequirementId, data.requirementId],
        reason: 'TASK_UPDATED',
        sourceEntityType: 'Task',
        sourceEntityId: id
      },
      async (tx) => {
        let previous = null;
        if (Object.hasOwn(data, 'estimatedEffort')) {
          const pointer = await tx.task.findUnique({
            where: { id },
            select: { projectId: true, sprintId: true }
          });
          if (pointer?.sprintId) {
            await tx.$queryRaw`SELECT id FROM Sprint WHERE id = ${pointer.sprintId} AND projectId = ${pointer.projectId} FOR UPDATE`;
          }
          await tx.$queryRaw`SELECT id FROM Task WHERE id = ${id} FOR UPDATE`;
          previous = await tx.task.findUnique({
            where: { id },
            select: { id: true, projectId: true, sprintId: true, estimatedEffort: true }
          });
        }
        if (previous) await captureBurnupEstimate(tx, previous, data.estimatedEffort, new Date());
        const task = await tx.task.update({ where: { id }, data, include: taskInclude });
        if (historyEntries.length) {
          await tx.taskHistoryEntry.createMany({
            data: historyEntries.map((entry) => ({
              ...entry,
              projectId: task.projectId,
              taskId: id
            }))
          });
        }
        if (auditEvent) await auditRepository.create(auditEvent, tx);
        return task;
      }
    );
  },

  async deleteTask(id, { auditEvent, requirementId } = {}) {
    return traceabilityTransaction(
      {
        taskIds: [id],
        requirementIds: [requirementId],
        reason: 'TASK_DELETED',
        sourceEntityType: 'Task',
        sourceEntityId: id
      },
      async (tx) => {
        const owner = await tx.task.findUnique({ where: { id }, select: { projectId: true } });
        if (owner) await lockActiveProject(tx, owner.projectId);
        if (await tx.defectTask.count({ where: { taskId: id } }))
          throw new AppError({
            message: 'Tarefa vinculada ao histórico de defeitos não pode ser excluída.',
            code: 'TASK_REFERENCED_BY_DEFECT',
            statusCode: 409
          });
        // A participacao em sprints sobrevive a exclusao da tarefa: fecha com o
        // status que ela tinha, e a FK deixa `taskId` nulo. O denominador de uma
        // sprint encerrada nao pode mudar porque alguem apagou a tarefa depois —
        // o snapshot de titulo e o que resta para identifica-la (ADR-010 D09).
        const memberships = await tx.sprintTask.findMany({
          where: { taskId: id, removedAt: null, closedAt: null },
          select: { id: true, sprintId: true },
          orderBy: [{ sprintId: 'asc' }, { id: 'asc' }]
        });
        for (const sprintId of [...new Set(memberships.map((row) => row.sprintId))]) {
          await tx.$queryRaw`SELECT id FROM Sprint WHERE id = ${sprintId} FOR UPDATE`;
        }
        await tx.$queryRaw`SELECT id FROM Task WHERE id = ${id} FOR UPDATE`;
        const atual = await tx.task.findUnique({ where: { id }, select: { status: true } });
        const removedAt = new Date();
        await captureBurnupScope(tx, null, {
          close: memberships.map((row) => ({
            id: row.id,
            at: removedAt,
            exitStatus: atual?.status ?? null
          })),
          open: []
        });
        await tx.sprintTask.updateMany({
          // `closedAt: null` exclui as participacoes ja congeladas: numa sprint
          // encerrada a composicao e registro, e marcar a saida agora tiraria a
          // tarefa do periodo que ela de fato integrou. Nessas, a FK apenas anula
          // `taskId` e o snapshot de titulo passa a ser o que resta dela.
          where: { taskId: id, removedAt: null, closedAt: null },
          data: {
            removedAt,
            removalReason: 'TAREFA_EXCLUIDA',
            exitStatus: atual?.status ?? null
          }
        });

        await tx.taskCommit.deleteMany({
          where: { taskId: id }
        });

        await tx.taskIssue.deleteMany({
          where: { taskId: id }
        });

        await tx.taskMovement.deleteMany({
          where: { taskId: id }
        });
        await tx.taskHistoryEntry.deleteMany({ where: { taskId: id } });
        await tx.taskComment.deleteMany({ where: { taskId: id } });
        await tx.taskTimeEntry.deleteMany({ where: { taskId: id } });
        const deleted = await tx.task.delete({
          where: { id }
        });
        if (auditEvent) await auditRepository.create(auditEvent, tx);
        return deleted;
      }
    );
  },

  async countTasksByProject(projectId, createdAt) {
    return prisma.task.count({
      where: {
        projectId,
        ...(createdAt ? { createdAt } : {})
      }
    });
  },

  async countTasksWithPullRequestByProject(projectId) {
    return prisma.task.count({
      where: {
        projectId,
        pullRequestId: { not: null }
      }
    });
  },

  async countTasksWithCommitByProject(projectId) {
    return prisma.task.count({
      where: {
        projectId,
        commitLinks: {
          some: {}
        }
      }
    });
  },

  async countTasksWithIssueByProject(projectId) {
    return prisma.task.count({
      where: {
        projectId,
        issueLinks: {
          some: {}
        }
      }
    });
  }
};
