import { create } from 'zustand';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import { isTerminalTransferState, type PostTransferState } from '../lib/post-transfer-state';

// One /trash/ transfer at a time, app-wide. The mod queue's Trash and the post edit menu's Trash both open it here,
// and its modal renders from the app layout, so it keeps showing how a transfer ends after the post it was opened
// from shows as removed or unmounts.
interface PostTransferStoreState {
  activeTransferComment: Comment | null;
  // The account that opened the transfer signs its moderations, whatever account is active when they publish.
  activeTransferAccountId: string | null;
  transferStates: Record<string, PostTransferState>;
  openTransfer: (comment: Comment, accountId: string | undefined) => void;
  closeTransfer: () => void;
  setTransferState: (cid: string, transferState: PostTransferState) => void;
}

type PostTransferVisibilityState = Pick<PostTransferStoreState, 'activeTransferAccountId' | 'activeTransferComment' | 'transferStates'>;

// A transfer that has not made a /trash/ copy yet belongs to the account that opened it: while another account is
// active it is hidden and holds no lock, as its modal used to unmount with the Trash button that opened it. Once it
// is publishing or has made a copy, it stays visible so the moderator sees how it ends.
export const getVisibleTransferComment = (state: PostTransferVisibilityState, accountId: string | undefined): Comment | null => {
  const comment = state.activeTransferComment;
  if (!comment?.cid) return null;
  const transferState = state.transferStates[comment.cid];
  if (transferState === 'publishing' || isTerminalTransferState(transferState)) return comment;
  return accountId !== undefined && state.activeTransferAccountId === accountId ? comment : null;
};

const usePostTransferStore = create<PostTransferStoreState>((set) => ({
  activeTransferComment: null,
  activeTransferAccountId: null,
  transferStates: {},
  openTransfer: (comment, accountId) =>
    set((state) => {
      const { cid } = comment;
      if (!cid || !accountId || getVisibleTransferComment(state, accountId)) return state;
      const transferState = state.transferStates[cid];
      if (transferState === 'publishing' || isTerminalTransferState(transferState)) return state;
      return { activeTransferComment: comment, activeTransferAccountId: accountId };
    }),
  // A publishing transfer keeps its modal open so the moderator still sees how it ends.
  closeTransfer: () =>
    set((state) => {
      const activeCid = state.activeTransferComment?.cid;
      if (!activeCid || state.transferStates[activeCid] === 'publishing') return state;
      return { activeTransferComment: null, activeTransferAccountId: null };
    }),
  setTransferState: (cid, transferState) => set((state) => ({ transferStates: { ...state.transferStates, [cid]: transferState } })),
}));

export default usePostTransferStore;
