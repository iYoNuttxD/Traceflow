import { prisma } from '../../database/prismaClient.js';
import { resourceNotFoundError } from '../../shared/errors/index.js';
import { lockActiveProject } from '../projects/active-project-write.js';
import { lockProjectMembership } from '../projects/project-lifecycle-lock.js';

export const dashboardPreferenceRepository = {
  read(projectId, userId) {
    return prisma.projectDashboardPreference.findUnique({
      where: { projectId_userId: { projectId, userId } }
    });
  },
  write(projectId, userId, configuration) {
    return prisma.$transaction(async (tx) => {
      await lockActiveProject(tx, projectId);
      await lockProjectMembership(tx, projectId, userId);
      const member = await tx.projectMembership.findFirst({
        where: {
          projectId,
          userId,
          isActive: true,
          user: { accountStatus: 'ACTIVE', isActive: true }
        },
        select: { id: true }
      });
      if (!member) throw resourceNotFoundError('Project');
      const where = { projectId_userId: { projectId, userId } };
      if (configuration === null) {
        await tx.projectDashboardPreference.deleteMany({ where: { projectId, userId } });
        return null;
      }
      const data = {
        configurationVersion: configuration.configurationVersion,
        configuration: { widgets: configuration.widgets }
      };
      return tx.projectDashboardPreference.upsert({
        where,
        create: { projectId, userId, ...data },
        update: data
      });
    });
  }
};
