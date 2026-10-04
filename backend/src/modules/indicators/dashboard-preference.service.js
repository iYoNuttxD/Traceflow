import { dashboardPreferenceRepository } from './dashboard-preference.repository.js';
import { defaultDashboardPreference } from './personalized-dashboard.catalog.js';

function present(row) {
  return row
    ? {
        configurationVersion: row.configurationVersion,
        widgets: row.configuration.widgets,
        isDefault: false,
        updatedAt: row.updatedAt.toISOString()
      }
    : defaultDashboardPreference();
}

export const dashboardPreferenceService = {
  async read(projectId, userId) {
    return present(await dashboardPreferenceRepository.read(Number(projectId), userId));
  },
  async save(projectId, userId, configuration) {
    return present(
      await dashboardPreferenceRepository.write(Number(projectId), userId, configuration)
    );
  },
  async reset(projectId, userId) {
    await dashboardPreferenceRepository.write(Number(projectId), userId, null);
    return defaultDashboardPreference();
  }
};
