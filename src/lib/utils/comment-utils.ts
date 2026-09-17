import type { Comment } from '@bitsocial/bitsocial-react-hooks';

export const getCommentCommunityAddress = (comment?: unknown) => {
  if (!comment || typeof comment !== 'object') {
    return undefined;
  }

  const record = comment as { communityAddress?: unknown };
  if (typeof record.communityAddress === 'string' && record.communityAddress) {
    return record.communityAddress;
  }

  return undefined;
};

export const hasAuthoritativeCommentPayload = (comment?: unknown): boolean => {
  if (!comment || typeof comment !== 'object') {
    return false;
  }

  const record = comment as {
    timestamp?: unknown;
    content?: unknown;
    title?: unknown;
    link?: unknown;
    thumbnailUrl?: unknown;
    deleted?: unknown;
    removed?: unknown;
  };

  return Boolean(record.timestamp !== undefined || record.content || record.title || record.link || record.thumbnailUrl || record.deleted || record.removed);
};

// Protocol comments already carry canonical communityAddress fields, including replies.
// Keep this compatibility entry point without walking every nested reply on each render.
export const withResolvedCommentCommunityAddress = <T>(comment: T): T => comment;

export type CommentWithRefresh = Comment & {
  approved?: boolean;
  communityAddress?: string;
  refresh?: () => Promise<void>;
  state?: string;
  pendingApproval?: boolean;
  error?: Error;
  errors?: Error[];
  index?: number;
  removed?: boolean;
};

export const mergeCommentFallback = (comment: CommentWithRefresh | undefined, fallback: CommentWithRefresh | undefined): CommentWithRefresh | undefined => {
  if (!fallback) return comment;
  if (!comment) return fallback;
  if (comment.cid && fallback.cid && comment.cid !== fallback.cid) return comment;

  const hasRenderableData =
    comment.timestamp !== undefined ||
    comment.number !== undefined ||
    !!comment.content ||
    !!comment.title ||
    !!comment.link ||
    !!comment.thumbnailUrl ||
    !!comment.error ||
    !!comment.deleted ||
    !!comment.removed;

  if (hasRenderableData) return comment;

  return {
    ...fallback,
    error: comment.error,
    errors: comment.errors,
    refresh: comment.refresh,
    state: comment.state,
  };
};
