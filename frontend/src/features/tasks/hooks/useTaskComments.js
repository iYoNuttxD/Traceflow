import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createTaskComment,
  deleteTaskComment,
  getTaskComments,
  updateTaskComment
} from '../api/tasks.api.js';
import { normalizeApiError, useAbortableRequest } from '../../../shared/index.js';

const fallbackMessage = 'Não foi possível processar os comentários da tarefa.';
export const COMMENTS_PAGE_SIZE = 5;

// A API pagina do mais recente para o mais antigo; o chat exibe em ordem cronológica.
// A lista local acumula páginas: "ver anteriores" busca a próxima página e a
// adiciona ao topo, deduplicando por id para não repetir registros.
export function useTaskComments({ taskId }) {
  const [comments, setComments] = useState([]);
  const [permissions, setPermissions] = useState({ canComment: false, canModerate: false });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(Boolean(taskId));
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState(null);
  const [error, setError] = useState('');
  const loadedPagesRef = useRef(0);
  const { run } = useAbortableRequest();

  const loadLatest = useCallback(async () => {
    if (!taskId) {
      setComments([]);
      setLoading(false);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    let settled = false;
    try {
      const data = await run((signal) =>
        getTaskComments(taskId, { page: 1, limit: COMMENTS_PAGE_SIZE }, { signal })
      );
      if (!data) return;
      settled = true;
      setComments([...(data.comments || [])].reverse());
      setPermissions(data.permissions || { canComment: false, canModerate: false });
      setTotal(data.pagination?.total ?? 0);
      loadedPagesRef.current = 1;
    } catch (cause) {
      settled = true;
      setError(normalizeApiError(cause, fallbackMessage).message);
    } finally {
      if (settled) setLoading(false);
    }
  }, [run, taskId]);

  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  const loadOlder = useCallback(async () => {
    const nextPage = loadedPagesRef.current + 1;
    setLoadingOlder(true);
    setError('');
    try {
      const data = await getTaskComments(taskId, { page: nextPage, limit: COMMENTS_PAGE_SIZE });
      const older = [...(data.comments || [])].reverse();
      setTotal(data.pagination?.total ?? 0);
      setComments((current) => {
        const seen = new Set(current.map((comment) => comment.id));
        return [...older.filter((comment) => !seen.has(comment.id)), ...current];
      });
      loadedPagesRef.current = nextPage;
    } catch (cause) {
      setError(normalizeApiError(cause, fallbackMessage).message);
    } finally {
      setLoadingOlder(false);
    }
  }, [taskId]);

  const addComment = useCallback(
    async (content) => {
      setSubmitting(true);
      setError('');
      try {
        await createTaskComment(taskId, content);
        await loadLatest();
        return true;
      } catch (cause) {
        setError(normalizeApiError(cause, fallbackMessage).message);
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [loadLatest, taskId]
  );

  const editComment = useCallback(
    async (commentId, content) => {
      setActionId(commentId);
      setError('');
      try {
        const data = await updateTaskComment(taskId, commentId, content);
        setComments((current) =>
          current.map((comment) => (comment.id === commentId ? data.comment : comment))
        );
        return true;
      } catch (cause) {
        setError(normalizeApiError(cause, fallbackMessage).message);
        return false;
      } finally {
        setActionId(null);
      }
    },
    [taskId]
  );

  const removeComment = useCallback(
    async (commentId) => {
      setActionId(commentId);
      setError('');
      try {
        await deleteTaskComment(taskId, commentId);
        await loadLatest();
        return true;
      } catch (cause) {
        setError(normalizeApiError(cause, fallbackMessage).message);
        return false;
      } finally {
        setActionId(null);
      }
    },
    [loadLatest, taskId]
  );

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
    loadOlder,
    addComment,
    editComment,
    removeComment
  };
}
