import { BOARD_REPLIES_PREVIEW_VISIBLE_COUNT } from '../constants';

export interface CommentLike {
  cid?: string | null;
}

/**
 * From replies sorted by 'new' (newest first), returns the latest N in chronological
 * display order (oldest of those first). Handles fewer-than-N replies.
 */
export function getPreviewDisplayReplies<T extends CommentLike>(replies: T[], visibleCount: number = BOARD_REPLIES_PREVIEW_VISIBLE_COUNT): T[] {
  const slice = replies.slice(0, visibleCount);
  return [...slice].reverse();
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
