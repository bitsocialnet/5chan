import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccount, useAccountComments } from '@bitsocial/bitsocial-react-hooks';
import type { ForgeUploadAuthorizer } from '../lib/forge-upload-authorization';
import type { PrecheckPublication } from '../lib/spam-blocker-precheck';
import type { ChallengeAnswersByIndex } from '../lib/utils/challenge-utils';
import useChallengesStore from '../stores/use-challenges-store';

export type SpamBlockerPrecheckResult =
  /** The board does not check this post with a spam blocker that takes a pass; publish as before. */
  | { status: 'skipped' }
  /** Pre-answers for the post: the pass under the challenge index of each spam blocker that redeems it. */
  | { status: 'passed'; challengeAnswers: ChallengeAnswersByIndex; authorizeForgeUpload?: ForgeUploadAuthorizer }
  | { status: 'exempt'; authorizeForgeUpload: ForgeUploadAuthorizer }
  /** Rejected, or closed before it finished: nothing should be uploaded. No message when the author closed it. */
  | { status: 'stopped'; message?: string };

interface RunSpamBlockerPrecheckOptions {
  /** The author's role on the board; boards often exclude moderators from their spam blocker. */
  authorRole?: string;
  challenges: unknown;
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
    async ({ authorRole, challenges, publication }: RunSpamBlockerPrecheckOptions): Promise<SpamBlockerPrecheckResult> => {
      const advertisesPrecheck =
        Array.isArray(challenges) &&
        challenges.some(
          (challenge: { type?: unknown; challenge?: unknown } | null) =>
            challenge?.type === 'url/iframe' && typeof challenge.challenge === 'string' && /\/precheck(?:\?|$)/.test(challenge.challenge),
        );
      if (!advertisesPrecheck) return { status: 'skipped' };
      const privateKey = account?.signer?.privateKey;
      const accountAddress = account?.author?.address;
      const authorAddress = account?.signer?.address ?? accountAddress;
      // Older app releases stored a verified name in author.address; the server resolves it against the signer.
      const authorName = account?.author?.name ?? (typeof accountAddress === 'string' && accountAddress.endsWith('.bso') ? accountAddress : undefined);
      // Loaded on the first post with a file, so none of this is in the board's startup bundle.
      let precheck: typeof import('../lib/spam-blocker-precheck');
      try {
        precheck = await import('../lib/spam-blocker-precheck');
      } catch (error) {
        console.warn('Could not load the spam blocker pre-check', error);
        return { status: 'stopped', message: t('spam_check_not_finished') };
      }
      const { createPrecheckSessionId, fetchPrecheckStatus, getLocalAuthorHistory, getPrecheckIframeUrl, getSpamBlockerPrecheckPlan } = precheck;
      const isReply = Boolean(publication.parentCid);
      const nowSeconds = Math.floor(Date.now() / 1000);
      const authorHistory = getLocalAuthorHistory({ accountComments, isReply, nowSeconds });
      const plan = getSpamBlockerPrecheckPlan(challenges, { authorHistory, authorRole, isReply, nowSeconds });
      if (!plan) return { status: 'skipped' };
      if (!communityAddress || typeof privateKey !== 'string' || typeof authorAddress !== 'string') return { status: 'stopped', message: t('spam_check_not_finished') };

      const { displayName, ...draft } = publication;
      let sessionId: string;
      let payload: string;
      try {
        const { createSignedPrecheckPayload } = await import('../lib/spam-blocker-precheck-signature');
        sessionId = createPrecheckSessionId();
        payload = createSignedPrecheckPayload({
          communityAddress,
          privateKey,
          publication: { ...draft, author: { address: authorAddress, name: authorName, displayName }, timestamp: nowSeconds },
          sessionId,
          timestamp: nowSeconds,
        });
      } catch (error) {
        // Do not upload when a required identity check could not be signed.
        console.warn('Could not sign the spam blocker pre-check', error);
        return { status: 'stopped', message: t('spam_check_not_finished') };
      }

      const showRateLimitNotice = (error: unknown) =>
        precheck.showSpamBlockerRateLimitNotice({ error, serverUrl: plan.serverUrl, addChallenge, publication: { ...draft, author: { displayName }, communityAddress } });

      let authorizeForgeUpload: ForgeUploadAuthorizer | undefined;
      if (plan.verifyExemptions) {
        try {
          const { createForgeUploadAuthorizer } = await import('../lib/forge-upload-authorization');
          const authorizerOptions = { serverUrl: plan.serverUrl, communityAddress, privateKey, authorAddress, authorName, parentCid: draft.parentCid };
          const exempt = await precheck.fetchPrecheckExemption({ serverUrl: plan.serverUrl, payload });
          authorizeForgeUpload = createForgeUploadAuthorizer({
            ...authorizerOptions,
            ...(exempt ? {} : { precheckSessionId: sessionId }),
            onRateLimit: showRateLimitNotice,
          });
          if (exempt) return { status: 'exempt', authorizeForgeUpload };
        } catch (error) {
          if (await showRateLimitNotice(error)) return { status: 'stopped' };
          return { status: 'stopped', message: error instanceof Error ? error.message : t('spam_check_not_finished') };
        }
      }

      const answered = await new Promise<boolean>((resolve) => {
        addChallenge(
          [
            { challenges: { 0: { type: 'url/iframe', challenge: getPrecheckIframeUrl({ payload, serverUrl: plan.serverUrl, sessionId }) } } },
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
        // An unavailable result is not upload authorization.
        console.warn('Could not read the spam blocker pre-check outcome', error);
        return { status: 'stopped', message: t('spam_check_not_finished') };
      }
      if (outcome.status === 'completed')
        return { status: 'passed', challengeAnswers: plan.getChallengeAnswers(sessionId), ...(authorizeForgeUpload ? { authorizeForgeUpload } : {}) };
      if (outcome.message) return { status: 'stopped', message: outcome.message };
      // `pending` when the author confirmed the modal before the check finished; say why nothing was posted.
      return { status: 'stopped', message: outcome.status === 'pending' ? t('spam_check_not_finished') : t('failed') };
    },
    [account, accountComments, addChallenge, communityAddress, t],
  );
};

export default useSpamBlockerPrecheck;
