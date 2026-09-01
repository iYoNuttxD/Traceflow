import { useEffect, useRef, useState } from 'react';
import { useTaskComments } from '../hooks/useTaskComments.js';
import { formatDateTime } from './kanban-display.js';
import { useAuth } from '../../auth/index.js';
import { useConfirm } from '../../../shared/index.js';
import './TaskComments.css';

const COMMENT_MAX_LENGTH = 2000;

function PencilIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z" />
      <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3h11V2h-11v1z" />
    </svg>
  );
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
    loadOlder,
    addComment,
    editComment,
    removeComment
  } = useTaskComments({ taskId });
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingDraft, setEditingDraft] = useState('');
  const scrollRef = useRef(null);
  const stickToBottomRef = useRef(true);

  const busy = submitting || actionId !== null;

  useEffect(() => {
    if (!loading && stickToBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [loading, comments]);

  async function handleLoadOlder() {
    const node = scrollRef.current;
    const previousHeight = node?.scrollHeight ?? 0;
    stickToBottomRef.current = false;
    await loadOlder();
    window.requestAnimationFrame(() => {
      if (node) node.scrollTop = node.scrollHeight - previousHeight;
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!draft.trim()) return;
    stickToBottomRef.current = true;
    if (await addComment(draft.trim())) setDraft('');
  }

  function startEditing(comment) {
    setEditingId(comment.id);
    setEditingDraft(comment.content);
  }

  async function handleEditSubmit(event) {
    event.preventDefault();
    if (!editingDraft.trim()) return;
    if (await editComment(editingId, editingDraft.trim())) {
      setEditingId(null);
      setEditingDraft('');
    }
  }

  async function handleDelete(comment) {
    const confirmed = await confirm({
      title: 'Excluir comentário',
      description:
        'O comentário deixará de ser exibido no histórico da tarefa. Esta ação não poderá ser desfeita.',
      confirmLabel: 'Excluir'
    });
    if (!confirmed) return;
    await removeComment(comment.id);
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

      <div className="task-comments-scroll" ref={scrollRef}>
        {loading ? (
          <p className="empty-state">Carregando comentários...</p>
        ) : comments.length === 0 ? (
          <p className="empty-state">Nenhum comentário registrado.</p>
        ) : (
          <>
            {hasOlder && (
              <button
                className="text-button task-chat-older"
                type="button"
                disabled={loadingOlder}
                onClick={() => void handleLoadOlder()}
              >
                {loadingOlder ? 'Carregando...' : 'Ver comentários anteriores'}
              </button>
            )}
            {comments.map((comment) => {
              const own = Boolean(user && comment.author?.id === user.id);
              const processing = actionId === comment.id;
              return (
                <div
                  className={`task-chat-message${own ? ' task-chat-message-own' : ''}`}
                  key={comment.id}
                >
                  <article className={`task-chat-bubble${own ? ' task-chat-bubble-own' : ''}`}>
                    {!own && (
                      <span className="task-chat-author">
                        {comment.author?.name || `Usuário #${comment.author?.id}`}
                      </span>
                    )}
                    {editingId === comment.id ? (
                      <form className="task-chat-edit-form" onSubmit={handleEditSubmit}>
                        <textarea
                          aria-label="Editar comentário"
                          value={editingDraft}
                          onChange={(event) => setEditingDraft(event.target.value)}
                          rows="3"
                          maxLength={COMMENT_MAX_LENGTH}
                          disabled={processing}
                        />
                        <div className="task-chat-edit-actions">
                          <button
                            className="text-button"
                            type="button"
                            disabled={processing}
                            onClick={() => setEditingId(null)}
                          >
                            Cancelar
                          </button>
                          <button
                            className="text-button"
                            type="submit"
                            disabled={processing || !editingDraft.trim()}
                          >
                            {processing ? 'Salvando...' : 'Salvar'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <p className="task-chat-content">{comment.content}</p>
                        <div className="task-chat-meta">
                          {comment.editedAt && <span>(editado)</span>}
                          <time dateTime={comment.createdAt}>
                            {formatDateTime(comment.createdAt)}
                          </time>
                          {comment.canEdit && (
                            <button
                              className="task-chat-icon-button"
                              type="button"
                              disabled={busy}
                              onClick={() => startEditing(comment)}
                              aria-label="Editar comentário"
                              title="Editar comentário"
                            >
                              <PencilIcon />
                            </button>
                          )}
                          {comment.canDelete && (
                            <button
                              className="task-chat-icon-button task-chat-icon-button-danger"
                              type="button"
                              disabled={busy}
                              onClick={() => void handleDelete(comment)}
                              aria-label="Excluir comentário"
                              title="Excluir comentário"
                            >
                              <TrashIcon />
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </article>
                </div>
              );
            })}
          </>
        )}
      </div>

      {permissions.canComment && (
        <form className="task-chat-form" onSubmit={handleSubmit}>
          <textarea
            aria-label="Novo comentário"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows="2"
            maxLength={COMMENT_MAX_LENGTH}
            placeholder="Escreva um comentário..."
            disabled={busy}
          />
          <button className="button button-primary" type="submit" disabled={busy || !draft.trim()}>
            {submitting ? 'Enviando...' : 'Comentar'}
          </button>
        </form>
      )}
    </aside>
  );
}
