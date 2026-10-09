import { INDICATORS } from './indicators.catalog.js';

export function indicatorResult(metricId, projectId, data, asOf) {
  const definition = INDICATORS[metricId];
  return {
    projectId,
    metricId,
    rf: definition.rf,
    definitionVersion: definition.definitionVersion,
    eventClock: definition.eventClock,
    value: data.value,
    unit: definition.unit,
    numerator: data.numerator ?? null,
    denominator: data.denominator ?? null,
    period: data.period ?? null,
    scope: data.scope ?? { projectId },
    state: data.state,
    asOf,
    sourceUpdatedAt: data.sourceUpdatedAt ?? null,
    sourceSyncStatus: data.sourceSyncStatus ?? null,
    formula: definition.formula,
    sources: definition.sources,
    limitations: data.limitations ?? [],
    ...(data.distribution ? { distribution: data.distribution } : {}),
    ...(data.people ? { people: data.people } : {}),
    ...(data.unassociated ? { unassociated: data.unassociated } : {}),
    ...(data.components ? { components: data.components } : {}),
    ...(data.kind ? { kind: data.kind } : {}),
    ...(data.items ? { items: data.items } : {}),
    ...(data.points ? { points: data.points } : {}),
    ...(data.eligibleCount !== undefined ? { eligibleCount: data.eligibleCount } : {}),
    ...(data.excludedCount !== undefined ? { excludedCount: data.excludedCount } : {}),
    ...(data.coverage ? { coverage: data.coverage } : {})
  };
}
