import { useEffect, useMemo } from 'react';
import { useComments, type Comment } from '@bitsocial/bitsocial-react-hooks';
import { isCommentPurged } from '../lib/utils/comment-moderation-utils';
import { areSameBoardAddress } from '../lib/utils/route-utils';
import usePinnedCatalogThreadsStore from '../stores/use-pinned-catalog-threads-store';
import { isCidHidden, type HiddenCidLookup } from './use-hide';

interface UsePinnedCatalogThreadsOptions {
  communityAddresses: string[];
  enabled: boolean;
  /** The catalog's search and content filters, so a pinned thread a search leaves out stays out. */
  filter?: (comment: Comment) => boolean;
  hiddenCids: HiddenCidLookup;
}

const NO_PINNED_POSTS: Comment[] = [];

/**
 * The viewer's pinned threads on the catalog's boards, in the order they were pinned. They keep
 * updating while the catalog is open, because the catalog feed itself does not, so their new reply
 * counts move without a reload. A pinned thread stays pinned when it leaves the board's pages or gets
 * archived, and shows as archived; only a purged thread, which is gone for good, is unpinned.
 */
const usePinnedCatalogThreads = ({ communityAddresses, enabled, filter, hiddenCids }: UsePinnedCatalogThreadsOptions): Comment[] => {
  const pinnedThreads = usePinnedCatalogThreadsStore((state) => state.pinnedThreads);
  const unpinThread = usePinnedCatalogThreadsStore((state) => state.unpinThread);
  const pinnedCids = useMemo(
    () =>
      enabled
        ? Object.keys(pinnedThreads)
            .filter((cid) => communityAddresses.some((address) => areSameBoardAddress(address, pinnedThreads[cid].communityAddress)))
            .sort((a, b) => (pinnedThreads[a].pinnedAt ?? 0) - (pinnedThreads[b].pinnedAt ?? 0))
        : [],
    [communityAddresses, enabled, pinnedThreads],
  );
  const { comments } = useComments({ commentCids: pinnedCids, autoUpdate: true });

  const purgedCids = useMemo(() => comments.flatMap((comment) => (comment?.cid && isCommentPurged(comment) ? [comment.cid as string] : [])), [comments]);
  useEffect(() => {
    for (const cid of purgedCids) unpinThread(cid);
  }, [purgedCids, unpinThread]);

  return useMemo(() => {
    const pinnedPosts = comments.filter(
      (comment): comment is Comment =>
        typeof comment?.cid === 'string' &&
        typeof comment.timestamp === 'number' &&
        !isCommentPurged(comment) &&
        !isCidHidden(hiddenCids, comment.cid) &&
        (!filter || filter(comment)),
    );
    return pinnedPosts.length > 0 ? pinnedPosts : NO_PINNED_POSTS;
  }, [comments, filter, hiddenCids]);
};

export default usePinnedCatalogThreads;
