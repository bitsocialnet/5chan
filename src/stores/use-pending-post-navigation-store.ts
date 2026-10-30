import { create } from 'zustand';

interface PendingPostNavigationState {
  pendingPostNavigationIndex: number | null;
  isNavigatingToPendingPost: boolean;
  /** The pending post page on screen, so a publish that ends after the author left it does not pull them back. */
  visiblePendingPostIndex: number | null;
  beginPendingPostNavigation: (accountCommentIndex: number) => void;
  completePendingPostNavigation: () => void;
  clearPendingPostHandoff: (accountCommentIndex?: number) => void;
  clearPendingPostNavigation: (accountCommentIndex?: number) => void;
  showPendingPost: (accountCommentIndex: number) => void;
  hidePendingPost: (accountCommentIndex: number) => void;
}

const usePendingPostNavigationStore = create<PendingPostNavigationState>((set) => ({
  pendingPostNavigationIndex: null,
  isNavigatingToPendingPost: false,
  visiblePendingPostIndex: null,
  beginPendingPostNavigation: (pendingPostNavigationIndex) => set({ isNavigatingToPendingPost: true, pendingPostNavigationIndex }),
  completePendingPostNavigation: () => set({ isNavigatingToPendingPost: false }),
  clearPendingPostHandoff: (accountCommentIndex) =>
    set((state) => (accountCommentIndex === undefined || state.pendingPostNavigationIndex === accountCommentIndex ? { pendingPostNavigationIndex: null } : state)),
  clearPendingPostNavigation: (accountCommentIndex) =>
    set((state) =>
      accountCommentIndex === undefined || state.pendingPostNavigationIndex === accountCommentIndex
        ? { isNavigatingToPendingPost: false, pendingPostNavigationIndex: null }
        : state,
    ),
  showPendingPost: (visiblePendingPostIndex) => set({ visiblePendingPostIndex }),
  hidePendingPost: (accountCommentIndex) => set((state) => (state.visiblePendingPostIndex === accountCommentIndex ? { visiblePendingPostIndex: null } : state)),
}));

export default usePendingPostNavigationStore;
