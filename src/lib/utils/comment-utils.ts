type CommentWithLegacyCommunityAddress = {
  communityAddress?: string;
  replies?: {
    pages?: Record<
      string,
      | {
          comments?: Array<CommentWithLegacyCommunityAddress | undefined>;
        }
      | undefined
    >;
  };
  subplebbitAddress?: string;
};

export const getCommentCommunityAddress = (comment?: unknown) => {
  if (!comment || typeof comment !== 'object') {
    return undefined;
  }

  const record = comment as { communityAddress?: unknown; subplebbitAddress?: unknown };
  if (typeof record.communityAddress === 'string' && record.communityAddress) {
    return record.communityAddress;
  }
  if (typeof record.subplebbitAddress === 'string' && record.subplebbitAddress) {
    return record.subplebbitAddress;
  }

  return undefined;
};

const withResolvedReplyPages = (replies?: CommentWithLegacyCommunityAddress['replies']) => {
  if (!replies?.pages) {
    return replies;
  }

  let nextPages = replies.pages;
  let pagesChanged = false;

  for (const [sortType, page] of Object.entries(replies.pages)) {
    if (!page?.comments?.length) {
      continue;
    }

    let nextComments = page.comments;
    let commentsChanged = false;

    page.comments.forEach((reply, index) => {
      const normalizedReply = withResolvedCommentCommunityAddress(reply);
      if (normalizedReply === reply) {
        return;
      }

      if (!commentsChanged) {
        nextComments = [...(page.comments ?? [])];
        commentsChanged = true;
      }
      nextComments[index] = normalizedReply;
    });

    if (!commentsChanged) {
      continue;
    }

    if (!pagesChanged) {
      nextPages = { ...replies.pages };
      pagesChanged = true;
    }

    nextPages[sortType] = {
      ...page,
      comments: nextComments,
    };
  }

  if (!pagesChanged) {
    return replies;
  }

  return {
    ...replies,
    pages: nextPages,
  };
};

export const withResolvedCommentCommunityAddress = <T extends CommentWithLegacyCommunityAddress | undefined | null>(comment: T): T => {
  if (!comment) {
    return comment;
  }

  const communityAddress = getCommentCommunityAddress(comment);
  const replies = withResolvedReplyPages(comment.replies);
  const needsResolvedCommunityAddress = !!communityAddress && comment.communityAddress !== communityAddress;

  if (!needsResolvedCommunityAddress && replies === comment.replies) {
    return comment;
  }

  return {
    ...comment,
    ...(needsResolvedCommunityAddress ? { communityAddress } : {}),
    ...(replies !== comment.replies ? { replies } : {}),
  } as T;
};
