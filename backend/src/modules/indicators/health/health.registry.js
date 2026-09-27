export const HEALTH_MODEL_VERSION = 1;

export const HEALTH_DIMENSIONS = Object.freeze({
  PLANNING: { weight: 20, signals: { I28: 40, I29: 30, I30: 30 } },
  FLOW: { weight: 20, signals: { I20: 40, I21: 60 } },
  SPRINT: { weight: 15, signals: { I44: 30, I45: 50, I71: 20 } },
  QUALITY: { weight: 25, signals: { I04: 15, I49: 25, I52: 20, I58: 20, I64: 20 } },
  TRACEABILITY: { weight: 15, signals: { I61: 20, I62: 20, I63: 20, I65: 20, I66: 20 } },
  TECHNICAL_INTEGRATION: { weight: 5, signals: { I15: 60, I73: 40 } }
});

const ids = (start, end) =>
  Array.from(
    { length: end - start + 1 },
    (_, index) => `I${String(start + index).padStart(2, '0')}`
  );

// All IDs in the canonical S2 catalog are classified, including capabilities
// and proposals that are deliberately absent from the runtime indicator API.
const registry = Object.fromEntries(ids(1, 74).map((id) => [id, { healthRole: 'CONTEXT_ONLY' }]));
for (const [dimension, definition] of Object.entries(HEALTH_DIMENSIONS)) {
  for (const [metricId, weight] of Object.entries(definition.signals))
    registry[metricId] = { healthRole: 'SCORING_SIGNAL', healthDimension: dimension, weight };
}
for (const metricId of ['I06', 'I16', 'I46', 'I50', 'I51'])
  registry[metricId] = { healthRole: 'REDUNDANT' };
for (const metricId of ['I19', 'I69', 'I70']) registry[metricId] = { healthRole: 'UNIMPLEMENTED' };
registry.I68 = { healthRole: 'NOT_RECOMMENDED' };

export const HEALTH_REGISTRY = Object.freeze(
  Object.fromEntries(
    Object.entries(registry).map(([id, entry]) => [
      id,
      Object.freeze({
        ...entry,
        healthDimension: entry.healthDimension ?? null,
        healthModelVersion: 1
      })
    ])
  )
);
