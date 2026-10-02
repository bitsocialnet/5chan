type MaybeArchivedComment = {
  archived?: boolean;
  purged?: boolean;
  commentModeration?: {
    archived?: boolean;
    purged?: boolean;
  };
};

export const isCommentArchived = (comment: unknown): boolean => {
  if (!comment || typeof comment !== 'object') {
    return false;
  }

  const archivedComment = comment as MaybeArchivedComment;
  return Boolean(archivedComment.archived || archivedComment.commentModeration?.archived);
};

export const isCommentPurged = (comment: unknown): boolean => {
  if (!comment || typeof comment !== 'object') {
    return false;
  }

  const purgedComment = comment as MaybeArchivedComment;
  return Boolean(purgedComment.purged || purgedComment.commentModeration?.purged);
};
