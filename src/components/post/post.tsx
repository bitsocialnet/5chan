import { memo, type ReactNode } from 'react';
import { useEditedComment } from '@bitsocial/bitsocial-react-hooks';
import { useCommunityField } from '../../hooks/use-stable-community';
import { useResolvedCommunityAddress } from '../../hooks/use-resolved-community-address';
import useIsMobile from '../../hooks/use-is-mobile';
import { QuotePreviewPostContext } from '../../hooks/use-quote-preview-post';
import { isCommentArchived } from '../../lib/utils/comment-moderation-utils';
import { areSameBoardAddress } from '../../lib/utils/route-utils';
import { type CommentWithRefresh, getCommentCommunityAddress, mergeCommentFallback } from '../../lib/utils/comment-utils';
import { hasTransferredCommentMarker } from '../../lib/comment-transfer';
import { preservePublishedUserID } from '../../lib/utils/comment-user-id-utils';
import type { PostProps } from '../../lib/utils/post-props';
import PostDesktop from '../post-desktop';
import PostMobile from '../post-mobile';
import styles from '../post-styles';

const EMPTY_ROLE_MAP = {};

export const Post = memo(
  ({
    post,
    showAllReplies = false,
    showReplies = true,
    targetReplyCid,
    isModQueue,
    modQueueStatus,
    modQueueError,
    isPublishing,
    onApprove,
    onReject,
    onTransfer,
    onRemoveFromModQueue,
    feedVirtualizationModeOverride,
    replyPaginationOverride,
    replyVirtualizationModeOverride,
  }: PostProps) => {
    // Only subscribe to roles field to avoid rerenders from updatingState changes
    const communityAddress = getCommentCommunityAddress(post);
    const routeCommunityAddress = useResolvedCommunityAddress();
    const rawRoles = useCommunityField(communityAddress, (community) => community?.roles ?? EMPTY_ROLE_MAP);
    const shouldWaitForRoles = Boolean(routeCommunityAddress && communityAddress && areSameBoardAddress(routeCommunityAddress, communityAddress));
    const roles = rawRoles ?? (shouldWaitForRoles ? undefined : EMPTY_ROLE_MAP);
    const isMobile = useIsMobile();

    let comment = post;

    // handle pending mod or author edit
    const { editedComment } = useEditedComment({ comment });
    comment = preservePublishedUserID(mergeCommentFallback(editedComment as CommentWithRefresh | undefined, comment as CommentWithRefresh | undefined), post);
    const transferHandler = comment?.parentCid ? undefined : onTransfer;

    return (
      <QuotePreviewPostContext.Provider value={renderQuotePreviewPost}>
        <div className={styles.thread}>
          <div className={styles.postContainer}>
            {isMobile ? (
              <PostMobile
                feedVirtualizationModeOverride={feedVirtualizationModeOverride}
                post={comment}
                replyPaginationOverride={replyPaginationOverride}
                replyVirtualizationModeOverride={replyVirtualizationModeOverride}
                roles={roles}
                showAllReplies={showAllReplies}
                showReplies={showReplies}
                targetReplyCid={targetReplyCid}
                isModQueue={isModQueue}
                modQueueStatus={modQueueStatus}
                modQueueError={modQueueError}
                isPublishing={isPublishing}
                onApprove={onApprove}
                onReject={onReject}
                onTransfer={transferHandler}
                onRemoveFromModQueue={onRemoveFromModQueue}
              />
            ) : (
              <PostDesktop
                feedVirtualizationModeOverride={feedVirtualizationModeOverride}
                post={comment}
                replyPaginationOverride={replyPaginationOverride}
                replyVirtualizationModeOverride={replyVirtualizationModeOverride}
                roles={roles}
                showAllReplies={showAllReplies}
                showReplies={showReplies}
                targetReplyCid={targetReplyCid}
                isModQueue={isModQueue}
                modQueueStatus={modQueueStatus}
                modQueueError={modQueueError}
                isPublishing={isPublishing}
                onApprove={onApprove}
                onReject={onReject}
                onTransfer={transferHandler}
                onRemoveFromModQueue={onRemoveFromModQueue}
              />
            )}
          </div>
        </div>
      </QuotePreviewPostContext.Provider>
    );
  },
  (prevProps, nextProps) => {
    const prev = prevProps.post;
    const next = nextProps.post;
    return (
      prev?.cid === next?.cid &&
      prev?.number === next?.number &&
      prev?.parentCid === next?.parentCid &&
      prev?.postNumber === next?.postNumber &&
      prev?.replyCount === next?.replyCount &&
      prev?.updatedAt === next?.updatedAt &&
      prev?.state === next?.state &&
      prev?.publishingState === next?.publishingState &&
      prev?.author?.address === next?.author?.address &&
      prev?.author?.displayName === next?.author?.displayName &&
      prev?.author?.shortAddress === next?.author?.shortAddress &&
      prev?.error === next?.error &&
      prev?.errors === next?.errors &&
      prev?.approved === next?.approved &&
      prev?.locked === next?.locked &&
      prev?.pinned === next?.pinned &&
      prev?.pendingApproval === next?.pendingApproval &&
      isCommentArchived(prev) === isCommentArchived(next) &&
      prev?.removed === next?.removed &&
      prev?.deleted === next?.deleted &&
      prev?.reason === next?.reason &&
      prev?.commentModeration?.purged === next?.commentModeration?.purged &&
      hasTransferredCommentMarker(prev) === hasTransferredCommentMarker(next) &&
      prevProps.showAllReplies === nextProps.showAllReplies &&
      prevProps.showReplies === nextProps.showReplies &&
      prevProps.targetReplyCid === nextProps.targetReplyCid &&
      prevProps.feedVirtualizationModeOverride === nextProps.feedVirtualizationModeOverride &&
      prevProps.replyPaginationOverride === nextProps.replyPaginationOverride &&
      prevProps.replyVirtualizationModeOverride === nextProps.replyVirtualizationModeOverride &&
      prevProps.isModQueue === nextProps.isModQueue &&
      prevProps.modQueueStatus === nextProps.modQueueStatus &&
      prevProps.modQueueError === nextProps.modQueueError &&
      prevProps.isPublishing === nextProps.isPublishing &&
      prevProps.onApprove === nextProps.onApprove &&
      prevProps.onReject === nextProps.onReject &&
      prevProps.onTransfer === nextProps.onTransfer &&
      prevProps.onRemoveFromModQueue === nextProps.onRemoveFromModQueue
    );
  },
);

// Module-level so the context value is stable and the rendered element type is always Post.
function renderQuotePreviewPost(props: PostProps) {
  return <Post {...props} />;
}

export const QuotePreviewPostProvider = ({ children }: { children: ReactNode }) => (
  <QuotePreviewPostContext.Provider value={renderQuotePreviewPost}>{children}</QuotePreviewPostContext.Provider>
);

export default Post;
