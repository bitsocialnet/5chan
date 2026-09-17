import type { Comment, Role } from '@bitsocial/bitsocial-react-hooks';
import type { CommentWithRefresh } from './comment-utils';
import type { ReplyVirtualizationMode } from './pretext-height-estimates';

export interface ReplyPaginationOverride {
  hasMore?: boolean;
  loadMore?: () => void;
  replies: Comment[];
  reset?: () => Promise<void>;
}

export interface PostProps {
  feedVirtualizationModeOverride?: ReplyVirtualizationMode;
  index?: number;
  isHidden?: boolean;
  hasThumbnail?: boolean;
  post?: CommentWithRefresh;
  postReplyCount?: number;
  reply?: Comment;
  replyPaginationOverride?: ReplyPaginationOverride;
  replyVirtualizationModeOverride?: ReplyVirtualizationMode;
  roles?: Role[];
  showAllReplies?: boolean;
  showReplies?: boolean;
  targetReplyCid?: string;
  threadNumber?: number;
  isModQueue?: boolean;
  modQueueStatus?: 'approved' | 'rejected' | 'failed' | null;
  modQueueError?: unknown;
  isPublishing?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onTransfer?: () => void;
  onRemoveFromModQueue?: () => void;
  quotedByMap?: Map<string, Comment[]>;
}
