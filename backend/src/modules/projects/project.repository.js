// Repository de projetos: concentra o acesso a Project no MySQL via Prisma.
import { prisma } from '../../database/prismaClient.js';

export const projectRepository = {
  async createProject(data) {
    return prisma.project.create({ data });
  },

  async findAllProjects() {
    return prisma.project.findMany({
      orderBy: { createdAt: 'desc' }
    });
  },

  async findProjectByAccessCode(accessCode) {
    return prisma.project.findUnique({
      where: { accessCode }
    });
  },

  async updateProject(id, data) {
    return prisma.project.update({
      where: { id },
      data
    });
  },

  async findById(id) {
    return prisma.project.findUnique({
      where: { id }
    });
  },

  async findByGithubRepositoryId(githubRepositoryId) {
    return prisma.project.findFirst({
      where: { githubRepositoryId }
    });
  },

  async findByGithubRepositoryFullName(githubRepositoryFullName) {
    return prisma.project.findFirst({
      where: { githubRepositoryFullName }
    });
  },

  async createFromGithub(data) {
    return prisma.project.create({ data });
  },

  async updateGithubSyncSettings(id, githubAutoSyncEnabled) {
    return prisma.project.update({
      where: { id },
      data: { githubAutoSyncEnabled }
    });
  },

  async updateGithubLastSyncAt(id, githubLastSyncAt) {
    return prisma.project.update({
      where: { id },
      data: { githubLastSyncAt }
    });
  },

  async markGithubSyncStarted(id, attemptedAt) {
    return prisma.project.update({
      where: { id },
      data: {
        githubSyncStatus: 'SINCRONIZANDO',
        githubLastSyncAttemptAt: attemptedAt,
        githubLastSyncError: null
      }
    });
  },

  async markGithubSyncSucceeded(id, syncedAt) {
    return prisma.project.update({
      where: { id },
      data: {
        githubLastSyncAt: syncedAt,
        githubLastSyncAttemptAt: syncedAt,
        githubSyncStatus: 'SINCRONIZADO',
        githubLastSyncError: null
      }
    });
  },

  async markGithubSyncFailed(id, attemptedAt, errorMessage) {
    return prisma.project.update({
      where: { id },
      data: {
        githubLastSyncAttemptAt: attemptedAt,
        githubSyncStatus: 'FALHA',
        githubLastSyncError: errorMessage
      }
    });
  },

  async findActiveMembersByProject(projectId) {
    return prisma.projectMember.findMany({
      where: {
        projectId,
        isActive: true
      },
      orderBy: { name: 'asc' }
    });
  },

  async findMemberByProjectEmail(projectId, email) {
    return prisma.projectMember.findFirst({
      where: {
        projectId,
        email
      }
    });
  },

  async createProjectMember(projectId, data) {
    return prisma.projectMember.create({
      data: {
        ...data,
        projectId
      }
    });
  }
};
