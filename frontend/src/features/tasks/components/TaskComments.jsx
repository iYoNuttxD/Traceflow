import { useEffect, useRef, useState } from 'react';
import { useTaskComments } from '../hooks/useTaskComments.js';
import { formatDateTime } from './kanban-display.js';
import { useAuth } from '../../auth/index.js';
import { useConfirm } from '../../../shared/index.js';
import './TaskComments.css';

const COMMENT_MAX_LENGTH = 2000;
const SCROLL_TOP_THRESHOLD_PX = 48;
const SCROLL_BOTTOM_THRESHOLD_PX = 64;

const tombstoneMessages = Object.freeze({
  AUTHOR: 'Comentário excluído pelo autor.',
  MODERATION: 'Comentário excluído por moderação.',
  UNKNOWN: 'Comentário excluído.'
});

function isNearBottom(node) {
  return node.scrollHeight - node.scrollTop - node.clientHeight <= SCROLL_BOTTOM_THRESHOLD_PX;
}

export function TaskComments({ taskId }) {
  const confirm = useConfirm();
  const { user } = useAuth() ?? {};
  const {
    comments,
    permissions,
    hasOlder,
    loading,
    loadingOlder,
    submitting,
    actionId,
    error,
    syncError,
    lastUpdate,
    loadOlder,
    retryRefresh,
    addComment,
    editComment,
    removeComment
  } = useTaskComments({ taskId });
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [menuId, setMenuId] = useState(null);
  const [newCommentsAvailable, setNewCommentsAvailable] = useState(false);
  const [localFeedback, setLocalFeedback] = useState('');
  const scrollRef = useRef(null);
  const composerRef = useRef(null);
  const menuContainerRef = useRef(null);
  const triggerRefs = useRef(new Map());
  const stickToBottomRef = useRef(true);
  const loadingOlderRef = useRef(false);
  const taskIdRef = useRef(taskId);

  const busy = submitting || actionId !== null;
  const editing = editingId !== null;

  useEffect(() => {
    taskIdRef.current = taskId;
    setDraft('');
    setEditingId(null);
    setMenuId(null);
    setNewCommentsAvailable(false);
    setLocalFeedback('');
    stickToBottomRef.current = true;
    loadingOlderRef.current = false;
  }, [taskId]);

  useEffect(() => {
    if (menuId === null) return undefined;

    menuContainerRef.current?.querySelector('[role="menuitem"]')?.focus();

    const closeMenu = (restoreFocus) => {
      const trigger = triggerRefs.current.get(menuId);
      setMenuId(null);
      if (restoreFocus) window.requestAnimationFrame(() => trigger?.focus());
    };
    const handlePointerDown = (event) => {
      if (!menuContainerRef.current?.contains(event.target)) closeMenu(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu(true);
        return;
      }

      const items = [...(menuContainerRef.current?.querySelectorAll('[role="menuitem"]') || [])];
      if (!items.length) return;
      const currentIndex = items.indexOf(document.activeElement);
      let nextIndex = null;

      if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length;
      if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = items.length - 1;

      if (nextIndex !== null) {
        event.preventDefault();
        items[nextIndex].focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuId]);

  useEffect(() => {
    if (editingId === null) return;
    const editedComment = comments.find((comment) => comment.id === editingId);
    if (editedComment && !editedComment.deletedAt) return;

    setEditingId(null);
    setDraft('');
    setLocalFeedback('O comentário não está mais disponível para edição.');
    window.requestAnimationFrame(() => composerRef.current?.focus());
  }, [comments, editingId]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || lastUpdate.source === 'reset' || lastUpdate.source === 'older') return;

    if (lastUpdate.source === 'initial' || lastUpdate.source === 'create') {
      window.requestAnimationFrame(() => {
        node.scrollTop = node.scrollHeight;
        stickToBottomRef.current = true;
        setNewCommentsAvailable(false);
      });
      return;
    }

    if (lastUpdate.addedIds.length > 0) {
      if (stickToBottomRef.current || isNearBottom(node)) {
        window.requestAnimationFrame(() => {
          node.scrollTop = node.scrollHeight;
          stickToBottomRef.current = true;
        });
      } else {
        setNewCommentsAvailable(true);
      }
    }
  }, [lastUpdate]);

  async function handleLoadOlder() {
    if (loadingOlderRef.current || loadingOlder || !hasOlder) return;

    const node = scrollRef.current;
    const requestedTaskId = taskId;
    const previousHeight = node?.scrollHeight ?? 0;
    const previousTop = node?.scrollTop ?? 0;
    loadingOlderRef.current = true;
    stickToBottomRef.current = false;
    const applied = await loadOlder();
    loadingOlderRef.current = false;

    if (!applied || String(taskIdRef.current) !== String(requestedTaskId)) return;
    window.requestAnimationFrame(() => {
      if (node) node.scrollTop = previousTop + node.scrollHeight - previousHeight;
    });
  }

  function handleScroll() {
    const node = scrollRef.current;
    if (!node) return;

    const nearBottom = isNearBottom(node);
    stickToBottomRef.current = nearBottom;
    if (nearBottom) setNewCommentsAvailable(false);
    if (node.scrollTop <= SCROLL_TOP_THRESHOLD_PX && hasOlder && !loadingOlder) {
      void handleLoadOlder();
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;

    setLocalFeedback('');
    if (editing) {
      const target = comments.find((comment) => comment.id === editingId);
      if (!target || target.deletedAt) {
        setEditingId(null);
        setDraft('');
        setLocalFeedback('O comentário não está mais disponível para edição.');
        return;
      }
      if (await editComment(editingId, content)) {
        setEditingId(null);
        setDraft('');
      }
      return;
    }

    stickToBottomRef.current = true;
    if (await addComment(content)) setDraft('');
  }

  function startEditing(comment) {
    setMenuId(null);
    setEditingId(comment.id);
    setDraft(comment.content);
    setLocalFeedback('');
    window.requestAnimationFrame(() => {
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(comment.content.length, comment.content.length);
    });
  }

  function cancelEditing() {
    const trigger = triggerRefs.current.get(editingId);
    setEditingId(null);
    setDraft('');
    setLocalFeedback('');
    window.requestAnimationFrame(() => trigger?.focus());
  }

  async function handleDelete(comment) {
    setMenuId(null);
    const confirmed = await confirm({
      title: 'Excluir comentário',
      description:
        'O conteúdo deixará de ser exibido e o histórico manterá apenas a marcação de exclusão. Esta ação não poderá ser desfeita.',
      confirmLabel: 'Excluir'
    });
    if (!confirmed) {
      window.requestAnimationFrame(() => triggerRefs.current.get(comment.id)?.focus());
      return;
    }

    const removed = await removeComment(comment.id);
    window.requestAnimationFrame(() => {
      if (removed) {
        (composerRef.current || scrollRef.current)?.focus();
      } else {
        triggerRefs.current.get(comment.id)?.focus();
      }
    });
  }

  function scrollToLatest() {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
    stickToBottomRef.current = true;
    setNewCommentsAvailable(false);
    composerRef.current?.focus();
  }

  return (
    <aside className="task-comments" aria-label="Comentários da tarefa">
      <div className="task-comments-header">
        <span>Comentários</span>
        <p>Conversa da equipe sobre esta tarefa.</p>
      </div>

      {error && (
        <div className="message message-error" role="alert">
          {error}
        </div>
      )}

      {syncError && (
        <div className="task-comments-sync" role="status" aria-live="polite">
          <span>{syncError}</span>
          <button className="text-button" type="button" onClick={() => void retryRefresh()}>
            Tentar atualizar
          </button>
        </div>
      )}

      {localFeedback && (
        <div className="task-comments-sync" role="status" aria-live="polite">
          {localFeedback}
        </div>
      )}

      <div className="task-comments-scroll" ref={scrollRef} onScroll={handleScroll} tabIndex={-1}>
        {loading ? (
          <p className="empty-state" role="status">
            Carregando comentários...
          </p>
        ) : comments.length === 0 ? (
          <p className="empty-state">Nenhum comentário registrado.</p>
        ) : (
          <>
            {loadingOlder && (
              <p className="task-chat-history-status" role="status">
                Carregando comentários anteriores...
              </p>
            )}
            {comments.map((comment) => {
              const own = Boolean(user && comment.author?.id === user.id);
              const processing = actionId === comment.id;
              const deleted = Boolean(comment.deletedAt);
              const hasActions = !deleted && (comment.canEdit || comment.canDelete);
              const menuOpen = menuId === comment.id;
              return (
                <div
                  className={`task-chat-message${own ? ' task-chat-message-own' : ''}`}
                  key={comment.id}
                >
                  <article
                    className={`task-chat-bubble${own ? ' task-chat-bubble-own' : ''}${
                      deleted ? ' task-chat-bubble-deleted' : ''
                    }${hasActions ? ' task-chat-bubble-has-actions' : ''}`}
                  >
                    {!own && (
                      <span className="task-chat-author">
                        {comment.author?.name || `Usuário #${comment.author?.id}`}
                      </span>
                    )}
                    {deleted ? (
                      <p className="task-chat-content task-chat-content-deleted">
                        {tombstoneMessages[comment.deletionActorType] || tombstoneMessages.UNKNOWN}
                      </p>
                    ) : (
                      <p className="task-chat-content">{comment.content}</p>
                    )}
                    <div className="task-chat-meta">
                      <time dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}</time>
                      {!deleted && comment.editedAt && (
                        <>
                          <span aria-hidden="true">•</span>
                          <span>Editado</span>
                        </>
                      )}
                    </div>

                    {hasActions && (
                      <div
                        className="task-chat-action"
                        ref={menuOpen ? menuContainerRef : undefined}
                      >
                        <button
                          className="task-chat-menu-trigger"
                          ref={(node) => {
                            if (node) triggerRefs.current.set(comment.id, node);
                            else triggerRefs.current.delete(comment.id);
                          }}
                          type="button"
                          disabled={busy}
                          aria-label="Ações do comentário"
                          aria-haspopup="menu"
                          aria-expanded={menuOpen}
                          onClick={() =>
                            setMenuId((current) => (current === comment.id ? null : comment.id))
                          }
                        >
                          <span aria-hidden="true">⋯</span>
                        </button>
                        {menuOpen && (
                          <div className="task-chat-menu" role="menu">
                            {comment.canEdit && (
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => startEditing(comment)}
                              >
                                Editar
                              </button>
                            )}
                            {comment.canDelete && (
                              <button
                                className="task-chat-menu-danger"
                                type="button"
                                role="menuitem"
                                disabled={processing}
                                onClick={() => void handleDelete(comment)}
                              >
                                Excluir
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                </div>
              );
            })}
          </>
        )}

        {newCommentsAvailable && (
          <button className="task-chat-new-indicator" type="button" onClick={scrollToLatest}>
            Novos comentários
          </button>
        )}
      </div>

      {permissions.canComment && (
        <form className="task-chat-form" onSubmit={handleSubmit}>
          {editing && (
            <div className="task-chat-edit-context">
              <span>Editando comentário</span>
              <button className="text-button" type="button" disabled={busy} onClick={cancelEditing}>
                Cancelar edição
              </button>
            </div>
          )}
          <div className="task-chat-composer-row">
            <textarea
              ref={composerRef}
              aria-label={editing ? 'Editar comentário' : 'Novo comentário'}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows="2"
              maxLength={COMMENT_MAX_LENGTH}
              placeholder="Escreva um comentário..."
              disabled={busy}
            />
            <button
              className="button button-primary"
              type="submit"
              disabled={busy || !draft.trim()}
            >
              {editing
                ? actionId === editingId
                  ? 'Salvando...'
                  : 'Salvar'
                : submitting
                  ? 'Enviando...'
                  : 'Comentar'}
            </button>
          </div>
        </form>
      )}
    </aside>
  );
}
