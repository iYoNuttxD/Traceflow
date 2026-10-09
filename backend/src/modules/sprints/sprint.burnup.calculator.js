import { buildSprintHistoricalProjection } from './sprint.historical.projection.js';

export function buildSprintBurnup({ sprint, events = [], cutoff = new Date(), projection }) {
  const historical = projection ?? buildSprintHistoricalProjection({ sprint, events, cutoff });
  return {
    state: historical.state,
    points: historical.points.map(({ date, scope, completed }) => ({ date, scope, completed })),
    coverage: historical.coverage,
    limitations: historical.limitations
  };
}
