import { indicatorsService } from '../indicators.service.js';
import { traceabilityAnalyticsService } from '../traceability-analytics.service.js';
import {
  flowHealthIndicators,
  githubHealthIndicators,
  qualityHealthIndicators
} from './health.data.js';
import { assessSignal, buildProjectHealth, healthWindow } from './health.policy.js';
import { healthRepository } from './health.repository.js';

const TEMPORAL_SIGNALS = new Set(['I04', 'I15', 'I20', 'I21', 'I49', 'I58']);

function add(map, indicators) {
  for (const indicator of indicators) map.set(indicator.metricId, indicator);
}

export async function readHealth(
  projectId,
  view,
  period,
  generatedAt,
  sourceIndicators,
  visibleIndicators,
  options
) {
  const asOf = new Date(generatedAt);
  const window = healthWindow(period, asOf);
  const current = new Map(sourceIndicators.map((indicator) => [indicator.metricId, indicator]));
  const previous = new Map();
  const matchesWindow = (metricId) => {
    const metricPeriod = current.get(metricId)?.period;
    return Boolean(
      window &&
      metricPeriod?.startInclusive === window.current.startInclusive.toISOString() &&
      metricPeriod?.endExclusive === window.current.endExclusive.toISOString()
    );
  };
  const requests = [];
  if (window && ['GENERAL', 'FLOW'].includes(view))
    requests.push(['flow', healthRepository.flow(projectId, asOf, view === 'GENERAL')]);
  else if (view === 'GENERAL')
    requests.push(['planning', healthRepository.planning(projectId, asOf)]);
  if (['GENERAL', 'QUALITY'].includes(view) && !matchesWindow('I49'))
    requests.push(['quality', healthRepository.quality(projectId, window?.current ?? null)]);
  if (options.githubApplicable && (view === 'GENERAL' || (view === 'GITHUB' && current.has('I15'))))
    requests.push([
      'github',
      healthRepository.github(projectId, window, asOf, !matchesWindow('I15'))
    ]);
  if (view === 'TRACEABILITY' || (view === 'GENERAL' && !current.has('I01')))
    requests.push(['progress', indicatorsService.progress(projectId)]);
  if (view === 'QUALITY')
    requests.push(['traceability', traceabilityAnalyticsService.read(projectId)]);

  const settled = await Promise.allSettled(requests.map(([, request]) => request));
  for (const [position, outcome] of settled.entries()) {
    const [kind] = requests[position];
    if (outcome.status === 'rejected') throw outcome.reason;
    if (kind === 'flow') {
      const rows = flowHealthIndicators(outcome.value, window, asOf);
      add(current, rows.current);
      add(previous, rows.previous);
      add(current, rows.planning ?? []);
    } else if (kind === 'planning') {
      add(
        current,
        [
          ['I26', 'total'],
          ['I28', 'overdue'],
          ['I29', 'unassigned'],
          ['I30', 'withoutEstimate']
        ].map(([metricId, field]) => ({
          metricId,
          value: Number(outcome.value[field]),
          state: 'AVAILABLE'
        }))
      );
    } else if (kind === 'quality') add(current, qualityHealthIndicators(outcome.value));
    else if (kind === 'github') {
      const rows = githubHealthIndicators(outcome.value, window, !matchesWindow('I15'));
      add(current, rows.current);
      add(previous, rows.previous);
    } else add(current, kind === 'progress' ? [outcome.value] : outcome.value.indicators);
  }

  // A future-only request has no event window. Widget sources may still contain
  // events from an internal current-day read, so they cannot supply Health here.
  if (!window) {
    for (const metricId of TEMPORAL_SIGNALS) current.delete(metricId);
    if (!options.githubApplicable) {
      current.delete('I10');
      current.delete('I73');
    }
  }
  if (!options.sprintActive) current.delete('I45');
  const assessments = Object.fromEntries(
    visibleIndicators.map((indicator) => [
      indicator.metricId,
      assessSignal(
        indicator.metricId,
        (!window && TEMPORAL_SIGNALS.has(indicator.metricId)) ||
          (indicator.metricId === 'I45' && !options.sprintActive)
          ? new Map(current)
          : new Map(current).set(indicator.metricId, indicator),
        previous
      )
    ])
  );
  const projectHealth = view === 'GENERAL' ? buildProjectHealth(current, previous, options) : null;
  const publicWindow = window
    ? {
        timeZone: window.current.timeZone,
        current: {
          startInclusive: window.current.startInclusive.toISOString(),
          endExclusive: window.current.endExclusive.toISOString()
        },
        previous: {
          startInclusive: window.previous.startInclusive.toISOString(),
          endExclusive: window.previous.endExclusive.toISOString()
        }
      }
    : null;
  return {
    assessments,
    projectHealth: projectHealth
      ? { ...projectHealth, window: publicWindow, calculatedAt: generatedAt }
      : null
  };
}
