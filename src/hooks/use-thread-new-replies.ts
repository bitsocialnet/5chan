import { useEffect, useRef } from 'react';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import useThreadLiveUpdatesStore from '../stores/use-thread-live-updates-store';
import { syncThreadRepliesFeeds } from '../lib/utils/thread-refresh-cache-utils';
import { findNewThreadReplies } from '../lib/utils/thread-updater-utils';

interface SeenReplies {
  postCid: string;
  cids: Set<string>;
  lastCid: string | undefined;
  hadMore: boolean;
}

interface UseThreadNewRepliesOptions {
  enabled: boolean;
  hasMore: boolean;
  post: Comment | undefined;
  replies: Comment[];
}

/**
 * Reports replies that appear in the open thread after an update and returns the reply the
 * unread marker goes under. Replies shown before the first update, loaded by pagination, or
 * written by the viewer count as read.
 */
const useThreadNewReplies = ({ enabled, hasMore, post, replies }: UseThreadNewRepliesOptions) => {
  const unreadMarkerCid = useThreadLiveUpdatesStore((state) => (enabled ? state.unreadMarkerCid : undefined));
  const seenRepliesRef = useRef<SeenReplies>(undefined);
  const postUpdatedAt = post?.updatedAt;

  // Runs after useReplies has received the refreshed post, so appended replies get loaded.
  useEffect(() => {
    if (enabled && postUpdatedAt !== undefined) syncThreadRepliesFeeds();
  }, [enabled, postUpdatedAt]);

  useEffect(() => {
    const postCid = post?.cid;
    if (!enabled || !post || !postCid) return;
    const replyCids = replies.map((reply) => reply?.cid).filter((cid): cid is string => typeof cid === 'string');
    const lastCid = replyCids.at(-1);
    const seen = seenRepliesRef.current;

    if (!seen || seen.postCid !== postCid) {
      // Wait for the first loaded replies so the initial load is not reported as new.
      if (replyCids.length === 0 && post.replyCount !== 0) return;
      seenRepliesRef.current = { postCid, cids: new Set(replyCids), lastCid, hadMore: hasMore };
      return;
    }

    const { isUpdating, recordNewReplies, updatesStarted } = useThreadLiveUpdatesStore.getState();
    const { count, quotesOwnPost } = findNewThreadReplies({ post, replies, seenReplyCids: seen.cids });
    const lastReadReplyCid = seen.lastCid;
    const isPaginating = hasMore || seen.hadMore;
    for (const cid of replyCids) seen.cids.add(cid);
    seen.lastCid = lastCid ?? seen.lastCid;
    // An update can briefly report more pages while it reloads them; only a quiet thread paginates.
    seen.hadMore = hasMore && !isUpdating;

    if (count === 0 || isPaginating || updatesStarted === 0) return;
    recordNewReplies({ count, lastReadReplyCid, quotesOwnPost });
  }, [enabled, hasMore, post, replies]);

  return unreadMarkerCid;
};

export default useThreadNewReplies;
