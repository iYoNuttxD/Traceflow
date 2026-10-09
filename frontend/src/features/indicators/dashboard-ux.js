// Compatibility for saved selections; never a second indicator/formula catalog.
export const CATALOG_ADJUSTMENT_MESSAGE =
  'Alguns indicadores salvos não estão mais disponíveis. A visualização foi ajustada; se necessário, o padrão foi utilizado.';

export function filterDashboardWidgets(widgets, catalog, limit = 12) {
  const allowed = new Set(
    (catalog ?? []).filter((item) => item.customization?.customizable).map((item) => item.metricId)
  );
  return [
    ...new Set((Array.isArray(widgets) ? widgets : []).filter((id) => allowed.has(id)))
  ].slice(0, limit);
}

export function compatibleDashboardPreference(preference, catalog, policy) {
  if (!preference || !catalog || !policy) return null;
  const valid = filterDashboardWidgets(preference.widgets, catalog, policy.maxWidgets);
  const widgets = valid.length
    ? valid
    : filterDashboardWidgets(policy.defaultPreference.widgets, catalog, policy.maxWidgets);
  return {
    ...preference,
    widgets,
    configurationAdjusted:
      preference.configurationAdjusted ||
      widgets.join(',') !== (Array.isArray(preference.widgets) ? preference.widgets.join(',') : ''),
    isDefault: valid.length ? preference.isDefault : true
  };
}

// Matches dashboardQuerySchema. Other views intentionally accept longer periods.
export function dashboardPeriodError({ view, startDate, endDate }) {
  if (!['FLOW', 'TASK', 'CUSTOM', 'QUALITY'].includes(view) || !startDate || !endDate) return '';
  const days = (Date.parse(endDate) - Date.parse(startDate)) / 86400000 + 1;
  return days > 366 ? 'O período informado deve ter no máximo 366 dias nesta visão.' : '';
}
