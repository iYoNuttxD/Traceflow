import { prisma } from '../../database/prismaClient.js';
import { resourceNotFoundError } from '../../shared/errors/index.js';
import { lockActiveProject } from '../projects/active-project-write.js';
import { lockProjectMembership } from '../projects/project-lifecycle-lock.js';
import { defaultDashboardPreference } from './personalized-dashboard.catalog.js';

function withPersonalPreferenceWrite(projectId, userId, write) {
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
    return write(tx, { projectId_userId: { projectId, userId } });
  });
}

export const dashboardPreferenceRepository = {
  read(projectId, userId) {
    return prisma.projectDashboardPreference.findUnique({
      where: { projectId_userId: { projectId, userId } }
    });
  },
  write(projectId, userId, configuration) {
    return withPersonalPreferenceWrite(projectId, userId, async (tx, where) => {
      if (configuration === null) {
        await tx.projectDashboardPreference.deleteMany({ where: { projectId, userId } });
        return null;
      }
      // Older clients omit this presentation flag; preserve it under the same write locks.
      const previous =
        configuration.pinnedToOverview === undefined
          ? await tx.projectDashboardPreference.findUnique({ where })
          : null;
      const data = {
        configurationVersion: configuration.configurationVersion,
        configuration: {
          widgets: configuration.widgets,
          pinnedToOverview:
            configuration.pinnedToOverview ?? previous?.configuration?.pinnedToOverview === true
        }
      };
      return tx.projectDashboardPreference.upsert({
        where,
        create: { projectId, userId, ...data },
        update: data
      });
    });
  },
  setOverviewPin(projectId, userId, pinnedToOverview) {
    return withPersonalPreferenceWrite(projectId, userId, async (tx, where) => {
      const previous = await tx.projectDashboardPreference.findUnique({ where });
      // Unpin is idempotent and must not recreate a deleted preference.
      if (!previous && !pinnedToOverview) return null;
      if (previous) {
        return tx.projectDashboardPreference.update({
          where,
          data: { configuration: { ...previous.configuration, pinnedToOverview } }
        });
      }
      const defaults = defaultDashboardPreference();
      return tx.projectDashboardPreference.create({
        data: {
          projectId,
          userId,
          configurationVersion: defaults.configurationVersion,
          configuration: { widgets: defaults.widgets, pinnedToOverview }
        }
      });
    });
  }
};
