// Repository de projetos: concentra o acesso a Project no MySQL via Prisma.
import { prisma } from '../../database/prismaClient.js';

export const projectRepository = {
  async createProject(data, ownerUserId) {
    if (!ownerUserId) return prisma.project.create({ data });
    return prisma.$transaction(async (tx) => {
      const project = await tx.project.create({ data });
      await tx.projectMembership.create({
        data: { projectId: project.id, userId: ownerUserId, role: 'OWNER' }
      });
      return project;
    });
  },

  async findAllProjects(userId) {
    return prisma.project.findMany({
      ...(userId ? { where: { memberships: { some: { userId, isActive: true } } } } : {}),
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

  async updateGithubRepositoryMetadata(id, data) {
    return prisma.project.update({
      where: { id },
      data
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
        githubLastSyncAttemptAt: attemptedAt
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
  },

  async upsertProjectMembership(projectId, userId, role = 'MEMBER') {
    const normalizedRole =
      { DONO: 'OWNER', GERENTE: 'MANAGER', MEMBRO: 'MEMBER', VISUALIZADOR: 'VIEWER' }[role] || role;
    return prisma.projectMembership.upsert({
      where: { projectId_userId: { projectId, userId } },
      create: {
        projectId,
        userId,
        role: ['OWNER', 'MANAGER', 'MEMBER', 'VIEWER'].includes(normalizedRole)
          ? normalizedRole
          : 'MEMBER'
      },
      update: { isActive: true }
    });
  }
};
