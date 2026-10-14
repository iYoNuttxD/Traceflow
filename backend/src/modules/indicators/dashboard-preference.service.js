import { dashboardPreferenceRepository } from './dashboard-preference.repository.js';
import { defaultDashboardPreference } from './personalized-dashboard.catalog.js';
import { presentDashboardPreference } from './dashboard-preference.presenter.js';

export const dashboardPreferenceService = {
  async read(projectId, userId) {
    return presentDashboardPreference(
      await dashboardPreferenceRepository.read(Number(projectId), userId)
    );
  },
  async save(projectId, userId, configuration) {
    return presentDashboardPreference(
      await dashboardPreferenceRepository.write(Number(projectId), userId, configuration)
    );
  },
  async reset(projectId, userId) {
    await dashboardPreferenceRepository.write(Number(projectId), userId, null);
    return defaultDashboardPreference();
  }
};
