export function calculateDistribution(rows, { responsibility = false } = {}) {
  const people = [];
  let total = 0;
  let unassociated = 0;
  let unassignedHistoricalCount = 0;
  let unassignedCount = 0;
  for (const row of rows) {
    const count = Number(row.count);
    total += count;
    if (row.knownUnassigned) unassignedCount += count;
    if (row.unknownHistorical) unassignedHistoricalCount += count;
    if (row.userId == null) unassociated += count;
    else people.push({ userId: Number(row.userId), displayName: row.displayName, count });
  }
  people.sort((a, b) => a.displayName.localeCompare(b.displayName) || a.userId - b.userId);
  return {
    total,
    associated: total - unassociated,
    unassociated,
    unassignedHistoricalCount,
    ...(responsibility ? { unassignedCount } : {}),
    people
  };
}

export function combineActivity(commits, tasks, { commitsAvailable = true } = {}) {
  const people = new Map();
  for (const person of tasks.people ?? []) {
    people.set(person.userId, {
      userId: person.userId,
      displayName: person.displayName,
      completedTasks: person.count,
      commits: commitsAvailable ? 0 : null
    });
  }
  for (const person of commits.people ?? []) {
    const existing = people.get(person.userId);
    if (existing) existing.commits = person.count;
    else
      people.set(person.userId, {
        userId: person.userId,
        displayName: person.displayName,
        completedTasks: 0,
        commits: person.count
      });
  }
  return [...people.values()].sort(
    (a, b) => a.displayName.localeCompare(b.displayName) || a.userId - b.userId
  );
}
