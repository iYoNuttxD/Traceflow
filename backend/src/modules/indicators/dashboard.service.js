import { prisma } from '../../database/prismaClient.js';
import { ExternalServiceError, resourceNotFoundError } from '../../shared/errors/index.js';
import {
  DASHBOARD_VIEWS,
  dashboardFilterPolicy,
  dashboardSource
} from './dashboard-view.catalog.js';
import { flowTaskService } from './flow-task.service.js';
import { githubAnalyticsService } from './github-analytics.service.js';
import { INDICATORS } from './indicators.catalog.js';
import { indicatorResult } from './indicators.mapper.js';
import { indicatorsService } from './indicators.service.js';
import { normalizeIndicatorPeriod } from './policies/indicator-period.policy.js';
import { qualityAnalyticsService } from './quality-analytics.service.js';
import { sprintAnalyticsService } from './sprint-analytics.service.js';
import { traceabilityAnalyticsService } from './traceability-analytics.service.js';

const CURRENT_WITHOUT_PERIOD = Object.freeze({
  github: new Set(['I10', 'I13', 'I17', 'I73']),
  tasks: new Set(['I23', 'I24', ...Array.from({ length: 10 }, (_, index) => `I${26 + index}`)]),
  quality: new Set(['I52', 'I53', 'I54', 'I59', 'I60'])
});

function publicPeriod(period) {
  return period
    ? {
        startDate: period.startDate,
        endDate: period.endDate,
        timeZone: period.timeZone,
        startInclusive: period.startInclusive.toISOString(),
        endExclusive: period.endExclusive.toISOString()
      }
    : null;
}

function currentOnlyPeriod(asOf) {
  const day = asOf.toISOString().slice(0, 10);
  return normalizeIndicatorPeriod({ startDate: day, endDate: day, timeZone: 'UTC' });
}

function placeholder(metricId, projectId, asOf, limitation) {
  return indicatorResult(
    metricId,
    projectId,
    { value: null, state: 'UNAVAILABLE', limitations: [limitation] },
    asOf
  );
}

function useful(indicator) {
  if (!['AVAILABLE', 'PARTIAL', 'STALE'].includes(indicator.state)) return false;
  if (typeof indicator.value === 'number') return indicator.value !== 0;
  if (indicator.value && typeof indicator.value === 'object')
    return Object.values(indicator.value).some((value) => typeof value === 'number' && value !== 0);
  return Boolean(indicator.items?.length || indicator.points?.length);
}

export function deriveDashboardViewState(indicators) {
  if (!indicators.length) return 'NO_DATA';
  const degraded = indicators.some((indicator) =>
    ['PARTIAL', 'STALE', 'UNAVAILABLE'].includes(indicator.state)
  );
  const observed = indicators.some((indicator) => indicator.state !== 'UNAVAILABLE');
  if (!observed) return 'UNAVAILABLE';
  if (degraded) return 'PARTIAL';
  return indicators.some(useful) ? 'AVAILABLE' : 'NO_DATA';
}

function decorate(indicator, requested, sprint) {
  const policy = Object.fromEntries(
    ['period', 'sprint', 'responsible'].map((filter) => [
      filter,
      dashboardFilterPolicy(indicator.metricId, filter)
    ])
  );
  const appliedFilters = {
    period: Boolean(requested.period && policy.period === 'SUPPORTED' && indicator.period),
    sprint: Boolean(
      policy.sprint === 'SUPPORTED' && sprint && indicator.scope?.sprintId === sprint.id
    ),
    responsible: false
  };
  const unsafe = Object.entries(policy)
    .filter(
      ([filter, status]) =>
        status === 'UNSAFE' &&
        (filter === 'period'
          ? requested.period
          : filter === 'sprint'
            ? requested.sprintId
            : requested.responsibleUserId)
    )
    .map(([filter]) => `${filter.toUpperCase()}_FILTER_UNSAFE_NOT_APPLIED`);
  return {
    ...indicator,
    filterCompatibility: policy,
    appliedFilters,
    limitations: [...new Set([...indicator.limitations, ...unsafe])]
  };
}

function groupIds(sections) {
  const groups = new Map();
  for (const metricId of sections.flatMap((section) => section.metricIds)) {
    const group = dashboardSource(metricId);
    const ids = groups.get(group) ?? new Set();
    ids.add(metricId);
    groups.set(group, ids);
  }
  return groups;
}

async function readGroup(group, projectId, query, period, servicePeriod, ids) {
  const periodQuery = servicePeriod ?? query;
  switch (group) {
    case 'progress':
      return { indicators: [await indicatorsService.progress(projectId)] };
    case 'activity':
      return period ? indicatorsService.activity(projectId, query, period) : { indicators: [] };
    case 'github':
      return githubAnalyticsService.read(projectId, periodQuery, servicePeriod);
    case 'tasks':
      if (ids.size === 2 && ids.has('I23') && ids.has('I28'))
        return flowTaskService.currentSummary(projectId);
      return flowTaskService.read(projectId, periodQuery, () => new Date(), servicePeriod);
    case 'sprints':
      return sprintAnalyticsService.read(projectId, { sprintId: query.sprintId });
    case 'quality':
      if (ids.size === 1 && ids.has('I53'))
        return { indicators: [await qualityAnalyticsService.defectStates(projectId)] };
      return qualityAnalyticsService.read(projectId, periodQuery, () => new Date(), servicePeriod);
    case 'traceability':
      return traceabilityAnalyticsService.read(projectId);
    default:
      throw new Error(`Unknown dashboard source: ${group}`);
  }
}

export const dashboardService = {
  async read(projectId, query, now = () => new Date()) {
    const id = Number(projectId);
    const view = query.view ?? 'GENERAL';
    const generatedAt = now().toISOString();
    const project = await prisma.project.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, name: true }
    });
    if (!project) throw resourceNotFoundError('Project');
    const [requestedSprint, responsible] = await Promise.all([
      query.sprintId == null
        ? null
        : prisma.sprint.findFirst({
            where: { id: query.sprintId, projectId: id, deletedAt: null },
            select: { id: true, name: true, status: true }
          }),
      query.responsibleUserId == null
        ? null
        : prisma.projectMembership.findFirst({
            where: { projectId: id, userId: query.responsibleUserId },
            select: { user: { select: { id: true, name: true, anonymizedAt: true } } }
          })
    ]);
    if (query.sprintId != null && !requestedSprint) throw resourceNotFoundError('Sprint');
    if (query.responsibleUserId != null && !responsible) throw resourceNotFoundError('User');
    const period = query.startDate ? normalizeIndicatorPeriod(query) : null;
    const requestedFilters = {
      period: publicPeriod(period),
      sprintId: query.sprintId ?? null,
      responsibleUserId: query.responsibleUserId ?? null
    };
    const sections = DASHBOARD_VIEWS[view];
    const groups = groupIds(sections);
    let internalPeriod = null;
    const requests = [...groups.entries()].map(async ([group, ids]) => {
      if (!period && group === 'activity') return { group, response: { indicators: [] } };
      if (
        !period &&
        CURRENT_WITHOUT_PERIOD[group] &&
        ![...ids].some((metricId) => CURRENT_WITHOUT_PERIOD[group].has(metricId))
      )
        return { group, response: { indicators: [] } };
      const needsRequestedPeriod = [...ids].some((metricId) =>
        INDICATORS[metricId].supportedFilters.includes('period')
      );
      const isCurrentSummary =
        (group === 'tasks' && ids.size === 2 && ids.has('I23') && ids.has('I28')) ||
        (group === 'quality' && ids.size === 1 && ids.has('I53'));
      const servicePeriod = isCurrentSummary
        ? null
        : period && needsRequestedPeriod
          ? period
          : CURRENT_WITHOUT_PERIOD[group]
            ? (internalPeriod ??= currentOnlyPeriod(new Date(generatedAt)))
            : null;
      return { group, response: await readGroup(group, id, query, period, servicePeriod, ids) };
    });
    const settled = await Promise.allSettled(requests);
    const byId = new Map();
    const warnings = [];
    let selectedSprint = requestedSprint;
    for (const [index, outcome] of settled.entries()) {
      const group = [...groups.keys()][index];
      if (outcome.status === 'rejected') {
        if (
          !(outcome.reason instanceof ExternalServiceError) ||
          !['github', 'activity'].includes(group)
        )
          throw outcome.reason;
        warnings.push({ code: 'SOURCE_UNAVAILABLE', source: group });
        continue;
      }
      const response = outcome.value.response;
      if (group === 'sprints' && response.sprint) selectedSprint = response.sprint;
      for (const indicator of response.indicators) byId.set(indicator.metricId, indicator);
    }
    const outputSections = sections.map((section) => ({
      id: section.id,
      indicators: section.metricIds.map((metricId) => {
        const fromSource = byId.get(metricId);
        const requiresPeriod = !period && INDICATORS[metricId].supportedFilters.includes('period');
        const indicator = requiresPeriod
          ? placeholder(metricId, id, generatedAt, 'PERIOD_REQUIRED')
          : (fromSource ?? placeholder(metricId, id, generatedAt, 'SOURCE_UNAVAILABLE'));
        return decorate(indicator, requestedFilters, selectedSprint);
      })
    }));
    const indicators = outputSections.flatMap((section) => section.indicators);
    const githubIndicators = indicators.filter((indicator) => indicator.sourceSyncStatus != null);
    const freshness = {
      local: { generatedAt },
      github: githubIndicators.length
        ? {
            sourceUpdatedAt:
              githubIndicators
                .map((indicator) => indicator.sourceUpdatedAt)
                .filter(Boolean)
                .sort()
                .at(-1) ?? null,
            sourceSyncStatus:
              githubIndicators.map((indicator) => indicator.sourceSyncStatus).find(Boolean) ?? null
          }
        : null
    };
    if (
      !period &&
      indicators.some((indicator) => indicator.limitations.includes('PERIOD_REQUIRED'))
    )
      warnings.push({ code: 'PERIOD_REQUIRED_FOR_EVENT_INDICATORS' });
    if (period && !indicators.some((indicator) => indicator.appliedFilters.period))
      warnings.push({ code: 'PERIOD_FILTER_NOT_APPLIED_TO_VIEW' });
    if (query.sprintId != null && !indicators.some((indicator) => indicator.appliedFilters.sprint))
      warnings.push({ code: 'SPRINT_FILTER_NOT_APPLIED_TO_VIEW' });
    if (
      query.responsibleUserId != null &&
      !indicators.some((indicator) => indicator.appliedFilters.responsible)
    )
      warnings.push({ code: 'RESPONSIBLE_FILTER_NOT_APPLIED_TO_VIEW' });
    return {
      projectId: id,
      dashboardContractVersion: 1,
      view,
      viewState: deriveDashboardViewState(indicators),
      generatedAt,
      requestedFilters,
      context: {
        project,
        sprint: selectedSprint,
        responsible: responsible?.user.anonymizedAt
          ? { userId: responsible.user.id, displayName: null }
          : responsible
            ? { userId: responsible.user.id, displayName: responsible.user.name }
            : null
      },
      freshness,
      sections: outputSections,
      warnings
    };
  }
};
