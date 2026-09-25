import { INDICATORS } from './indicators.catalog.js';

const range = (start, end) =>
  Array.from(
    { length: end - start + 1 },
    (_, index) => `I${String(start + index).padStart(2, '0')}`
  );

export const DASHBOARD_VIEWS = Object.freeze({
  GENERAL: [
    { id: 'summary', metricIds: ['I01', 'I23', 'I28', 'I61', 'I66', 'I53'] },
    { id: 'sprint', metricIds: ['I45'] }
  ],
  GITHUB: [
    { id: 'activity', metricIds: ['I02', 'I09'] },
    {
      id: 'pullRequests',
      metricIds: ['I04', 'I06', 'I10', 'I11', 'I12', 'I15', 'I16', 'I17', 'I73']
    },
    { id: 'issues', metricIds: ['I13', 'I14', 'I18', 'I74'] }
  ],
  FLOW: [{ id: 'flow', metricIds: range(20, 25) }],
  SPRINT: [
    { id: 'planning', metricIds: range(36, 44) },
    { id: 'history', metricIds: ['I45', 'I46', 'I47'] },
    { id: 'scope', metricIds: ['I71', 'I72'] }
  ],
  TASK: [{ id: 'tasks', metricIds: range(26, 35) }],
  QUALITY: [
    { id: 'pullRequests', metricIds: ['I06'] },
    { id: 'tests', metricIds: range(48, 52) },
    { id: 'defects', metricIds: range(53, 58) },
    { id: 'concentration', metricIds: ['I59', 'I60'] }
  ],
  TRACEABILITY: [{ id: 'coverage', metricIds: range(61, 67) }]
});

const ACTIVITY_IDS = new Set(['I02', 'I03', 'I05']);
const GITHUB_IDS = new Set(['I04', 'I06', ...range(9, 18), 'I73', 'I74']);
const FLOW_IDS = new Set(range(20, 35));
const SPRINT_IDS = new Set([...range(36, 47), 'I71', 'I72']);
const QUALITY_IDS = new Set(range(48, 60));
const TRACEABILITY_IDS = new Set(range(61, 67));

export function dashboardSource(metricId) {
  if (metricId === 'I01') return 'progress';
  if (ACTIVITY_IDS.has(metricId)) return 'activity';
  if (GITHUB_IDS.has(metricId)) return 'github';
  if (FLOW_IDS.has(metricId)) return 'tasks';
  if (SPRINT_IDS.has(metricId)) return 'sprints';
  if (QUALITY_IDS.has(metricId)) return 'quality';
  if (TRACEABILITY_IDS.has(metricId)) return 'traceability';
  throw new Error(`Unknown dashboard metric: ${metricId}`);
}

const UNSAFE_PERIOD = new Set(['I01', 'I52', ...range(61, 67)]);
const UNSAFE_SPRINT = new Set(['I05', ...range(23, 35)]);
const UNSAFE_RESPONSIBLE = new Set([...range(23, 28)]);
const CATALOG_SUPPORTED_BUT_SOURCE_UNAVAILABLE = Object.freeze({
  sprint: new Set(['I03', ...range(20, 22)]),
  responsible: new Set(['I02', 'I03', 'I05'])
});

export function dashboardFilterPolicy(metricId, filter) {
  const definition = INDICATORS[metricId];
  if (!definition) throw new Error(`Unknown indicator: ${metricId}`);
  const key =
    filter === 'sprint' ? 'sprintId' : filter === 'responsible' ? 'responsibleUserId' : 'period';
  if (definition.supportedFilters.includes(key)) return 'SUPPORTED';
  if (CATALOG_SUPPORTED_BUT_SOURCE_UNAVAILABLE[filter]?.has(metricId)) return 'UNSAFE';
  if (filter === 'period' && UNSAFE_PERIOD.has(metricId)) return 'UNSAFE';
  if (filter === 'sprint' && UNSAFE_SPRINT.has(metricId)) return 'UNSAFE';
  if (filter === 'responsible' && UNSAFE_RESPONSIBLE.has(metricId)) return 'UNSAFE';
  return 'NOT_APPLICABLE';
}

const SERIES_IDS = new Set(['I22', 'I25', 'I45', 'I46', 'I47']);
const LIST_IDS = new Set(['I17', 'I24', 'I28', 'I34', 'I35', 'I41', 'I42', 'I43', 'I59', 'I60']);
const DISTRIBUTION_IDS = new Set(['I27', 'I48', 'I52', 'I53', 'I54']);

export function dashboardVisualizations(metricId) {
  if (metricId === 'I01') return ['PROGRESS', 'KPI'];
  if (metricId === 'I47') return ['BAR'];
  if (SERIES_IDS.has(metricId)) return [metricId === 'I25' ? 'STACKED_AREA' : 'LINE'];
  if (LIST_IDS.has(metricId)) return ['RANKED_LIST'];
  if (DISTRIBUTION_IDS.has(metricId)) return ['STACKED_BAR', 'TABLE'];
  if (['I02', 'I03', 'I05'].includes(metricId)) return ['TABLE', 'BAR'];
  return ['KPI'];
}

const PUBLIC_SOURCE = Object.freeze({
  progress: 'Tasks',
  activity: 'Tasks e commits GitHub',
  github: 'GitHub',
  tasks: 'Tasks e movimentos',
  sprints: 'Sprint e histórico',
  quality: 'Testes e Defects',
  traceability: 'Rastreabilidade'
});

export function publicDashboardCatalog() {
  const viewsById = new Map();
  for (const [view, sections] of Object.entries(DASHBOARD_VIEWS)) {
    for (const section of sections) {
      for (const metricId of section.metricIds) {
        const views = viewsById.get(metricId) ?? [];
        views.push(view);
        viewsById.set(metricId, views);
      }
    }
  }
  return Object.keys(INDICATORS).map((metricId) => {
    const definition = INDICATORS[metricId];
    return {
      metricId,
      category: definition.category,
      title: definition.title,
      description: definition.description,
      unit: definition.unit,
      temporalType: definition.temporalType,
      eventClock: definition.eventClock,
      supportedFilters: definition.supportedFilters.filter((filter) =>
        ['period', 'sprintId', 'responsibleUserId'].includes(filter)
      ),
      filterCompatibility: Object.fromEntries(
        ['period', 'sprint', 'responsible'].map((filter) => [
          filter,
          dashboardFilterPolicy(metricId, filter)
        ])
      ),
      visualizations: dashboardVisualizations(metricId),
      rf: definition.rf,
      definitionVersion: definition.definitionVersion,
      source: PUBLIC_SOURCE[dashboardSource(metricId)],
      views: viewsById.get(metricId) ?? []
    };
  });
}
