export function calculateProjectProgress({ total, completed }) {
  return {
    value: total === 0 ? null : Number(((completed / total) * 100).toFixed(2)),
    numerator: completed,
    denominator: total,
    state: total === 0 ? 'NO_DATA' : 'AVAILABLE'
  };
}
