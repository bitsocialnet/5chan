import { useCallback } from 'react';
import { useAccount } from '@bitsocial/bitsocial-react-hooks';
import {
  createPrecheckSessionId,
  createSignedPrecheckPayload,
  fetchPrecheckStatus,
  getPrecheckIframeUrl,
  getSpamBlockerPrecheckPlan,
  type PrecheckPublication,
} from '../lib/spam-blocker-precheck';
import useChallengesStore from '../stores/use-challenges-store';

export type SpamBlockerPrecheckResult =
  /** The board does not check this post with a spam blocker that takes a pass; publish as before. */
  | { status: 'skipped' }
  /** `challengeAnswers` for the post: the pass, plus the other answers it was given. */
  | { status: 'passed'; challengeAnswers: string[] }
  /** Rejected, or closed before it finished: nothing should be uploaded. */
  | { status: 'stopped'; message?: string };

interface RunSpamBlockerPrecheckOptions {
  /** The author's role on the board; boards often exclude moderators from their spam blocker. */
  authorRole?: string;
  challenges: unknown;
  communityAddress: string | undefined;
  /** Answers the post carries anyway (a country flag); they stay in the answers that hold the pass. */
  otherAnswers?: string[];
  publication: Omit<PrecheckPublication, 'author' | 'timestamp'> & { displayName?: string };
}

/**
 * Runs the board's spam blocker on a post before its attached file is uploaded, in the challenge modal
 * the board's own check uses, so a rejected author never uploads.
 */
const useSpamBlockerPrecheck = () => {
  const account = useAccount();
  const addChallenge = useChallengesStore((state) => state.addChallenge);

  return useCallback(
    async ({ authorRole, challenges, communityAddress, otherAnswers, publication }: RunSpamBlockerPrecheckOptions): Promise<SpamBlockerPrecheckResult> => {
      const plan = getSpamBlockerPrecheckPlan(challenges, { authorRole, isReply: Boolean(publication.parentCid), otherAnswers });
      const privateKey = account?.signer?.privateKey;
      const authorAddress = account?.author?.address;
      if (!plan || !communityAddress || typeof privateKey !== 'string' || typeof authorAddress !== 'string') return { status: 'skipped' };

      const { displayName, ...draft } = publication;
      let sessionId: string;
      let payload: string;
      try {
        sessionId = createPrecheckSessionId();
        payload = await createSignedPrecheckPayload({
          communityAddress,
          privateKey,
          publication: { ...draft, author: { address: authorAddress, displayName }, timestamp: Math.floor(Date.now() / 1000) },
          sessionId,
          timestamp: Math.floor(Date.now() / 1000),
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
      return outcome.status === 'completed'
        ? { status: 'passed', challengeAnswers: plan.getChallengeAnswers(sessionId) }
        : { status: 'stopped', message: outcome.message };
    },
    [account, addChallenge],
  );
};

export default useSpamBlockerPrecheck;
