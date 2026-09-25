export function roundMetric(value) {
  return Number(value.toFixed(2));
}

export function percentage(numerator, denominator) {
  return denominator === 0 ? null : roundMetric((numerator / denominator) * 100);
}

export function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[midpoint - 1] + sorted[midpoint]) / 2 : sorted[midpoint];
}

export function mean(values) {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function durationSample(rows, startField, endField, unitMilliseconds) {
  const durations = [];
  let excludedCount = 0;
  for (const row of rows) {
    const start = row[startField]?.getTime();
    const end = row[endField]?.getTime();
    if (
      start == null ||
      end == null ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end < start
    ) {
      excludedCount++;
      continue;
    }
    durations.push((end - start) / unitMilliseconds);
  }
  return { durations, eligibleCount: durations.length, excludedCount };
}
