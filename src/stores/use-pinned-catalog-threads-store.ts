import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 4chan's catalog "Pin thread": a pinned thread sits right after the sticky threads and shows how
// many replies it got since the viewer last read it. Thread CIDs are unique across boards, so pins
// are keyed by CID instead of per board like 4chan's thread numbers.
export interface PinnedCatalogThread {
  communityAddress: string;
  /** Reply count when the thread was pinned or last opened. */
  readReplyCount: number;
}

interface PinnedCatalogThreadsState {
  pinnedThreads: Record<string, PinnedCatalogThread>;
  pinThread: (thread: { cid: string; communityAddress: string; replyCount?: number }) => void;
  unpinThread: (cid: string) => void;
  markThreadRead: (cid: string, replyCount: number) => void;
}

const usePinnedCatalogThreadsStore = create<PinnedCatalogThreadsState>()(
  persist(
    (set) => ({
      pinnedThreads: {},
      pinThread: ({ cid, communityAddress, replyCount }) =>
        set((state) => ({
          pinnedThreads: { ...state.pinnedThreads, [cid]: { communityAddress, readReplyCount: replyCount ?? 0 } },
        })),
      unpinThread: (cid) =>
        set((state) => {
          if (!state.pinnedThreads[cid]) return state;
          const pinnedThreads = { ...state.pinnedThreads };
          delete pinnedThreads[cid];
          return { pinnedThreads };
        }),
      markThreadRead: (cid, replyCount) =>
        set((state) => {
          const pinnedThread = state.pinnedThreads[cid];
          if (!pinnedThread || pinnedThread.readReplyCount === replyCount) return state;
          return { pinnedThreads: { ...state.pinnedThreads, [cid]: { ...pinnedThread, readReplyCount: replyCount } } };
        }),
    }),
    {
      name: 'pinned-catalog-threads-store',
    },
  ),
);

export const getPinnedThreadNewReplyCount = (pinnedThread: PinnedCatalogThread, replyCount: number | undefined) =>
  Math.max(0, (replyCount ?? 0) - pinnedThread.readReplyCount);

export default usePinnedCatalogThreadsStore;
