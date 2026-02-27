import { BOARD_REPLIES_PREVIEW_VISIBLE_COUNT } from '../constants';

export interface CommentLike {
  cid?: string | null;
  index?: number;
  pendingApproval?: boolean;
  state?: string;
  timestamp?: number;
}

/**
 * Returns the latest N replies in chronological display order (oldest first).
 *
 * `useReplies` can append local account comments to the end of the preview array,
 * so we normalize by reply recency first to keep pending/mod-queue items visible in
 * board previews.
 */
export function getPreviewDisplayReplies<T extends CommentLike>(replies: T[], visibleCount: number = BOARD_REPLIES_PREVIEW_VISIBLE_COUNT): T[] {
  const getRecency = (reply: T): number => {
    if (typeof reply?.timestamp === 'number') {
      return reply.timestamp;
    }
    // Pending/local account replies can be missing timestamp early on.
    if (typeof reply?.index === 'number' || reply?.pendingApproval || (reply?.state && reply.state !== 'succeeded')) {
      return Number.POSITIVE_INFINITY;
    }
    return Number.NEGATIVE_INFINITY;
  };

  const newestFirst = [...replies].sort((a, b) => getRecency(b) - getRecency(a));
  return newestFirst.slice(0, visibleCount).reverse();
}

export interface ComputeOmittedParams {
  totalReplyCount: number;
  visibleCount: number;
  pinned?: boolean;
}

/**
 * Computes omitted reply count for board view. For pinned threads, collapsed view
 * shows 0 replies, so omitted = total. For non-pinned, omitted = total - visible.
 * Result is always clamped at zero.
 */
export function computeOmittedCount({ totalReplyCount, visibleCount, pinned = false }: ComputeOmittedParams): number {
  if (pinned) {
    return Math.max(0, totalReplyCount);
  }
  return Math.max(0, totalReplyCount - visibleCount);
}

export interface GetTotalReplyCountParams {
  replyCount: number | undefined;
  fullLoadedCount: number;
  previewLoadedCount: number;
}

/**
 * Returns total reply count: post.replyCount when defined, else max of loaded counts.
 */
export function getTotalReplyCount({ replyCount, fullLoadedCount, previewLoadedCount }: GetTotalReplyCountParams): number {
  if (typeof replyCount === 'number' && replyCount >= 0) {
    return replyCount;
  }
  return Math.max(fullLoadedCount, previewLoadedCount);
}
