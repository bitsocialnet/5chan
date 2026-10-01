import { useEffect } from 'react';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import usePinnedCatalogThreadsStore from '../stores/use-pinned-catalog-threads-store';

/** Opening a pinned thread reads its replies, so its new reply count in the catalog starts over from here. */
const useMarkPinnedThreadRead = (post: Comment | undefined) => {
  const cid = post?.cid;
  const replyCount = post?.replyCount;
  const isPinned = usePinnedCatalogThreadsStore((state) => Boolean(cid && state.pinnedThreads[cid]));
  const markThreadRead = usePinnedCatalogThreadsStore((state) => state.markThreadRead);

  useEffect(() => {
    if (isPinned && cid && typeof replyCount === 'number') markThreadRead(cid, replyCount);
  }, [cid, isPinned, markThreadRead, replyCount]);
};

export default useMarkPinnedThreadRead;
