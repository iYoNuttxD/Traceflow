export const SCHEDULE_COLOR_SLOT_COUNT = 10;

export function scheduleEntityKey(type, id) {
  return `${type}:${String(id)}`;
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function uniqueEntities(entities) {
  const byKey = new Map();
  for (const entity of entities) {
    const key = scheduleEntityKey(entity.type, entity.id);
    if (!byKey.has(key)) byKey.set(key, { ...entity, key });
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function validSlot(slot, slotCount) {
  return Number.isInteger(slot) && slot >= 0 && slot < slotCount;
}

function availableSlot(key, usedSlots, slotCount, previousSlot) {
  const preferred = validSlot(previousSlot, slotCount) ? previousSlot : stableHash(key) % slotCount;
  for (let offset = 0; offset < slotCount; offset += 1) {
    const candidate = (preferred + offset) % slotCount;
    if (!usedSlots.has(candidate)) return candidate;
  }
  return preferred;
}

export function assignScheduleEntitySlots({
  visible = [],
  remaining = [],
  previousSlots = new Map(),
  previousVisibleKeys = new Set(),
  slotCount = SCHEDULE_COLOR_SLOT_COUNT
} = {}) {
  const count = Math.max(1, Number(slotCount) || 1);
  const visibleEntities = uniqueEntities(visible);
  const visibleKeys = new Set(visibleEntities.map((entity) => entity.key));
  const shared = visibleEntities.filter((entity) => previousVisibleKeys.has(entity.key));
  const entering = visibleEntities.filter((entity) => !previousVisibleKeys.has(entity.key));
  const slots = new Map();
  const usedVisibleSlots = new Set();

  for (const entity of [...shared, ...entering]) {
    const slot = availableSlot(entity.key, usedVisibleSlots, count, previousSlots.get(entity.key));
    slots.set(entity.key, slot);
    usedVisibleSlots.add(slot);
  }

  for (const entity of uniqueEntities(remaining)) {
    if (visibleKeys.has(entity.key)) continue;
    const previousSlot = previousSlots.get(entity.key);
    slots.set(
      entity.key,
      validSlot(previousSlot, count) ? previousSlot : stableHash(entity.key) % count
    );
  }

  return slots;
}

export function scheduleEntityStyle(slots, type, id) {
  const slot = slots.get(scheduleEntityKey(type, id)) ?? 0;
  return { '--schedule-entity-color': `var(--schedule-color-${slot})` };
}
