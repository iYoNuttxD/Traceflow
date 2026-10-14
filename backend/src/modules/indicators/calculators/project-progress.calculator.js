import { percentage } from './statistics.calculator.js';

export function calculateProjectProgress({ total, completed }) {
  return {
    value: percentage(completed, total),
    numerator: completed,
    denominator: total,
    state: total === 0 ? 'NO_DATA' : 'AVAILABLE'
  };
}
