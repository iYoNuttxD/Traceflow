export const SCHEDULE_PALETTE_STORAGE_KEY = 'traceflow.schedule.palette';
export const SCHEDULE_PALETTE_SLOT_COUNT = 10;

export const SCHEDULE_PALETTES = Object.freeze([
  { value: 'default', label: 'Padrão' },
  { value: 'contrast', label: 'Contraste' },
  { value: 'soft', label: 'Suave' }
]);

const paletteValues = new Set(SCHEDULE_PALETTES.map((palette) => palette.value));

export function isSchedulePalette(value) {
  return paletteValues.has(value);
}

export function readSchedulePalette(storage) {
  try {
    const value = (storage || window.localStorage).getItem(SCHEDULE_PALETTE_STORAGE_KEY);
    return isSchedulePalette(value) ? value : 'default';
  } catch {
    return 'default';
  }
}

export function persistSchedulePalette(value, storage) {
  if (!isSchedulePalette(value)) return;
  try {
    (storage || window.localStorage).setItem(SCHEDULE_PALETTE_STORAGE_KEY, value);
  } catch {
    // Preferência visual local é best-effort e não impede a leitura do cronograma.
  }
}

export function scheduleEntityKey(type, id) {
  return `${type}:${String(id)}`;
}

function uniqueEntities(entities) {
  const byKey = new Map();
  for (const entity of entities) {
    const key = scheduleEntityKey(entity.type, entity.id);
    if (!byKey.has(key)) byKey.set(key, { ...entity, key });
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function assignScheduleEntitySlots({ visible = [], remaining = [], slotCount = 10 } = {}) {
  const count = Math.max(1, Number(slotCount) || 1);
  const visibleEntities = uniqueEntities(visible);
  const visibleKeys = new Set(visibleEntities.map((entity) => entity.key));
  const ordered = [
    ...visibleEntities,
    ...uniqueEntities(remaining).filter((entity) => !visibleKeys.has(entity.key))
  ];
  return new Map(ordered.map((entity, index) => [entity.key, index % count]));
}

export function scheduleEntityStyle(slots, type, id) {
  const slot = slots.get(scheduleEntityKey(type, id)) ?? 0;
  return { '--schedule-entity-color': `var(--schedule-palette-${slot})` };
}
