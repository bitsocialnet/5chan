import { useEffect, useRef } from 'react';
import { isAccountComment, type Comment } from '@bitsocial/bitsocial-react-hooks';
import useThreadLiveUpdatesStore from '../stores/use-thread-live-updates-store';
// The `use` name makes the React Compiler treat the store as a hook instead of memoizing the call away.
import { authorTagCheckStore as useAuthorTagCheckStore } from '../lib/bitsocial-internals/stores';
import { findNewThreadReplies } from '../lib/utils/thread-updater-utils';

interface SeenReplies {
  postCid: string;
  cids: Set<string>;
  lastCid: string | undefined;
  hadMore: boolean;
  authorTagCheckWaitStartedAt?: number;
}

// How long an update waits for the hooks' author tag check, so a check that fails to load (e.g. its
// chunk is gone after a deploy) delays the updater instead of stopping it.
const AUTHOR_TAG_CHECK_WAIT_MS = 10_000;

const hasAuthorTag = (comment: Comment | undefined) => typeof comment?.raw?.commentUpdate?.pseudonymityAuthorTag === 'string';

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
  const authorTagCheckLoaded = useAuthorTagCheckStore((state) => state.loaded);

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

    // Until the hooks' author tag check loads, isAccountComment reads the viewer's posts from other
    // devices on a board that tags aliased posts as someone else's. Checking a tagged post starts the
    // load, and the update waits until this effect runs again with the check loaded.
    const taggedComment = authorTagCheckLoaded ? undefined : [post, ...replies].find(hasAuthorTag);
    if (taggedComment) {
      seen.authorTagCheckWaitStartedAt ??= Date.now();
      if (Date.now() - seen.authorTagCheckWaitStartedAt < AUTHOR_TAG_CHECK_WAIT_MS) {
        isAccountComment(taggedComment);
        return;
      }
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
  }, [authorTagCheckLoaded, enabled, hasMore, post, replies]);

  return unreadMarkerCid;
};

export default useThreadNewReplies;
