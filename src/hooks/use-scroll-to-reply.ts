import { useEffect, useRef } from 'react';
import { VirtuosoHandle } from 'react-virtuoso';

type ReplyItem = {
  cid?: string | null;
};

interface UseScrollToReplyParams {
  targetReplyCid?: string;
  replies: ReplyItem[];
  hasMore: boolean;
  loadMore: () => void;
  virtuosoRef: React.RefObject<VirtuosoHandle | null>;
  enabled?: boolean;
}

const DEFAULT_MAX_LOAD_ATTEMPTS = 500;
const MAX_LOAD_DURATION_MS = 120000;
const LOAD_MORE_THROTTLE_MS = 300;
const AUTO_SCROLL_INTERVAL_MS = 350;

const useScrollToReply = ({ targetReplyCid, replies, hasMore, loadMore, virtuosoRef, enabled = true }: UseScrollToReplyParams) => {
  const hasScrolledRef = useRef(false);
  const loadAttemptsRef = useRef(0);
  const lastRepliesLengthRef = useRef(replies.length);
  const loadMoreTimeoutRef = useRef<number | null>(null);
  const lastLoadAtRef = useRef(0);
  const loadStartAtRef = useRef(0);
  const lastScrollIndexRef = useRef(-1);
  const intervalRef = useRef<number | null>(null);
  const latestTargetRef = useRef(targetReplyCid);
  const latestRepliesRef = useRef(replies);
  const latestHasMoreRef = useRef(hasMore);
  const latestLoadMoreRef = useRef(loadMore);

  // Only reset when the target changes, NOT when replies.length changes
  // (replies.length changing is expected as we load more pages)
  useEffect(() => {
    hasScrolledRef.current = false;
    loadAttemptsRef.current = 0;
    lastRepliesLengthRef.current = replies.length;
    lastLoadAtRef.current = 0;
    loadStartAtRef.current = Date.now();
    lastScrollIndexRef.current = -1;
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (loadMoreTimeoutRef.current) {
      window.clearTimeout(loadMoreTimeoutRef.current);
      loadMoreTimeoutRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetReplyCid]);

  useEffect(() => {
    latestTargetRef.current = targetReplyCid;
  }, [targetReplyCid]);

  useEffect(() => {
    latestRepliesRef.current = replies;
  }, [replies]);

  useEffect(() => {
    latestHasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    latestLoadMoreRef.current = loadMore;
  }, [loadMore]);

  useEffect(() => {
    if (replies.length !== lastRepliesLengthRef.current) {
      lastRepliesLengthRef.current = replies.length;
    }
  }, [replies.length]);

  useEffect(() => {
    if (!enabled || !targetReplyCid || intervalRef.current) return;

    intervalRef.current = window.setInterval(() => {
      const latestTarget = latestTargetRef.current;
      const latestReplies = latestRepliesRef.current;
      const latestHasMore = latestHasMoreRef.current;
      const latestLoadMore = latestLoadMoreRef.current;

      if (!enabled || !latestTarget || hasScrolledRef.current) {
        if (intervalRef.current) {
          window.clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }

      if (!latestHasMore) {
        const element = document.querySelector(`[data-cid="${latestTarget}"]`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          hasScrolledRef.current = true;
        } else {
          // Reply not found after loading all pages
          console.warn(`[scroll-to-reply] Could not find reply with CID "${latestTarget}" in the feed.`);
          hasScrolledRef.current = true; // Stop trying
        }
        if (intervalRef.current) {
          window.clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }

      // Iteratively load pages until the target reply appears in the list.
      const targetIndex = latestReplies.findIndex((reply) => reply?.cid === latestTarget);
      if (targetIndex >= 0) {
        hasScrolledRef.current = true;
        if (loadMoreTimeoutRef.current) {
          window.clearTimeout(loadMoreTimeoutRef.current);
          loadMoreTimeoutRef.current = null;
        }
        if (intervalRef.current) {
          window.clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        virtuosoRef.current?.scrollToIndex({ index: targetIndex, align: 'center', behavior: 'smooth' });
        return;
      }

      // Smoothly scroll to the latest loaded replies while loading more pages
      const lastIndex = latestReplies.length - 1;
      if (lastIndex >= 0 && lastIndex !== lastScrollIndexRef.current) {
        lastScrollIndexRef.current = lastIndex;
        virtuosoRef.current?.scrollToIndex({ index: lastIndex, align: 'end', behavior: 'smooth' });
      }

      const loadDuration = Date.now() - loadStartAtRef.current;
      if (!latestHasMore || loadAttemptsRef.current >= DEFAULT_MAX_LOAD_ATTEMPTS || loadDuration >= MAX_LOAD_DURATION_MS) return;

      const now = Date.now();
      if (now - lastLoadAtRef.current < LOAD_MORE_THROTTLE_MS) return;

      lastLoadAtRef.current = now;
      loadAttemptsRef.current += 1;

      if (loadMoreTimeoutRef.current) {
        window.clearTimeout(loadMoreTimeoutRef.current);
      }
      loadMoreTimeoutRef.current = window.setTimeout(() => {
        latestLoadMore();
      }, LOAD_MORE_THROTTLE_MS);
    }, AUTO_SCROLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (loadMoreTimeoutRef.current) {
        window.clearTimeout(loadMoreTimeoutRef.current);
        loadMoreTimeoutRef.current = null;
      }
    };
  }, [enabled, targetReplyCid, virtuosoRef]);
};

export default useScrollToReply;
