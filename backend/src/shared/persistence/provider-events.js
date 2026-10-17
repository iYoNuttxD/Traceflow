const CHUNK = 500;

export async function unseenProviderEvents(model, projectId, events) {
  const seen = new Set();
  const ids = [...new Set(events.map((event) => event.providerEventId))];
  for (let offset = 0; offset < ids.length; offset += CHUNK) {
    const rows = await model.findMany({
      where: { projectId, providerEventId: { in: ids.slice(offset, offset + CHUNK) } },
      select: { providerEventId: true }
    });
    for (const row of rows) seen.add(row.providerEventId);
  }
  const fresh = [];
  for (const event of events)
    if (!seen.has(event.providerEventId)) {
      seen.add(event.providerEventId);
      fresh.push(event);
    }
  return fresh;
}

export async function artifactsByNumber(model, projectId, numbers, select) {
  const found = new Map();
  const unique = [...new Set(numbers)];
  for (let offset = 0; offset < unique.length; offset += CHUNK) {
    const rows = await model.findMany({
      where: { projectId, number: { in: unique.slice(offset, offset + CHUNK) } },
      select: { ...select, number: true }
    });
    for (const row of rows) found.set(row.number, row);
  }
  return found;
}

export async function insertInChunks(model, rows) {
  let count = 0;
  for (let offset = 0; offset < rows.length; offset += CHUNK) {
    const result = await model.createMany({
      data: rows.slice(offset, offset + CHUNK),
      skipDuplicates: true
    });
    count += result.count;
  }
  return count;
}
