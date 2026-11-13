import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ChallengeVerification, Comment, usePublishCommentModeration } from '@bitsocial/bitsocial-react-hooks';
import { approvePendingCommentModeration, rejectPendingCommentModeration } from '../lib/utils/pending-approval-moderation';
import { alertChallengeVerificationFailed, getChallengeVerificationErrorMessages } from '../lib/utils/challenge-utils';
import { formatErrorForDisplay } from '../lib/utils/error-utils';
import useChallengesStore from '../stores/use-challenges-store';

export type PendingModerationStatus = 'approved' | 'rejected' | 'failed' | null;

export interface UsePendingCommentModerationActionsOptions {
  // The comment the moderation challenge is published against. Forwarded to the
  // challenge store so the challenge UI can reference the target comment.
  comment: Comment | undefined;
  commentCid: string | undefined;
  communityAddress: string | undefined;
  // When false, the underlying publishers are disabled by withholding the
  // community address (mirrors the mobile post page gating its actions).
  enabled?: boolean;
  // Run once the community accepts the approve/reject (successful challenge
  // verification), not when the publish is merely queued. A throw is logged.
  onApproveSuccess?: () => void | Promise<void>;
  onRejectSuccess?: () => void | Promise<void>;
}

export interface PendingCommentModerationActions {
  handleApprove: () => Promise<void>;
  handleReject: () => Promise<void>;
  isPublishing: boolean;
  // Action-derived status only ('approved'/'rejected' on success, 'failed' on
  // error). Callers that also have a baseline (e.g. an already-moderated mod
  // queue comment) combine that baseline with this value themselves.
  status: PendingModerationStatus;
  error: unknown;
  errorMessage: string | undefined;
}

// The publish action resolves once the moderation is queued, before the community
// accepts it, so success is only reported from a successful challenge verification.
const runSuccessCallback = async (callback: (() => void | Promise<void>) | undefined) => {
  try {
    await callback?.();
  } catch (e) {
    console.error(e);
  }
};

type ModerationAction = 'approve' | 'reject';

// One approve/reject attempt, settled by its own publish callbacks. The hooks publishing
// state is shared by every attempt and keeps the previous attempt's 'failed' until a retry
// reaches the community, so it only counts once this attempt's own challenge has arrived.
type ModerationAttempt = { action: ModerationAction; outcome: 'publishing' | 'succeeded' | 'failed'; error?: unknown; hasChallenge?: boolean };

// Shared approve/reject state machine for pending-approval comment moderation.
// Extracted from the duplicated copies in desktop posts, mobile posts, and the
// mod queue so the riskiest moderation flow lives behind one tested boundary.
export const usePendingCommentModerationActions = ({
  comment,
  commentCid,
  communityAddress,
  enabled = true,
  onApproveSuccess,
  onRejectSuccess,
}: UsePendingCommentModerationActionsOptions): PendingCommentModerationActions => {
  const { t } = useTranslation();
  const effectiveCommunityAddress = enabled ? communityAddress : undefined;
  const [attempt, setAttempt] = useState<ModerationAttempt | null>(null);
  const pendingActionRef = useRef<ModerationAction | null>(null);

  // Callbacks only change the attempt of their own action, so a late callback cannot overwrite the other action.
  const updateAttempt = (action: ModerationAction, nextAttempt: ModerationAttempt | null) => {
    setAttempt((currentAttempt) => (currentAttempt?.action === action ? nextAttempt : currentAttempt));
  };

  const getModerationCallbacks = (action: ModerationAction, onSuccess: (() => void | Promise<void>) | undefined, errorLabel: string) => ({
    onChallenge: async (...args: any) => {
      // A challenge also arrives when hooks republishes a failed verification on its own.
      updateAttempt(action, { action, outcome: 'publishing', hasChallenge: true });
      // Closing the challenge ends this attempt, so the approve/reject buttons come back.
      useChallengesStore.getState().addChallenge([...args, comment], () => updateAttempt(action, null));
    },
    onChallengeVerification: async (challengeVerification: ChallengeVerification, challengedComment: Comment) => {
      alertChallengeVerificationFailed(challengeVerification, challengedComment);
      if (challengeVerification?.challengeSuccess === true) {
        updateAttempt(action, { action, outcome: 'succeeded' });
        await runSuccessCallback(onSuccess);
        return;
      }
      const errorMessages = getChallengeVerificationErrorMessages(challengeVerification);
      updateAttempt(action, { action, outcome: 'failed', error: errorMessages.length > 0 ? new Error(errorMessages.join(', ')) : undefined });
    },
    onError: (error: Error & { details?: unknown }) => {
      console.error(errorLabel, error, error.details);
      updateAttempt(action, { action, outcome: 'failed', error });
    },
  });

  const { publishCommentModeration: approve, state: approveState } = usePublishCommentModeration({
    commentCid,
    communityAddress: effectiveCommunityAddress,
    commentModeration: approvePendingCommentModeration,
    ...getModerationCallbacks('approve', onApproveSuccess, 'Approve failed:'),
  });

  const { publishCommentModeration: reject, state: rejectState } = usePublishCommentModeration({
    commentCid,
    communityAddress: effectiveCommunityAddress,
    commentModeration: rejectPendingCommentModeration,
    ...getModerationCallbacks('reject', onRejectSuccess, 'Reject failed:'),
  });

  const handleApprove = useCallback(async () => {
    if (pendingActionRef.current) return;
    if (!window.confirm(t('double_confirm'))) {
      return;
    }
    pendingActionRef.current = 'approve';
    setAttempt({ action: 'approve', outcome: 'publishing' });
    try {
      await approve();
    } catch (e) {
      console.error(e);
    } finally {
      pendingActionRef.current = null;
    }
  }, [approve, t]);

  const handleReject = useCallback(async () => {
    if (pendingActionRef.current) return;
    if (!window.confirm(t('double_confirm'))) {
      return;
    }
    pendingActionRef.current = 'reject';
    setAttempt({ action: 'reject', outcome: 'publishing' });
    try {
      await reject();
    } catch (e) {
      console.error(e);
    } finally {
      pendingActionRef.current = null;
    }
  }, [reject, t]);

  // A challenge answer that fails to publish reaches no callback: pkc-js only moves the publishing state to 'failed'.
  const attemptPublishingState = attempt?.action === 'approve' ? approveState : rejectState;
  const outcome = attempt?.outcome === 'publishing' && attempt.hasChallenge && attemptPublishingState === 'failed' ? 'failed' : attempt?.outcome;
  const isPublishing = outcome === 'publishing';
  const status: PendingModerationStatus = outcome === 'succeeded' ? (attempt?.action === 'approve' ? 'approved' : 'rejected') : outcome === 'failed' ? 'failed' : null;
  const error = attempt?.outcome === 'failed' ? attempt.error : undefined;
  const errorMessage = formatErrorForDisplay(error);

  return { handleApprove, handleReject, isPublishing, status, error, errorMessage };
};

export default usePendingCommentModerationActions;
