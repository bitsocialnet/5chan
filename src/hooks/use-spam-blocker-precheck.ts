import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccount, useAccountComments } from '@bitsocial/bitsocial-react-hooks';
import type { PrecheckPublication } from '../lib/spam-blocker-precheck';
import useChallengesStore from '../stores/use-challenges-store';

export type SpamBlockerPrecheckResult =
  /** The board does not check this post with a spam blocker that takes a pass; publish as before. */
  | { status: 'skipped' }
  /** `challengeAnswers` for the post: the pass, plus the other answers it was given. */
  | { status: 'passed'; challengeAnswers: string[] }
  /** Rejected, or closed before it finished: nothing should be uploaded. No message when the author closed it. */
  | { status: 'stopped'; message?: string };

interface RunSpamBlockerPrecheckOptions {
  /** The author's role on the board; boards often exclude moderators from their spam blocker. */
  authorRole?: string;
  challenges: unknown;
  /** Answers the post carries anyway (a country flag); they stay in the answers that hold the pass. */
  otherAnswers?: string[];
  publication: Omit<PrecheckPublication, 'author' | 'timestamp'> & { displayName?: string };
}

// Keeps useAccountComments on its indexed fast path, returning nothing, before the board is known.
const EMPTY_ACCOUNT_COMMENT_LOOKUP = { commentIndices: [-1] };

/**
 * Runs the board's spam blocker on a post before its attached file is uploaded, in the challenge modal
 * the board's own check uses, so a rejected author never uploads.
 */
const useSpamBlockerPrecheck = ({ communityAddress }: { communityAddress: string | undefined }) => {
  const { t } = useTranslation();
  const account = useAccount();
  const addChallenge = useChallengesStore((state) => state.addChallenge);
  // The account's comments on the board show whether the author has the karma its spam blocker exempts.
  const accountCommentsLookup = useMemo(() => (communityAddress ? { communityAddress } : EMPTY_ACCOUNT_COMMENT_LOOKUP), [communityAddress]);
  const { accountComments } = useAccountComments(accountCommentsLookup);

  return useCallback(
    async ({ authorRole, challenges, otherAnswers, publication }: RunSpamBlockerPrecheckOptions): Promise<SpamBlockerPrecheckResult> => {
      const privateKey = account?.signer?.privateKey;
      const authorAddress = account?.author?.address;
      if (!communityAddress || typeof privateKey !== 'string' || typeof authorAddress !== 'string') return { status: 'skipped' };
      // Loaded on the first post with a file, so none of this is in the board's startup bundle.
      let precheck: typeof import('../lib/spam-blocker-precheck');
      try {
        precheck = await import('../lib/spam-blocker-precheck');
      } catch (error) {
        console.warn('Could not load the spam blocker pre-check', error);
        return { status: 'skipped' };
      }
      const { createPrecheckSessionId, fetchPrecheckStatus, getLocalAuthorHistory, getPrecheckIframeUrl, getSpamBlockerPrecheckPlan } = precheck;
      const isReply = Boolean(publication.parentCid);
      const nowSeconds = Math.floor(Date.now() / 1000);
      const authorHistory = getLocalAuthorHistory({ accountComments, isReply, nowSeconds });
      const plan = getSpamBlockerPrecheckPlan(challenges, { authorHistory, authorRole, isReply, nowSeconds, otherAnswers });
      if (!plan) return { status: 'skipped' };

      const { displayName, ...draft } = publication;
      let sessionId: string;
      let payload: string;
      try {
        const { createSignedPrecheckPayload } = await import('../lib/spam-blocker-precheck-signature');
        sessionId = createPrecheckSessionId();
        payload = createSignedPrecheckPayload({
          communityAddress,
          privateKey,
          publication: { ...draft, author: { address: authorAddress, displayName }, timestamp: nowSeconds },
          sessionId,
          timestamp: nowSeconds,
        });
      } catch (error) {
        // Without a pre-check the board still checks the post after the upload, as it did before.
        console.warn('Could not sign the spam blocker pre-check', error);
        return { status: 'skipped' };
      }

      const answered = await new Promise<boolean>((resolve) => {
        addChallenge(
          [
            { challenges: [{ type: 'url/iframe', challenge: getPrecheckIframeUrl({ payload, serverUrl: plan.serverUrl, sessionId }) }] },
            { ...draft, author: { displayName }, communityAddress, publishChallengeAnswers: () => resolve(true) },
          ],
          () => resolve(false),
        );
      });
      if (!answered) return { status: 'stopped' };

      let outcome: Awaited<ReturnType<typeof fetchPrecheckStatus>>;
      try {
        outcome = await fetchPrecheckStatus({ serverUrl: plan.serverUrl, sessionId });
      } catch (error) {
        // The pre-check only saves an upload; when its outcome cannot be read, the board still checks the post.
        console.warn('Could not read the spam blocker pre-check outcome', error);
        return { status: 'skipped' };
      }
      if (outcome.status === 'completed') return { status: 'passed', challengeAnswers: plan.getChallengeAnswers(sessionId) };
      if (outcome.message) return { status: 'stopped', message: outcome.message };
      // `pending` when the author confirmed the modal before the check finished; say why nothing was posted.
      return { status: 'stopped', message: outcome.status === 'pending' ? t('spam_check_not_finished') : t('failed') };
    },
    [account, accountComments, addChallenge, communityAddress, t],
  );
};

export default useSpamBlockerPrecheck;
