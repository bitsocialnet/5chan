import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import usePostTransferStore from '../../stores/use-post-transfer-store';
import useModQueueStore from '../../stores/use-mod-queue-store';
import { getQueuedCommentSnapshot } from '../../lib/utils/mod-queue-utils';
import PostTransferModal from './post-transfer-modal';

// Renders the open /trash/ transfer from the app layout instead of from the post or mod queue row that opened it,
// so the modal survives the post showing as removed, a row remounting, or the edit menu unmounting mid-transfer.
const PostTransferModalHost = () => {
  const activeTransferComment = usePostTransferStore((state) => state.activeTransferComment);
  const closeTransfer = usePostTransferStore((state) => state.closeTransfer);
  const setTransferState = usePostTransferStore((state) => state.setTransferState);
  const rememberCommentsInQueue = useModQueueStore((state) => state.rememberCommentsInQueue);

  const cid = activeTransferComment?.cid;
  if (!activeTransferComment || !cid) return null;

  // Moving a post pending approval publishes approved: false, so the mod queue keeps it as rejected.
  const handleTransferSuccess = (comment: Comment) => {
    if (comment.pendingApproval !== true) return;
    const rejectedSnapshot = getQueuedCommentSnapshot({ ...comment, approved: false, pendingApproval: false });
    if (rejectedSnapshot) rememberCommentsInQueue([rejectedSnapshot]);
  };

  return (
    <PostTransferModal
      key={cid}
      comment={activeTransferComment}
      onClose={closeTransfer}
      onTransferStateChange={(transferState) => setTransferState(cid, transferState)}
      onTransferSuccess={() => handleTransferSuccess(activeTransferComment)}
    />
  );
};

export default PostTransferModalHost;
