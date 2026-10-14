import { flowTaskRepository } from '../flow-task.repository.js';
import { qualityAnalyticsRepository } from '../quality-analytics.repository.js';
import { createIndicatorReadContext } from '../indicator-read-context.js';
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
  const timeZone = options.timeZone ?? period?.timeZone ?? 'UTC';
  const window = healthWindow(period, asOf, timeZone);
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
  const context = options.readContext;
  const failures = context ?? createIndicatorReadContext({ asOf, timeZone });
  const read = (key, load) => (context ? context.read(key, load) : load());
  const requests = [];
  if (window && ['GENERAL', 'FLOW'].includes(view))
    requests.push([
      'flow',
      context
        ? read('taskHistory', () =>
            flowTaskRepository.read(projectId, null, asOf, {
              historyOnly: true,
              timeZone,
              requestedIds: context.historyIds
            })
          )
        : healthRepository.flow(projectId, asOf, view === 'GENERAL', timeZone)
    ]);
  if (
    view === 'GENERAL' &&
    (!context ? !window : !['I26', 'I28', 'I29', 'I30'].every((id) => current.has(id)))
  )
    requests.push([
      'planning',
      context
        ? read('taskCurrent', () =>
            flowTaskRepository.read(projectId, null, asOf, {
              currentSummaryOnly: true,
              timeZone,
              requestedIds: context.taskIds
            })
          ).then((facts) => facts.aggregate)
        : healthRepository.planning(projectId, asOf, timeZone)
    ]);
  if (
    ['GENERAL', 'QUALITY'].includes(view) &&
    (!matchesWindow('I49') || (context && !current.has('I58')))
  ) {
    const qualityPeriod = window?.current ?? null;
    const key = qualityPeriod
      ? `quality:${qualityPeriod.startInclusive.toISOString()}:${qualityPeriod.endExclusive.toISOString()}`
      : 'quality:current';
    requests.push([
      'quality',
      read(key, async () => {
        const shared = await context?.existingRead('qualityCaseHealth');
        return qualityPeriod && context
          ? qualityAnalyticsRepository.read(projectId, qualityPeriod, {
              requestedIds: ['I49', 'I52', 'I58'],
              sharedProjection: true,
              sharedCaseHealth: shared?.caseHealth
            })
          : shared
            ? healthRepository.quality(projectId, qualityPeriod, {
                sharedCaseHealth: shared.caseHealth
              })
            : healthRepository.quality(projectId, qualityPeriod);
      })
    ]);
  }
  if (options.githubApplicable && (view === 'GENERAL' || (view === 'GITHUB' && current.has('I15'))))
    requests.push([
      'github',
      read('githubHealth', async () =>
        healthRepository.github(
          projectId,
          window,
          asOf,
          !matchesWindow('I15'),
          await context?.existingRead('githubViewFacts')
        )
      )
    ]);
  if (view === 'TRACEABILITY' || (view === 'GENERAL' && !current.has('I01')))
    requests.push(['progress', indicatorsService.progress(projectId, context)]);
  if (view === 'QUALITY')
    requests.push([
      'traceability',
      traceabilityAnalyticsService.read(projectId, () => asOf, context)
    ]);

  const settled = await Promise.allSettled(requests.map(([, request]) => request));
  for (const [position, outcome] of settled.entries()) {
    const [kind] = requests[position];
    if (outcome.status === 'rejected') {
      const source =
        kind === 'flow'
          ? 'taskHistory'
          : kind === 'planning' || kind === 'progress'
            ? 'tasks'
            : kind;
      failures.unavailable(outcome.reason, source);
      const affected = {
        flow: ['I20', 'I21'],
        planning: ['I26', 'I28', 'I29', 'I30'],
        quality: ['I49', ...(!current.has('I52') ? ['I52'] : []), 'I58'],
        github: ['I04', 'I10', 'I15', 'I73'],
        progress: ['I01'],
        traceability: ['I61', 'I62', 'I63', 'I64', 'I65', 'I66']
      }[kind];
      add(
        current,
        affected.map((metricId) => ({
          metricId,
          value: null,
          state: 'UNAVAILABLE',
          limitations: ['SOURCE_UNAVAILABLE']
        }))
      );
      continue;
    }
    if (kind === 'flow') {
      const rows = flowHealthIndicators(outcome.value, window, asOf, context);
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
        previous,
        options
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
    warnings: failures.warnings(),
    projectHealth: projectHealth
      ? { ...projectHealth, window: publicWindow, calculatedAt: generatedAt }
      : null
  };
}
