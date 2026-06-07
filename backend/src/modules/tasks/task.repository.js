// Repository do modulo de tarefas. Todo acesso ao banco passa pelo Prisma.
import { prisma } from '../../database/prismaClient.js';

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
      }
    });
  },

  async findTasksByProject(projectId) {
    return prisma.task.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' }
    });
  },

  async findTaskById(id) {
    return prisma.task.findUnique({
      where: { id }
    });
  },

  async updateTask(id, data) {
    return prisma.task.update({
      where: { id },
      data
    });
  },

  async updateTaskStatus(id, status) {
    return prisma.task.update({
      where: { id },
      data: { status }
    });
  },

  async moveTask(task, data) {
    return prisma.$transaction(async (tx) => {
      const updatedTask = await tx.task.update({
        where: { id: task.id },
        data: { status: data.toStatus }
      });

      const movement = await tx.taskMovement.create({
        data: {
          projectId: task.projectId,
          taskId: task.id,
          fromStatus: task.status,
          toStatus: data.toStatus,
          movedBy: data.movedBy,
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
  }
};
