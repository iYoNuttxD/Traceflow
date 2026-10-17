function canonical(value) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return { $date: value.getTime() };
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])])
    );
  return value;
}

const fingerprint = (value) => JSON.stringify(canonical(value));

export function changedFields(stored, incoming, fields) {
  const changes = {};
  for (const field of fields) {
    const next = incoming[field] ?? null;
    if (fingerprint(stored[field]) !== fingerprint(next)) changes[field] = next;
  }
  return changes;
}

export function selectFields(fields) {
  return Object.fromEntries(fields.map((field) => [field, true]));
}

export function lastByKey(items, key) {
  return [...new Map(items.map((item) => [item[key], item])).values()];
}
