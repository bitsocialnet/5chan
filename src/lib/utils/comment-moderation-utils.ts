type MaybeArchivedComment = {
  archived?: boolean;
  commentModeration?: {
    archived?: boolean;
  };
};

export const isCommentArchived = (comment: unknown): boolean => {
  if (!comment || typeof comment !== 'object') {
    return false;
  }

  const archivedComment = comment as MaybeArchivedComment;
  return Boolean(archivedComment.archived || archivedComment.commentModeration?.archived);
};
