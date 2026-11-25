import { useCallback } from 'react';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import { canMoveCommentToTrash } from '../lib/comment-transfer';
import { isTerminalTransferState } from '../lib/post-transfer-state';
import usePostTransferStore from '../stores/use-post-transfer-store';

// The /trash/ transfer state of one post, shared by every Trash button that can move it.
const usePostTransfer = (comment: Comment | undefined) => {
  const cid = comment?.cid;
  const activeTransferCid = usePostTransferStore((state) => state.activeTransferComment?.cid ?? null);
  const transferState = usePostTransferStore((state) => (cid ? state.transferStates[cid] : undefined)) ?? 'idle';
  const openStoreTransfer = usePostTransferStore((state) => state.openTransfer);
  const isTransferOpen = Boolean(cid && activeTransferCid === cid);
  const isTransferLocked = transferState === 'publishing' || isTerminalTransferState(transferState);
  // Trash stays available on the post whose transfer is open, and on no other post until that transfer is closed.
  const canShowTransfer = Boolean(cid) && canMoveCommentToTrash(comment) && !isTransferLocked && (!activeTransferCid || isTransferOpen);
  const openTransfer = useCallback(() => {
    if (comment) openStoreTransfer(comment);
  }, [comment, openStoreTransfer]);

  return {
    openTransfer: canShowTransfer ? openTransfer : undefined,
    isTransferPublishing: transferState === 'publishing',
    isTransferSucceeded: transferState === 'succeeded',
  };
};

export default usePostTransfer;
