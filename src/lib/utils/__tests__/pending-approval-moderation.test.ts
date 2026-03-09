import { describe, expect, it } from 'vitest';
import { approvePendingCommentModeration, isPendingApprovalAwaiting, isPendingApprovalRejected, rejectPendingCommentModeration } from '../pending-approval-moderation';

describe('pending approval moderation utils', () => {
  it('publishes approval with approved=true', () => {
    expect(approvePendingCommentModeration).toEqual({ approved: true });
  });

  it('publishes rejection with approved=false and no removed flag', () => {
    expect(rejectPendingCommentModeration).toEqual({ approved: false });
    expect('removed' in rejectPendingCommentModeration).toBe(false);
  });

  it('treats pending approved=false as rejected for display', () => {
    expect(isPendingApprovalRejected({ pendingApproval: true, approved: false })).toBe(true);
    expect(isPendingApprovalAwaiting({ pendingApproval: true, approved: false })).toBe(false);
  });

  it('keeps pending approvals awaiting when no decision has been made', () => {
    expect(isPendingApprovalRejected({ pendingApproval: true })).toBe(false);
    expect(isPendingApprovalAwaiting({ pendingApproval: true })).toBe(true);
  });
});
