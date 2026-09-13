import { fail } from './test-case.schema.js';
export function encodeCursor(row, field, owner) {
  return Buffer.from(
    JSON.stringify({ v: 1, owner, id: row.id, at: row[field].toISOString() })
  ).toString('base64url');
}
export function cursorWhere(cursor, field, owner) {
  if (!cursor) return {};
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      decoded.v !== 1 ||
      decoded.owner !== owner ||
      !Number.isInteger(decoded.id) ||
      decoded.id < 1 ||
      typeof decoded.at !== 'string' ||
      new Date(decoded.at).toISOString() !== decoded.at ||
      Buffer.from(JSON.stringify(decoded)).toString('base64url') !== cursor
    )
      throw Error();
    return {
      OR: [
        { [field]: { lt: new Date(decoded.at) } },
        { [field]: new Date(decoded.at), id: { lt: decoded.id } }
      ]
    };
  } catch {
    throw fail('Cursor inválido.');
  }
}
export function cursorPage(rows, limit, field, owner) {
  const items = rows.slice(0, limit);
  return {
    items,
    nextCursor: rows.length > limit ? encodeCursor(items.at(-1), field, owner) : null
  };
}
