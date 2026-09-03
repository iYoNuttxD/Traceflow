const MODERATOR_ROLES = new Set(['MANAGER', 'OWNER']);

export function canModerateTaskComments(role) {
  return MODERATOR_ROLES.has(role);
}

function formatDeletedComment(comment) {
  const deletionActorType =
    comment.deletedById == null
      ? 'UNKNOWN'
      : comment.deletedById === comment.authorUserId
        ? 'AUTHOR'
        : 'MODERATION';

  return {
    id: comment.id,
    taskId: comment.taskId,
    content: null,
    editedAt: null,
    createdAt: comment.createdAt,
    author: comment.authorUser,
    deletedAt: comment.deletedAt,
    deletionActorType,
    canEdit: false,
    canDelete: false
  };
}

export function formatTaskComment(comment, context = {}) {
  if (comment.deletedAt) return formatDeletedComment(comment);
  const isAuthor = comment.authorUserId === context.actorUserId;
  const role = context.membershipRole;
  return {
    id: comment.id,
    taskId: comment.taskId,
    content: comment.content,
    editedAt: comment.editedAt,
    createdAt: comment.createdAt,
    author: comment.authorUser,
    deletedAt: null,
    deletionActorType: null,
    canEdit: isAuthor && role !== 'VIEWER',
    canDelete: (isAuthor && role !== 'VIEWER') || canModerateTaskComments(role)
  };
}
