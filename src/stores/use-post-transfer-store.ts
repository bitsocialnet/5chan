import { create } from 'zustand';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import { isTerminalTransferState, type PostTransferState } from '../lib/comment-transfer';

// One /trash/ transfer at a time, app-wide. The mod queue's Trash and the post edit menu's Trash both open it here,
// and its modal renders from the app layout, so it keeps showing how a transfer ends after the post it was opened
// from shows as removed or unmounts.
interface PostTransferStoreState {
  activeTransferComment: Comment | null;
  transferStates: Record<string, PostTransferState>;
  openTransfer: (comment: Comment) => void;
  closeTransfer: () => void;
  setTransferState: (cid: string, transferState: PostTransferState) => void;
}

const usePostTransferStore = create<PostTransferStoreState>((set) => ({
  activeTransferComment: null,
  transferStates: {},
  openTransfer: (comment) =>
    set((state) => {
      const { cid } = comment;
      if (!cid || state.activeTransferComment) return state;
      const transferState = state.transferStates[cid];
      if (transferState === 'publishing' || isTerminalTransferState(transferState)) return state;
      return { activeTransferComment: comment };
    }),
  // A publishing transfer keeps its modal open so the moderator still sees how it ends.
  closeTransfer: () =>
    set((state) => {
      const activeCid = state.activeTransferComment?.cid;
      if (!activeCid || state.transferStates[activeCid] === 'publishing') return state;
      return { activeTransferComment: null };
    }),
  setTransferState: (cid, transferState) => set((state) => ({ transferStates: { ...state.transferStates, [cid]: transferState } })),
}));

export default usePostTransferStore;
