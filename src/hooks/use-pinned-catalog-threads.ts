import { useEffect, useMemo } from 'react';
import { useComments, type Comment } from '@bitsocial/bitsocial-react-hooks';
import { areSameBoardAddress } from '../lib/utils/route-utils';
import { getThreadDeadReason } from '../lib/utils/thread-updater-utils';
import usePinnedCatalogThreadsStore from '../stores/use-pinned-catalog-threads-store';
import { isCidHidden, type HiddenCidLookup } from './use-hide';

interface UsePinnedCatalogThreadsOptions {
  communityAddresses: string[];
  enabled: boolean;
  /** The catalog's search and content filters, so a pinned thread the feed would leave out stays out. */
  filter: (comment: Comment) => boolean;
  hiddenCids: HiddenCidLookup;
}

const NO_PINNED_POSTS: Comment[] = [];

/**
 * The viewer's pinned threads on the catalog's boards. They keep updating while the catalog is open,
 * because the catalog feed itself does not, so their new reply counts move without a reload. Pinned
 * threads the feed has not loaded still show. A pinned thread that gets archived or deleted is unpinned,
 * like 4chan, where a pinned thread leaves the catalog once it dies.
 */
const usePinnedCatalogThreads = ({ communityAddresses, enabled, filter, hiddenCids }: UsePinnedCatalogThreadsOptions): Comment[] => {
  const pinnedThreads = usePinnedCatalogThreadsStore((state) => state.pinnedThreads);
  const unpinThread = usePinnedCatalogThreadsStore((state) => state.unpinThread);
  const pinnedCids = useMemo(
    () =>
      enabled ? Object.keys(pinnedThreads).filter((cid) => communityAddresses.some((address) => areSameBoardAddress(address, pinnedThreads[cid].communityAddress))) : [],
    [communityAddresses, enabled, pinnedThreads],
  );
  const { comments } = useComments({ commentCids: pinnedCids, autoUpdate: true });

  const deadCids = useMemo(() => comments.flatMap((comment) => (comment?.cid && getThreadDeadReason(comment) ? [comment.cid as string] : [])), [comments]);
  useEffect(() => {
    for (const cid of deadCids) unpinThread(cid);
  }, [deadCids, unpinThread]);

  return useMemo(() => {
    const pinnedPosts = comments.filter(
      (comment): comment is Comment =>
        typeof comment?.cid === 'string' &&
        typeof comment.timestamp === 'number' &&
        !getThreadDeadReason(comment) &&
        !isCidHidden(hiddenCids, comment.cid) &&
        filter(comment),
    );
    return pinnedPosts.length > 0 ? pinnedPosts : NO_PINNED_POSTS;
  }, [comments, filter, hiddenCids]);
};

export default usePinnedCatalogThreads;
