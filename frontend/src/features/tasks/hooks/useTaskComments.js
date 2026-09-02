import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createTaskComment,
  deleteTaskComment,
  getTaskComments,
  updateTaskComment
} from '../api/tasks.api.js';
import { normalizeApiError, useVisibilityAwarePolling } from '../../../shared/index.js';

const fallbackMessage = 'Não foi possível processar os comentários da tarefa.';
const refreshRecoveryMessage =
  'Alteração concluída, mas não foi possível atualizar os comentários.';
export const COMMENTS_PAGE_SIZE = 5;
export const COMMENTS_POLL_INTERVAL_MS = 5000;

function sortChronologically(comments) {
  return [...comments].sort((left, right) => {
    const dateDifference = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    if (dateDifference !== 0) return dateDifference;
    return Number(left.id) - Number(right.id);
  });
}

function mergeComments(current, incoming, { overwrite = true } = {}) {
  const commentsById = new Map(current.map((comment) => [comment.id, comment]));
  for (const comment of incoming) {
    if (overwrite || !commentsById.has(comment.id)) commentsById.set(comment.id, comment);
  }
  return sortChronologically([...commentsById.values()]);
}

export function useTaskComments({ taskId }) {
  const [comments, setComments] = useState([]);
  const [permissions, setPermissions] = useState({ canComment: false, canModerate: false });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(Boolean(taskId));
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState(null);
  const [error, setError] = useState('');
  const [syncError, setSyncError] = useState('');
  const [lastUpdate, setLastUpdate] = useState({ sequence: 0, source: 'reset', addedIds: [] });

  const commentsRef = useRef([]);
  const loadedPagesRef = useRef(0);
  const contextRef = useRef({ taskId, generation: 0 });
  const readSequenceRef = useRef(0);
  const readControllerRef = useRef(null);
  const readInFlightRef = useRef(false);
  const olderRequestRef = useRef(0);
  const mutationSequenceRef = useRef(0);
  const mutationPendingRef = useRef(false);
  const updateSequenceRef = useRef(0);

  const publishComments = useCallback((nextComments, source, addedIds = []) => {
    commentsRef.current = nextComments;
    setComments(nextComments);
    updateSequenceRef.current += 1;
    setLastUpdate({ sequence: updateSequenceRef.current, source, addedIds });
  }, []);

  const invalidateReads = useCallback(() => {
    readSequenceRef.current += 1;
    readControllerRef.current?.abort();
    readControllerRef.current = null;
    readInFlightRef.current = false;
    olderRequestRef.current = 0;
  }, []);

  const beginRead = useCallback(({ preempt = true } = {}) => {
    if (!preempt && readInFlightRef.current) return null;

    readSequenceRef.current += 1;
    readControllerRef.current?.abort();
    const controller = new AbortController();
    readControllerRef.current = controller;
    readInFlightRef.current = true;

    return {
      controller,
      generation: contextRef.current.generation,
      requestId: readSequenceRef.current,
      taskId: contextRef.current.taskId
    };
  }, []);

  const readIsCurrent = useCallback(
    (request) =>
      request &&
      !request.controller.signal.aborted &&
      request.requestId === readSequenceRef.current &&
      request.generation === contextRef.current.generation &&
      String(request.taskId) === String(contextRef.current.taskId),
    []
  );

  const refreshLatest = useCallback(
    async ({ source = 'background', recoveryAfterMutation = false, preempt = true } = {}) => {
      if (!taskId || mutationPendingRef.current) return false;

      const request = beginRead({ preempt });
      if (!request) return false;

      olderRequestRef.current = 0;
      setLoadingOlder(false);
      if (source === 'initial') {
        setLoading(true);
        setError('');
      }

      try {
        const data = await getTaskComments(
          taskId,
          { page: 1, limit: COMMENTS_PAGE_SIZE },
          { signal: request.controller.signal }
        );
        if (!readIsCurrent(request)) return false;

        const incoming = [...(data.comments || [])].reverse();
        const current = commentsRef.current;
        const next =
          source === 'initial' ? sortChronologically(incoming) : mergeComments(current, incoming);
        const existingIds = new Set(current.map((comment) => comment.id));
        const addedIds = incoming
          .filter((comment) => !existingIds.has(comment.id))
          .map((comment) => comment.id);

        publishComments(next, source, addedIds);
        setPermissions(data.permissions || { canComment: false, canModerate: false });
        setTotal(Math.max(data.pagination?.total ?? data.total ?? 0, next.length));
        if (source === 'initial') loadedPagesRef.current = 1;
        setSyncError('');
        return true;
      } catch (cause) {
        if (!readIsCurrent(request)) return false;
        if (source === 'initial') {
          setError(normalizeApiError(cause, fallbackMessage).message);
        } else if (recoveryAfterMutation) {
          setSyncError(refreshRecoveryMessage);
        } else if (source === 'poll') {
          setSyncError('Não foi possível sincronizar os comentários mais recentes.');
        } else {
          setError(normalizeApiError(cause, fallbackMessage).message);
        }
        return false;
      } finally {
        if (readIsCurrent(request)) {
          readInFlightRef.current = false;
          readControllerRef.current = null;
          if (source === 'initial') setLoading(false);
        }
      }
    },
    [beginRead, publishComments, readIsCurrent, taskId]
  );

  useEffect(() => {
    contextRef.current = {
      taskId,
      generation: contextRef.current.generation + 1
    };
    invalidateReads();
    mutationSequenceRef.current += 1;
    mutationPendingRef.current = false;
    loadedPagesRef.current = 0;
    publishComments([], 'reset');
    setPermissions({ canComment: false, canModerate: false });
    setTotal(0);
    setLoading(Boolean(taskId));
    setLoadingOlder(false);
    setSubmitting(false);
    setActionId(null);
    setError('');
    setSyncError('');

    if (taskId) void refreshLatest({ source: 'initial' });

    const generation = contextRef.current.generation;
    return () => {
      if (contextRef.current.generation === generation) {
        invalidateReads();
        mutationSequenceRef.current += 1;
        mutationPendingRef.current = false;
      }
    };
  }, [invalidateReads, publishComments, refreshLatest, taskId]);

  const loadOlder = useCallback(async () => {
    if (
      !taskId ||
      olderRequestRef.current ||
      commentsRef.current.length >= total ||
      mutationPendingRef.current
    ) {
      return false;
    }

    const nextPage = loadedPagesRef.current + 1;
    const request = beginRead();
    olderRequestRef.current = request.requestId;
    setLoadingOlder(true);
    setError('');

    try {
      const data = await getTaskComments(
        taskId,
        { page: nextPage, limit: COMMENTS_PAGE_SIZE },
        { signal: request.controller.signal }
      );
      if (!readIsCurrent(request)) return false;

      const older = [...(data.comments || [])].reverse();
      const existingIds = new Set(commentsRef.current.map((comment) => comment.id));
      const addedIds = older
        .filter((comment) => !existingIds.has(comment.id))
        .map((comment) => comment.id);
      const next = mergeComments(commentsRef.current, older, { overwrite: false });
      publishComments(next, 'older', addedIds);
      setTotal(Math.max(data.pagination?.total ?? data.total ?? 0, next.length));
      loadedPagesRef.current = nextPage;
      return true;
    } catch (cause) {
      if (!readIsCurrent(request)) return false;
      setError(normalizeApiError(cause, fallbackMessage).message);
      return false;
    } finally {
      if (readIsCurrent(request)) {
        readInFlightRef.current = false;
        readControllerRef.current = null;
        olderRequestRef.current = 0;
        setLoadingOlder(false);
      }
    }
  }, [beginRead, publishComments, readIsCurrent, taskId, total]);

  const beginMutation = useCallback(() => {
    if (!taskId || mutationPendingRef.current) return null;

    invalidateReads();
    mutationPendingRef.current = true;
    setLoadingOlder(false);
    mutationSequenceRef.current += 1;
    return {
      generation: contextRef.current.generation,
      mutationId: mutationSequenceRef.current,
      taskId: contextRef.current.taskId
    };
  }, [invalidateReads, taskId]);

  const mutationIsCurrent = useCallback(
    (request) =>
      request &&
      request.mutationId === mutationSequenceRef.current &&
      request.generation === contextRef.current.generation &&
      String(request.taskId) === String(contextRef.current.taskId),
    []
  );

  const reconcileMutation = useCallback(() => {
    void refreshLatest({ source: 'mutation', recoveryAfterMutation: true });
  }, [refreshLatest]);

  const addComment = useCallback(
    async (content) => {
      const request = beginMutation();
      if (!request) return false;

      setSubmitting(true);
      setError('');
      setSyncError('');
      let completed = false;

      try {
        const data = await createTaskComment(taskId, content);
        if (!mutationIsCurrent(request)) return false;

        const existed = commentsRef.current.some((comment) => comment.id === data.comment.id);
        const next = mergeComments(commentsRef.current, [data.comment]);
        publishComments(next, 'create', existed ? [] : [data.comment.id]);
        setTotal((current) => Math.max(current + (existed ? 0 : 1), next.length));
        completed = true;
      } catch (cause) {
        if (mutationIsCurrent(request)) {
          setError(normalizeApiError(cause, fallbackMessage).message);
        }
      } finally {
        if (mutationIsCurrent(request)) {
          mutationPendingRef.current = false;
          setSubmitting(false);
        }
      }

      if (completed && mutationIsCurrent(request)) reconcileMutation();
      return completed;
    },
    [beginMutation, mutationIsCurrent, publishComments, reconcileMutation, taskId]
  );

  const editComment = useCallback(
    async (commentId, content) => {
      const request = beginMutation();
      if (!request) return false;

      setActionId(commentId);
      setError('');
      setSyncError('');
      let completed = false;

      try {
        const data = await updateTaskComment(taskId, commentId, content);
        if (!mutationIsCurrent(request)) return false;

        publishComments(mergeComments(commentsRef.current, [data.comment]), 'edit');
        completed = true;
      } catch (cause) {
        if (mutationIsCurrent(request)) {
          setError(normalizeApiError(cause, fallbackMessage).message);
        }
      } finally {
        if (mutationIsCurrent(request)) {
          mutationPendingRef.current = false;
          setActionId(null);
        }
      }

      if (completed && mutationIsCurrent(request)) reconcileMutation();
      return completed;
    },
    [beginMutation, mutationIsCurrent, publishComments, reconcileMutation, taskId]
  );

  const removeComment = useCallback(
    async (commentId) => {
      const request = beginMutation();
      if (!request) return false;

      setActionId(commentId);
      setError('');
      setSyncError('');
      let completed = false;

      try {
        const data = await deleteTaskComment(taskId, commentId);
        if (!mutationIsCurrent(request)) return false;

        publishComments(mergeComments(commentsRef.current, [data.comment]), 'delete');
        completed = true;
      } catch (cause) {
        if (mutationIsCurrent(request)) {
          setError(normalizeApiError(cause, fallbackMessage).message);
        }
      } finally {
        if (mutationIsCurrent(request)) {
          mutationPendingRef.current = false;
          setActionId(null);
        }
      }

      if (completed && mutationIsCurrent(request)) reconcileMutation();
      return completed;
    },
    [beginMutation, mutationIsCurrent, publishComments, reconcileMutation, taskId]
  );

  const pollComments = useCallback(
    () => refreshLatest({ source: 'poll', preempt: false }),
    [refreshLatest]
  );
  useVisibilityAwarePolling({
    enabled: Boolean(taskId) && !loading,
    intervalMs: COMMENTS_POLL_INTERVAL_MS,
    callback: pollComments
  });

  return {
    comments,
    permissions,
    total,
    hasOlder: comments.length < total,
    loading,
    loadingOlder,
    submitting,
    actionId,
    error,
    syncError,
    lastUpdate,
    loadOlder,
    retryRefresh: () =>
      refreshLatest({ source: 'recovery', recoveryAfterMutation: true, preempt: true }),
    addComment,
    editComment,
    removeComment
  };
}
