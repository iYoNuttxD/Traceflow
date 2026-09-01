import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MAX_PINNED_PROJECTS,
  filterAccessibleProjectIds,
  persistProjectIds,
  quickProjectStorageKeys,
  readProjectIds,
  recordRecentProject,
  selectQuickProjects,
  togglePinnedProject
} from './quick-projects.js';

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function useQuickProjects({
  projects,
  userId,
  activeProjectId,
  catalogLoading,
  catalogError
}) {
  const storage = browserStorage();
  const keys = useMemo(() => quickProjectStorageKeys(userId), [userId]);
  const [pinnedIds, setPinnedIds] = useState(() =>
    storage ? readProjectIds(storage, keys.pinned) : []
  );
  const [recentIds, setRecentIds] = useState(() =>
    storage ? readProjectIds(storage, keys.recent) : []
  );
  const [feedback, setFeedback] = useState('');
  const currentKeysRef = useRef(keys);

  useEffect(() => {
    if (currentKeysRef.current.pinned === keys.pinned) return;
    currentKeysRef.current = keys;
    setPinnedIds(storage ? readProjectIds(storage, keys.pinned) : []);
    setRecentIds(storage ? readProjectIds(storage, keys.recent) : []);
    setFeedback('');
  }, [keys, storage]);

  useEffect(() => {
    if (catalogLoading || catalogError) return;
    setPinnedIds((current) => {
      const filtered = filterAccessibleProjectIds(current, projects).slice(0, MAX_PINNED_PROJECTS);
      if (arraysEqual(current, filtered)) return current;
      if (storage) persistProjectIds(storage, keys.pinned, filtered);
      return filtered;
    });
    setRecentIds((current) => {
      const filtered = filterAccessibleProjectIds(current, projects);
      if (arraysEqual(current, filtered)) return current;
      if (storage) persistProjectIds(storage, keys.recent, filtered);
      return filtered;
    });
  }, [catalogError, catalogLoading, keys.pinned, keys.recent, projects, storage]);

  useEffect(() => {
    if (catalogLoading || catalogError || !activeProjectId) return;
    const accessible = projects.some((project) => String(project.id) === String(activeProjectId));
    if (!accessible) return;
    setRecentIds((current) => {
      const next = recordRecentProject(current, activeProjectId);
      if (arraysEqual(current, next)) return current;
      if (storage) persistProjectIds(storage, keys.recent, next);
      return next;
    });
  }, [activeProjectId, catalogError, catalogLoading, keys.recent, projects, storage]);

  const togglePinned = useCallback(
    (projectId) => {
      const result = togglePinnedProject(pinnedIds, projectId);
      if (result.limitReached) {
        setFeedback('Você pode fixar no máximo 5 projetos.');
        return false;
      }
      setFeedback('');
      setPinnedIds(result.ids);
      if (storage) persistProjectIds(storage, keys.pinned, result.ids);
      return true;
    },
    [keys.pinned, pinnedIds, storage]
  );

  const quickProjects = useMemo(
    () => selectQuickProjects(projects, pinnedIds, recentIds),
    [pinnedIds, projects, recentIds]
  );

  return { quickProjects, pinnedIds, recentIds, feedback, togglePinned };
}
