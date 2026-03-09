export const approvePendingCommentModeration = { approved: true } as const;

// plebbit-js clears pendingApproval only when rejection is published as approved:false.
// Sending removed:true marks the comment removed but can leave it in the mod queue.
export const rejectPendingCommentModeration = { approved: false } as const;

type PendingApprovalDisplayState = {
  approved?: boolean;
  removed?: boolean;
  pendingApproval?: boolean;
};

export const isPendingApprovalRejected = (comment?: PendingApprovalDisplayState) =>
  comment?.removed === true || (comment?.pendingApproval === true && comment?.approved === false);

export const isPendingApprovalAwaiting = (comment?: PendingApprovalDisplayState) =>
  comment?.pendingApproval === true && comment?.approved !== true && !isPendingApprovalRejected(comment);
