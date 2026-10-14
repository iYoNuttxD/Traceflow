import {
  defaultDashboardPreference,
  DASHBOARD_WIDGET_LIMIT,
  isCustomizable
} from './personalized-dashboard.catalog.js';

export function presentDashboardPreference(row) {
  if (!row) return defaultDashboardPreference();
  const saved = Array.isArray(row.configuration?.widgets) ? row.configuration.widgets : [];
  const widgets = [...new Set(saved.filter(isCustomizable))].slice(0, DASHBOARD_WIDGET_LIMIT);
  const adjusted = !widgets.length || widgets.length !== saved.length;
  // Read compatibility only. GET must never rewrite a user's persisted configuration.
  return {
    ...(widgets.length
      ? { configurationVersion: row.configurationVersion, widgets, isDefault: false }
      : defaultDashboardPreference()),
    updatedAt: row.updatedAt.toISOString(),
    ...(adjusted ? { configurationAdjusted: true } : {})
  };
}
