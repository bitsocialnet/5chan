import { useEffect } from 'react';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import usePinnedCatalogThreadsStore from '../stores/use-pinned-catalog-threads-store';
import useThreadLiveUpdatesStore from '../stores/use-thread-live-updates-store';

/**
 * Reading a pinned thread marks its replies read, so its new reply count in the catalog starts over
 * from here. Replies Auto added under the thread's red unread line stay unread until scrolled to.
 */
const useMarkPinnedThreadRead = (post: Comment | undefined) => {
  const cid = post?.cid;
  const replyCount = post?.replyCount;
  const isPinned = usePinnedCatalogThreadsStore((state) => Boolean(cid && state.pinnedThreads[cid]));
  const markThreadRead = usePinnedCatalogThreadsStore((state) => state.markThreadRead);
  const unreadCount = useThreadLiveUpdatesStore((state) => (cid && state.threadCid === cid ? state.unreadCount : 0));

  useEffect(() => {
    if (isPinned && cid && typeof replyCount === 'number') markThreadRead(cid, Math.max(0, replyCount - unreadCount));
  }, [cid, isPinned, markThreadRead, replyCount, unreadCount]);
};

export default useMarkPinnedThreadRead;
