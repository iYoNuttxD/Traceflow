// Repository do modulo de tarefas. Todo acesso ao banco passa pelo Prisma.
import { prisma } from '../../database/prismaClient.js';

const taskPullRequestSelect = {
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
  branch: true,
  githubUrl: true
};

const taskInclude = {
  pullRequest: {
    select: taskPullRequestSelect
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
  }
};

export const taskRepository = {
  async findProjectById(projectId) {
    return prisma.project.findUnique({
      where: { id: projectId }
    });
  },

  async createTask(projectId, data) {
    return prisma.task.create({
      data: {
        ...data,
        projectId
      },
      include: taskInclude
    });
  },

  async findTasksByProject(projectId) {
    return prisma.task.findMany({
      where: { projectId },
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

  async findCommitById(id) {
    return prisma.commit.findUnique({
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

  async createTaskCommit(taskId, commitId) {
    return prisma.taskCommit.create({
      data: {
        taskId,
        commitId
      },
      select: {
        commit: {
          select: taskCommitSelect
        }
      }
    });
  },

  async deleteTaskCommit(taskId, commitId) {
    return prisma.taskCommit.delete({
      where: {
        taskId_commitId: {
          taskId,
          commitId
        }
      }
    });
  },

  async findProjectMemberById(id) {
    return prisma.projectMember.findUnique({
      where: { id }
    });
  },

  async updateTask(id, data) {
    return prisma.task.update({
      where: { id },
      data,
      include: taskInclude
    });
  },

  async updateTaskStatus(id, status) {
    return prisma.task.update({
      where: { id },
      data: { status },
      include: taskInclude
    });
  },

  async updateTaskPullRequest(id, pullRequestId) {
    return prisma.task.update({
      where: { id },
      data: { pullRequestId },
      include: taskInclude
    });
  },

  async moveTask(task, data) {
    return prisma.$transaction(async (tx) => {
      const updatedTask = await tx.task.update({
        where: { id: task.id },
        data: { status: data.toStatus },
        include: taskInclude
      });

      const movement = await tx.taskMovement.create({
        data: {
          projectId: task.projectId,
          taskId: task.id,
          fromStatus: task.status,
          toStatus: data.toStatus,
          movedBy: data.movedBy,
          ...(data.projectMemberId !== undefined
            ? { projectMemberId: data.projectMemberId }
            : {}),
          ...(data.sprintId !== undefined ? { sprintId: data.sprintId } : {})
        }
      });

      return { task: updatedTask, movement };
    });
  },

  async findMovementsByProject(projectId, filters = {}) {
    return prisma.taskMovement.findMany({
      where: {
        projectId,
        ...(filters.movedAt ? { movedAt: filters.movedAt } : {}),
        ...(filters.taskId ? { taskId: filters.taskId } : {}),
        ...(filters.movedBy ? { movedBy: filters.movedBy } : {}),
        ...(filters.sprintId ? { sprintId: filters.sprintId } : {})
      },
      include: {
        task: {
          select: {
            title: true
          }
        }
      },
      orderBy: { movedAt: 'desc' }
    });
  },

  async countMovementsByProject(projectId, filters = {}) {
    return prisma.taskMovement.count({
      where: {
        projectId,
        ...(filters.movedAt ? { movedAt: filters.movedAt } : {}),
        ...(filters.taskId ? { taskId: filters.taskId } : {}),
        ...(filters.movedBy ? { movedBy: filters.movedBy } : {}),
        ...(filters.sprintId ? { sprintId: filters.sprintId } : {})
      }
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
        pullRequestId: {
          not: null
        }
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
  }
};
