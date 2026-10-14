export const INDICATOR_STATES = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  NO_DATA: 'NO_DATA',
  PARTIAL: 'PARTIAL',
  STALE: 'STALE',
  UNAVAILABLE: 'UNAVAILABLE'
});

export function activityState(commits, tasks) {
  if (commits.state === 'UNAVAILABLE' && tasks.state === 'UNAVAILABLE') return 'UNAVAILABLE';
  if (
    ['UNAVAILABLE', 'PARTIAL'].includes(commits.state) ||
    ['UNAVAILABLE', 'PARTIAL'].includes(tasks.state)
  )
    return 'PARTIAL';
  if (commits.state === 'STALE' || tasks.state === 'STALE') return 'STALE';
  if (commits.state === 'NO_DATA' && tasks.state === 'NO_DATA') return 'NO_DATA';
  return 'AVAILABLE';
}
