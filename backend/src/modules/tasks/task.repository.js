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

  async countTasksByProject(projectId, createdAt) {
    return prisma.task.count({
      where: {
        projectId,
        ...(createdAt ? { createdAt } : {})
      }
    });
  }
};
