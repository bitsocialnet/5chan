import { useEffect, useRef } from 'react';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import useThreadLiveUpdatesStore, { type RefreshThread } from '../stores/use-thread-live-updates-store';
import { getThreadDeadReason } from '../lib/utils/thread-updater-utils';

const isScrolledToBottom = () => document.documentElement.scrollHeight <= Math.ceil(window.innerHeight + window.scrollY);

/** Connects the open thread to the Update and Auto controls. Mount once, on the thread page. */
const useThreadUpdater = ({ post, refreshThread }: { post: Comment | undefined; refreshThread: RefreshThread | undefined }) => {
  const openThread = useThreadLiveUpdatesStore((state) => state.openThread);
  const setRefreshThread = useThreadLiveUpdatesStore((state) => state.setRefreshThread);
  const setThreadPost = useThreadLiveUpdatesStore((state) => state.setThreadPost);
  const markThreadDead = useThreadLiveUpdatesStore((state) => state.markThreadDead);
  const resetState = useThreadLiveUpdatesStore((state) => state.resetState);
  const threadCid = post?.cid;
  const isThreadLoaded = typeof post?.updatedAt === 'number';
  const deadReason = getThreadDeadReason(post);
  const aliveThreadCidRef = useRef<string>(undefined);

  useEffect(() => resetState, [resetState]);

  useEffect(() => {
    openThread(threadCid);
  }, [openThread, threadCid]);

  useEffect(() => {
    setRefreshThread(refreshThread);
  }, [refreshThread, setRefreshThread]);

  useEffect(() => {
    setThreadPost(post);
  }, [post, setThreadPost]);

  useEffect(() => {
    if (!threadCid || !isThreadLoaded) return;
    if (!deadReason) {
      aliveThreadCidRef.current = threadCid;
      return;
    }
    // Like 4chan, only a thread that dies while open announces it; an archived thread just stays still.
    markThreadDead(deadReason, aliveThreadCidRef.current === threadCid);
  }, [deadReason, isThreadLoaded, markThreadDead, threadCid]);

  useEffect(() => {
    const handleScroll = () => {
      if (!document.hidden && isScrolledToBottom()) useThreadLiveUpdatesStore.getState().clearUnread();
    };
    const handleVisibilityChange = () => useThreadLiveUpdatesStore.getState().handleVisibilityChange();
    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
};

export default useThreadUpdater;
