// Repository do modulo de tarefas. Todo acesso ao banco passa pelo Prisma.
import { prisma } from '../../database/prismaClient.js';
import { auditRepository } from '../audit/audit.repository.js';

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
  responsibleUser: { select: { id: true, name: true } },
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

async function recalculateRequirements(tx, requirementIds, calculateStatus) {
  const ids = [...new Set(requirementIds.filter(Boolean).map(Number))];
  if (!ids.length || !calculateStatus) return;
  const requirements = await tx.requirement.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true, tasks: { select: { status: true } } }
  });
  for (const requirement of requirements) {
    if (['CONCLUIDO', 'CANCELADO'].includes(requirement.status)) continue;
    const status = calculateStatus(requirement.tasks);
    if (status !== requirement.status) {
      await tx.requirement.update({ where: { id: requirement.id }, data: { status } });
    }
  }
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

  async createTaskAtomic(projectId, data, auditEvent, calculateRequirementStatus) {
    return prisma.$transaction(async (tx) => {
      const task = await tx.task.create({ data: { ...data, projectId }, include: taskInclude });
      await recalculateRequirements(tx, [task.requirementId], calculateRequirementStatus);
      if (auditEvent)
        await auditRepository.create({ ...auditEvent, resourceId: String(task.id) }, tx);
      return task;
    });
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

  async findSprintById(id) {
    return prisma.sprint.findUnique({
      where: { id },
      select: {
        id: true,
        status: true
      }
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

  async updateTaskAtomic(
    id,
    data,
    { historyEntries, auditEvent, calculateRequirementStatus, previousRequirementId }
  ) {
    return prisma.$transaction(async (tx) => {
      const task = await tx.task.update({ where: { id }, data, include: taskInclude });
      if (historyEntries.length) {
        await tx.taskHistoryEntry.createMany({
          data: historyEntries.map((entry) => ({ ...entry, projectId: task.projectId, taskId: id }))
        });
      }
      await recalculateRequirements(
        tx,
        [previousRequirementId, task.requirementId],
        calculateRequirementStatus
      );
      if (auditEvent) await auditRepository.create(auditEvent, tx);
      return task;
    });
  },

  async deleteTask(id, { auditEvent, calculateRequirementStatus, requirementId } = {}) {
    return prisma.$transaction(async (tx) => {
      // A participacao em sprints sobrevive a exclusao da tarefa: fecha com o
      // status que ela tinha, e a FK deixa `taskId` nulo. O denominador de uma
      // sprint encerrada nao pode mudar porque alguem apagou a tarefa depois —
      // o snapshot de titulo e o que resta para identifica-la (ADR-010 D09).
      const atual = await tx.task.findUnique({ where: { id }, select: { status: true } });
      await tx.sprintTask.updateMany({
        // `closedAt: null` exclui as participacoes ja congeladas: numa sprint
        // encerrada a composicao e registro, e marcar a saida agora tiraria a
        // tarefa do periodo que ela de fato integrou. Nessas, a FK apenas anula
        // `taskId` e o snapshot de titulo passa a ser o que resta dela.
        where: { taskId: id, removedAt: null, closedAt: null },
        data: {
          removedAt: new Date(),
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
      const deleted = await tx.task.delete({
        where: { id }
      });
      await recalculateRequirements(tx, [requirementId], calculateRequirementStatus);
      if (auditEvent) await auditRepository.create(auditEvent, tx);
      return deleted;
    });
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
