import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createTaskComment,
  deleteTaskComment,
  getTaskComments,
  updateTaskComment
} from '../api/tasks.api.js';
import { useProjectEvents } from '../../projects/index.js';
import { normalizeApiError } from '../../../shared/index.js';

const fallbackMessage = 'Não foi possível processar os comentários da tarefa.';
const reconciliationErrorMessage =
  'Não foi possível reconciliar os comentários após restabelecer a conexão.';
export const COMMENTS_PAGE_SIZE = 30;
export const COMMENT_EVENT_TYPES = Object.freeze([
  'task.comment.created',
  'task.comment.updated',
  'task.comment.deleted'
]);

function sortChronologically(comments) {
  return [...comments].sort((left, right) => {
    const dateDifference = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    if (dateDifference !== 0) return dateDifference;
    return Number(left.id) - Number(right.id);
  });
}

function versionOf(comment) {
  return new Date(comment.deletedAt || comment.editedAt || comment.createdAt).getTime();
}

function versionRank(comment) {
  if (comment.deletedAt) return 2;
  if (comment.editedAt) return 1;
  return 0;
}

function isNewer(existing, incoming) {
  const difference = versionOf(incoming) - versionOf(existing);
  if (difference !== 0) return difference > 0;
  return versionRank(incoming) > versionRank(existing);
}

export function mergeTaskComments(current, incoming) {
  const commentsById = new Map(current.map((comment) => [comment.id, comment]));
  for (const comment of incoming) {
    const existing = commentsById.get(comment.id);
    if (!existing || isNewer(existing, comment)) commentsById.set(comment.id, comment);
  }
  return sortChronologically([...commentsById.values()]);
}

export function useTaskComments({ taskId }) {
  const { connectionState, reconnectSequence, subscribe } = useProjectEvents();
  const [comments, setComments] = useState([]);
  const [permissions, setPermissions] = useState({ canComment: false, canModerate: false });
  const [hasOlder, setHasOlder] = useState(false);
  const [loading, setLoading] = useState(Boolean(taskId));
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState(null);
  const [error, setError] = useState('');
  const [syncError, setSyncError] = useState('');
  const [lastUpdate, setLastUpdate] = useState({ sequence: 0, source: 'reset', addedIds: [] });

  const commentsRef = useRef([]);
  const nextCursorRef = useRef(null);
  const contextRef = useRef({ taskId, generation: 0 });
  const readSequenceRef = useRef(0);
  const readControllerRef = useRef(null);
  const readInFlightRef = useRef(false);
  const olderRequestRef = useRef(0);
  const mutationSequenceRef = useRef(0);
  const mutationPendingRef = useRef(false);
  const updateSequenceRef = useRef(0);
  const reconnectRef = useRef({ taskId, sequence: reconnectSequence });
  const reconciliationPendingRef = useRef(false);

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
    async ({ source = 'recovery', resetCursor = true, preempt = true } = {}) => {
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
          { limit: COMMENTS_PAGE_SIZE },
          { signal: request.controller.signal }
        );
        if (!readIsCurrent(request)) return false;

        const incoming = [...(data.comments || [])].reverse();
        const current = commentsRef.current;
        const existingIds = new Set(current.map((comment) => comment.id));
        const next = mergeTaskComments(current, incoming);
        const addedIds = incoming
          .filter((comment) => !existingIds.has(comment.id))
          .map((comment) => comment.id);

        publishComments(next, source, addedIds);
        setPermissions(data.permissions || { canComment: false, canModerate: false });
        if (resetCursor) {
          nextCursorRef.current = data.pagination?.nextCursor || null;
          setHasOlder(Boolean(data.pagination?.hasMore));
        }
        setSyncError('');
        return true;
      } catch (cause) {
        if (!readIsCurrent(request)) return false;
        if (source === 'initial') {
          setError(normalizeApiError(cause, fallbackMessage).message);
        } else {
          setSyncError(reconciliationErrorMessage);
        }
        return false;
      } finally {
        if (readIsCurrent(request)) {
          readInFlightRef.current = false;
          readControllerRef.current = null;
          setLoading(false);
        }
      }
    },
    [beginRead, publishComments, readIsCurrent, taskId]
  );

  useEffect(() => {
    contextRef.current = { taskId, generation: contextRef.current.generation + 1 };
    invalidateReads();
    mutationSequenceRef.current += 1;
    mutationPendingRef.current = false;
    nextCursorRef.current = null;
    reconciliationPendingRef.current = false;
    reconnectRef.current = { taskId, sequence: reconnectRef.current.sequence };
    publishComments([], 'reset');
    setPermissions({ canComment: false, canModerate: false });
    setHasOlder(false);
    setLoading(Boolean(taskId));
    setLoadingOlder(false);
    setSubmitting(false);
    setActionId(null);
    setError('');
    setSyncError('');
    if (taskId) void refreshLatest({ source: 'initial', resetCursor: true });

    const generation = contextRef.current.generation;
    return () => {
      if (contextRef.current.generation === generation) {
        invalidateReads();
        mutationSequenceRef.current += 1;
        mutationPendingRef.current = false;
      }
    };
  }, [invalidateReads, publishComments, refreshLatest, taskId]);

  useEffect(
    () =>
      subscribe(COMMENT_EVENT_TYPES, (event) => {
        if (String(event.taskId) !== String(contextRef.current.taskId)) return;
        const incoming = event.data?.comment;
        if (!incoming?.id) return;

        const current = commentsRef.current;
        const existing = current.find((comment) => comment.id === incoming.id);
        const next = mergeTaskComments(current, [incoming]);
        const merged = next.find((comment) => comment.id === incoming.id);
        if (existing && merged === existing) return;

        publishComments(
          next,
          event.type,
          event.type === 'task.comment.created' && !existing ? [incoming.id] : []
        );
      }),
    [publishComments, subscribe]
  );

  useEffect(() => {
    const previous = reconnectRef.current;
    if (String(previous.taskId) !== String(taskId)) {
      reconnectRef.current = { taskId, sequence: reconnectSequence };
      return;
    }
    if (reconnectSequence <= previous.sequence) {
      reconnectRef.current.sequence = reconnectSequence;
      return;
    }

    reconnectRef.current.sequence = reconnectSequence;
    if (mutationPendingRef.current) {
      reconciliationPendingRef.current = true;
      return;
    }
    void refreshLatest({ source: 'reconnect', resetCursor: true, preempt: true });
  }, [reconnectSequence, refreshLatest, taskId]);

  const loadOlder = useCallback(async () => {
    const cursor = nextCursorRef.current;
    if (!taskId || !cursor || olderRequestRef.current || mutationPendingRef.current) return false;

    const request = beginRead();
    olderRequestRef.current = request.requestId;
    setLoadingOlder(true);
    setError('');

    try {
      const data = await getTaskComments(
        taskId,
        { limit: COMMENTS_PAGE_SIZE, before: cursor },
        { signal: request.controller.signal }
      );
      if (!readIsCurrent(request)) return false;

      const older = [...(data.comments || [])].reverse();
      const existingIds = new Set(commentsRef.current.map((comment) => comment.id));
      const addedIds = older
        .filter((comment) => !existingIds.has(comment.id))
        .map((comment) => comment.id);
      publishComments(mergeTaskComments(commentsRef.current, older), 'older', addedIds);
      nextCursorRef.current = data.pagination?.nextCursor || null;
      setHasOlder(Boolean(data.pagination?.hasMore));
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
  }, [beginRead, publishComments, readIsCurrent, taskId]);

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

  const finishMutation = useCallback(
    (request) => {
      if (!mutationIsCurrent(request)) return;
      mutationPendingRef.current = false;
      if (reconciliationPendingRef.current) {
        reconciliationPendingRef.current = false;
        void refreshLatest({ source: 'reconnect', resetCursor: true, preempt: true });
      }
    },
    [mutationIsCurrent, refreshLatest]
  );

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
        const existing = commentsRef.current.some((comment) => comment.id === data.comment.id);
        publishComments(
          mergeTaskComments(commentsRef.current, [data.comment]),
          'create',
          existing ? [] : [data.comment.id]
        );
        completed = true;
      } catch (cause) {
        if (mutationIsCurrent(request)) setError(normalizeApiError(cause, fallbackMessage).message);
      } finally {
        if (mutationIsCurrent(request)) {
          setSubmitting(false);
          finishMutation(request);
        }
      }
      return completed;
    },
    [beginMutation, finishMutation, mutationIsCurrent, publishComments, taskId]
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
        publishComments(mergeTaskComments(commentsRef.current, [data.comment]), 'edit');
        completed = true;
      } catch (cause) {
        if (mutationIsCurrent(request)) setError(normalizeApiError(cause, fallbackMessage).message);
      } finally {
        if (mutationIsCurrent(request)) {
          setActionId(null);
          finishMutation(request);
        }
      }
      return completed;
    },
    [beginMutation, finishMutation, mutationIsCurrent, publishComments, taskId]
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
        publishComments(mergeTaskComments(commentsRef.current, [data.comment]), 'delete');
        completed = true;
      } catch (cause) {
        if (mutationIsCurrent(request)) setError(normalizeApiError(cause, fallbackMessage).message);
      } finally {
        if (mutationIsCurrent(request)) {
          setActionId(null);
          finishMutation(request);
        }
      }
      return completed;
    },
    [beginMutation, finishMutation, mutationIsCurrent, publishComments, taskId]
  );

  return {
    comments,
    permissions,
    hasOlder,
    loading,
    loadingOlder,
    submitting,
    actionId,
    error,
    syncError,
    connectionState,
    lastUpdate,
    loadOlder,
    retryRefresh: () => refreshLatest({ source: 'recovery', resetCursor: true, preempt: true }),
    addComment,
    editComment,
    removeComment
  };
}
