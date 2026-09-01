export const MAX_QUICK_PROJECTS = 5;
export const MAX_PINNED_PROJECTS = 5;

function normalizeId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const id = String(value).trim();
  return id || null;
}

export function uniqueProjectIds(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(normalizeId).filter(Boolean))];
}

export function readProjectIds(storage, key) {
  try {
    return uniqueProjectIds(JSON.parse(storage.getItem(key) || '[]'));
  } catch {
    return [];
  }
}

export function persistProjectIds(storage, key, ids) {
  try {
    storage.setItem(key, JSON.stringify(uniqueProjectIds(ids)));
  } catch {
    // Preferências locais não podem interromper a navegação autenticada.
  }
}

export function quickProjectStorageKeys(userId) {
  const scope = normalizeId(userId) || 'anonymous';
  return {
    pinned: `traceflow.projects.pinned:${scope}`,
    recent: `traceflow.projects.recent:${scope}`
  };
}

export function filterAccessibleProjectIds(ids, projects) {
  const accessibleIds = new Set(projects.map((project) => String(project.id)));
  return uniqueProjectIds(ids).filter((id) => accessibleIds.has(id));
}

export function recordRecentProject(recentIds, projectId) {
  const id = normalizeId(projectId);
  if (!id) return uniqueProjectIds(recentIds);
  return [id, ...uniqueProjectIds(recentIds).filter((recentId) => recentId !== id)];
}

export function togglePinnedProject(pinnedIds, projectId) {
  const ids = uniqueProjectIds(pinnedIds);
  const id = normalizeId(projectId);
  if (!id) return { ids, limitReached: false };
  if (ids.includes(id)) {
    return { ids: ids.filter((pinnedId) => pinnedId !== id), limitReached: false };
  }
  if (ids.length >= MAX_PINNED_PROJECTS) return { ids, limitReached: true };
  return { ids: [...ids, id], limitReached: false };
}

export function selectQuickProjects(projects, pinnedIds, recentIds) {
  const byId = new Map(projects.map((project) => [String(project.id), project]));
  const accessiblePinned = uniqueProjectIds(pinnedIds).filter((id) => byId.has(id));
  const pinnedSet = new Set(accessiblePinned);
  const accessibleRecent = uniqueProjectIds(recentIds).filter(
    (id) => byId.has(id) && !pinnedSet.has(id)
  );

  return [...accessiblePinned, ...accessibleRecent]
    .slice(0, MAX_QUICK_PROJECTS)
    .map((id) => ({ project: byId.get(id), pinned: pinnedSet.has(id) }));
}
