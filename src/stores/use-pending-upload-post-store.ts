import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import { create } from 'zustand';
import type { AttachedMedia, UploadPhase } from '../lib/media-hosting/types';

/** `spam_check` while the board's spam blocker checks the post, before anything is uploaded. */
export type PendingUploadPhase = 'spam_check' | UploadPhase;

/**
 * A new thread whose attached file is not uploaded yet. It shows as the pending post as soon as it is
 * submitted, with the local file as its thumbnail, while the spam blocker check and the upload run, and
 * is published once the upload returns a link.
 */
export interface PendingUploadPost {
  id: number;
  attachment: AttachedMedia;
  /** The author's role on the board, which the board's challenges may exclude. */
  authorRole?: string;
  /** The board's public challenges when the post was submitted, which say whether it takes a pre-check. */
  boardChallenges: unknown;
  boardPath?: string;
  /** The form draft, reopened with the file still attached when the check or the upload stops. */
  draftKey: string;
  nonokoRedirectPath: string | null;
  phase: PendingUploadPhase;
  /** The post as the pending page shows it until it is published. */
  post: Comment;
  /** What publishPost receives, except the uploaded link. */
  publishOptions: Comment;
}

interface PendingUploadPostState {
  pendingUploadPost: PendingUploadPost | null;
  /** Replaces any post still uploading; that one stops before its next step. */
  startPendingUploadPost: (post: Omit<PendingUploadPost, 'id' | 'phase'>) => PendingUploadPost;
  setPendingUploadPhase: (id: number, phase: PendingUploadPhase) => void;
  clearPendingUploadPost: (id: number) => void;
}

let nextPendingUploadPostId = 1;

const usePendingUploadPostStore = create<PendingUploadPostState>((set) => ({
  pendingUploadPost: null,
  startPendingUploadPost: (post) => {
    const pendingUploadPost: PendingUploadPost = { ...post, id: nextPendingUploadPostId++, phase: 'spam_check' };
    set({ pendingUploadPost });
    return pendingUploadPost;
  },
  setPendingUploadPhase: (id, phase) => set((state) => (state.pendingUploadPost?.id === id ? { pendingUploadPost: { ...state.pendingUploadPost, phase } } : state)),
  clearPendingUploadPost: (id) => set((state) => (state.pendingUploadPost?.id === id ? { pendingUploadPost: null } : state)),
}));

export const isCurrentPendingUploadPost = (id: number) => usePendingUploadPostStore.getState().pendingUploadPost?.id === id;

export default usePendingUploadPostStore;
