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
const LOAD_MORE_THROTTLE_MS = 150;
const AUTO_SCROLL_INTERVAL_MS = 100;

const getMountedReplyElement = (targetReplyCid: string) =>
  Array.from(document.querySelectorAll<HTMLElement>(`[data-cid="${targetReplyCid}"][data-post-cid]`)).find((element) => !element.closest('[class*="replyQuotePreview"]'));

const useScrollToReply = ({ targetReplyCid, replies, hasMore, loadMore, virtuosoRef, enabled = true }: UseScrollToReplyParams) => {
  const hasScrolledRef = useRef(false);
  const loadAttemptsRef = useRef(0);
  const lastLoadAtRef = useRef(0);
  const loadStartAtRef = useRef(0);
  const lastScrollIndexRef = useRef(-1);
  const intervalRef = useRef<number | null>(null);

  // Only reset when the target changes, NOT when replies.length changes
  // (replies.length changing is expected as we load more pages)
  useEffect(() => {
    hasScrolledRef.current = false;
    loadAttemptsRef.current = 0;
    lastLoadAtRef.current = 0;
    loadStartAtRef.current = Date.now();
    lastScrollIndexRef.current = -1;
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetReplyCid]);

  useEffect(() => {
    if (!enabled || !targetReplyCid || hasScrolledRef.current) return;

    const attemptScroll = () => {
      if (hasScrolledRef.current) {
        return true;
      }

      const mountedTarget = getMountedReplyElement(targetReplyCid);
      if (mountedTarget) {
        mountedTarget.scrollIntoView({
          behavior: 'auto',
          block: 'center',
        });
        hasScrolledRef.current = true;
        return true;
      }

      const targetIndex = replies.findIndex((reply) => reply?.cid === targetReplyCid);
      if (targetIndex >= 0) {
        hasScrolledRef.current = true;
        virtuosoRef.current?.scrollToIndex({ index: targetIndex, align: 'center', behavior: 'auto' });
        return true;
      }

      if (!hasMore) {
        console.warn(`[scroll-to-reply] Could not find reply with CID "${targetReplyCid}" in the feed.`);
        hasScrolledRef.current = true;
        return true;
      }

      // Keep the viewport close to the newly loaded tail while the target is still missing.
      const lastIndex = replies.length - 1;
      if (lastIndex >= 0 && lastIndex !== lastScrollIndexRef.current) {
        lastScrollIndexRef.current = lastIndex;
        virtuosoRef.current?.scrollToIndex({ index: lastIndex, align: 'end', behavior: 'auto' });
      }

      const loadDuration = Date.now() - loadStartAtRef.current;
      if (loadAttemptsRef.current >= DEFAULT_MAX_LOAD_ATTEMPTS || loadDuration >= MAX_LOAD_DURATION_MS) {
        console.warn(`[scroll-to-reply] Gave up scrolling to reply "${targetReplyCid}" after ${loadAttemptsRef.current} attempts / ${loadDuration}ms.`);
        hasScrolledRef.current = true;
        return true;
      }

      const now = Date.now();
      if (now - lastLoadAtRef.current >= LOAD_MORE_THROTTLE_MS) {
        lastLoadAtRef.current = now;
        loadAttemptsRef.current += 1;
        loadMore();
      }

      return false;
    };

    if (attemptScroll()) {
      return;
    }

    intervalRef.current = window.setInterval(() => {
      if (attemptScroll() && intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }, AUTO_SCROLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, targetReplyCid, replies, hasMore, loadMore, virtuosoRef]);
};

export default useScrollToReply;
