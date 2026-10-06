import { dashboardSource } from './dashboard-view.catalog.js';
import { INDICATORS } from './indicators.catalog.js';

export const TASK_HISTORY_IDS = new Set(['I20', 'I21', 'I22', 'I24', 'I25']);
// Health's instant signals and their denominators. Temporal signals use Health windows.
const HEALTH_CURRENT_IDS = [
  'I01',
  'I26',
  'I28',
  'I29',
  'I30',
  'I39',
  'I44',
  'I45',
  'I71',
  'I61',
  'I62',
  'I63',
  'I64',
  'I65',
  'I66'
];
const GITHUB_TRACE_IDS = new Set(['I62', 'I63', 'I65', 'I66']);

export function planDashboardReads(
  sections,
  { period, includeHealth, githubApplicable, sprintApplicable = true }
) {
  const requested = new Set(sections.flatMap((s) => s.metricIds));
  const ids = new Set(
    [...requested].filter((id) => period || !INDICATORS[id].supportedFilters.includes('period'))
  );
  if (includeHealth)
    for (const id of HEALTH_CURRENT_IDS) {
      if (!githubApplicable && GITHUB_TRACE_IDS.has(id)) continue;
      if (!sprintApplicable && dashboardSource(id) === 'sprints') continue;
      ids.add(id);
    }
  const groups = new Map();
  for (const id of ids) {
    const source = dashboardSource(id);
    if (!githubApplicable && (source === 'github' || id === 'I02')) continue;
    const group =
      id === 'I59'
        ? 'qualityProjection'
        : source === 'tasks' && TASK_HISTORY_IDS.has(id)
          ? 'taskHistory'
          : source;
    if (!groups.has(group)) groups.set(group, new Set());
    groups.get(group).add(id);
  }
  return groups;
}
