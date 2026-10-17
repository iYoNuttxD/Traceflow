import { env } from '../../config/env.js';
import { logger } from '../../shared/logger/index.js';
import {
  decisionsByEvent,
  githubCoverageGaps,
  githubEventTally,
  incompleteRecordGaps,
  overdueEventKey,
  overdueOccurrences,
  requirementReport,
  statusChangeEventKey,
  tallyDecidedEvents
} from './notification-metrics.policy.js';
import { notificationMetricsRepository } from './notification-metrics.repository.js';
import { OVERDUE, STATUS_CHANGED, addDays, startOfLocalDay } from './notification.policy.js';
import { notificationRepository } from './notification.repository.js';

const DAY_MS = 86_400_000;
const EVENT_UNIT = 'EVENTO';
const PAIR_UNIT = 'PAR_EVENTO_PARTICIPANTE';
const RF60_EVENTS = new Set(['ISSUE_CLOSED', 'ISSUE_REOPENED']);
const RF61_EVENTS = new Set(['PULL_REQUEST_MERGED', 'PULL_REQUEST_CLOSED']);

const contains = (period, instant) =>
  instant.getTime() >= period.start.getTime() && instant.getTime() < period.end.getTime();

export function createNotificationMetricsService({
  repository = notificationMetricsRepository,
  projects = notificationRepository,
  log = logger,
  clock = () => new Date(),
  configuration = env
} = {}) {
  async function statusChanges(projectIds, period, gaps) {
    const decided = decisionsByEvent(
      await repository.decisionsInPeriod(STATUS_CHANGED, projectIds, period)
    );
    const keys = new Set(
      (await repository.movementIds(projectIds, period)).map(statusChangeEventKey)
    );
    for (const key of decided.keys()) keys.add(key);
    return requirementReport(EVENT_UNIT, tallyDecidedEvents(keys, decided), gaps);
  }

  async function overdue(projectIds, period, { now, timeZone }, gaps) {
    const occurred = new Map();
    for (const { task, entries } of await repository.overdueTimelines(projectIds))
      for (const [dueDate, instant] of overdueOccurrences(task, entries, { timeZone, until: now }))
        occurred.set(overdueEventKey(task.id, dueDate), instant);
    const keys = new Set(
      [...occurred].filter(([, instant]) => contains(period, instant)).map(([key]) => key)
    );
    const decided = decisionsByEvent([
      ...(await repository.decisionsForKeys(OVERDUE, projectIds, [...keys])),
      ...(await repository.decisionsInPeriod(OVERDUE, projectIds, period))
    ]);
    for (const [key, decision] of decided)
      if (!occurred.has(key) && contains(period, decision.occurredAt)) keys.add(key);
    return requirementReport(EVENT_UNIT, tallyDecidedEvents(keys, decided), gaps);
  }

  return {
    async compute({
      from,
      to,
      projectId = null,
      now = clock(),
      timeZone = configuration.appTimeZone
    }) {
      const startedAt = Date.now();
      const period = {
        start: startOfLocalDay(from, timeZone),
        end: startOfLocalDay(addDays(to, 1), timeZone)
      };
      const projectIds = await projects.listActiveProjectIds(projectId);
      const horizon = new Date(now.getTime() - configuration.notificationRetentionDays * DAY_MS);
      const registry = await repository.registryStarts();
      const decisionGaps = incompleteRecordGaps(registry.decisions, horizon, period.start);
      const githubGaps = [
        ...incompleteRecordGaps(registry.githubEvents, horizon, period.start),
        ...githubCoverageGaps(await repository.githubEventCoverage(projectIds), period)
      ];
      const githubEvents = await repository.githubEventsInPeriod(projectIds, period);
      const githubReport = (types) =>
        requirementReport(
          PAIR_UNIT,
          githubEventTally(githubEvents.filter((event) => types.has(event.type))),
          githubGaps
        );

      const report = {
        periodo: {
          de: from,
          ate: to,
          fuso: timeZone,
          inicio: period.start.toISOString(),
          fim: period.end.toISOString()
        },
        calculadoEm: now.toISOString(),
        projetos: projectIds.length,
        requisitos: {
          RF30: await statusChanges(projectIds, period, decisionGaps),
          RF59: await overdue(projectIds, period, { now, timeZone }, decisionGaps),
          RF60: githubReport(RF60_EVENTS),
          RF61: githubReport(RF61_EVENTS)
        }
      };
      log.info('Métrica oficial das notificações calculada.', {
        event: 'notifications_metrics_completed',
        projects: report.projetos,
        durationMs: Date.now() - startedAt
      });
      return report;
    }
  };
}
