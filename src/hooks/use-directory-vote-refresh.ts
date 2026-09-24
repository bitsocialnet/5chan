import { useEffect } from 'react';
import { useAccount } from '@bitsocial/bitsocial-react-hooks';
import { topicFor, type NameResolver, type PubsubVoterOptions } from '@bitsocial/pubsub-voting';
import { loadDirectoryVoteCriteria } from '../lib/directory-vote-criteria';
import { isDirectoryVoteRefreshDue, publishDirectoryVote, withDirectoryVoteLock } from '../lib/directory-vote-publishing';
import { getAccountVoteSigner, type AccountVoteSigner } from '../lib/directory-vote-signer';
import { getOrCreateBrowserPubsubVoter, getVotingChainClient } from '../lib/pubsub-voter';
import useDirectoryVotesStore, { getDirectoryVoteKey } from '../stores/use-directory-votes-store';
import { getBrowserHeliaNode, getBrowserNameResolvers } from './use-pubsub-voter';

const REFRESH_CHECK_INTERVAL_MS = 60 * 60 * 1000;

interface RefreshOptions {
  voteSigner: AccountVoteSigner;
  helia: PubsubVoterOptions['helia'];
  nameResolvers: NameResolver[] | undefined;
}

/**
 * Re-sign this wallet's standing directory votes once they pass half their expiry window.
 * Nothing is joined or constructed unless the wallet has a stored vote.
 */
export const refreshDueDirectoryVotes = async ({ voteSigner, helia, nameResolvers }: RefreshOptions): Promise<void> => {
  const address = voteSigner.address.toLowerCase();
  const storedVotes = Object.values(useDirectoryVotesStore.getState().votes).filter((vote) => vote.address.toLowerCase() === address);
  if (storedVotes.length === 0) return;

  const { criteria: allCriteria } = await loadDirectoryVoteCriteria();
  const criteriaByContestId = new Map(allCriteria.map((criteria) => [criteria.contestId, criteria]));
  const headBlocks = new Map<number, Promise<bigint>>();

  for (const storedVote of storedVotes) {
    try {
      const criteria = criteriaByContestId.get(storedVote.contestId);
      // A retired contest or a regenerated manifest (new topic) cannot count the old vote. Skip it
      // rather than delete it: an offline start falls back to an older vendored manifest.
      if (!criteria || (await topicFor(criteria)) !== storedVote.topic) continue;

      const chain = getVotingChainClient({ chainId: criteria.bucketChainId });
      if (!chain) continue;
      let headBlock = headBlocks.get(criteria.bucketChainId);
      if (!headBlock) {
        headBlock = chain.getBlockNumber();
        headBlocks.set(criteria.bucketChainId, headBlock);
      }
      if (!isDirectoryVoteRefreshDue(criteria, storedVote.blockNumber, Number(await headBlock), storedVote.resignNextBucket)) continue;

      const key = getDirectoryVoteKey(storedVote.address, storedVote.contestId);
      await withDirectoryVoteLock(key, async () => {
        // The user may have changed or withdrawn this vote while the checks above awaited.
        if (useDirectoryVotesStore.getState().votes[key] !== storedVote) return;
        const voter = getOrCreateBrowserPubsubVoter({ helia, nameResolvers });
        // A record without a community is a withdrawal that still had to win against a same-bucket vote.
        const result = await publishDirectoryVote({ voter, criteria, signer: voteSigner.signer, address: voteSigner.address, community: storedVote.community });
        // An ineligible wallet (expired Pass) keeps its intent, so the vote resumes after a renewal.
        if (result.status !== 'published') return;
        const { address, contestId, community } = storedVote;
        if (community) useDirectoryVotesStore.getState().setVote({ address, contestId, topic: result.topic, community, blockNumber: result.blockNumber });
        else useDirectoryVotesStore.getState().removeVote(address, contestId);
      });
    } catch (error) {
      console.warn(`Failed to refresh directory vote for '${storedVote.contestId}'`, error);
    }
  }
};

/** Keeps the account's directory votes alive while 5chan is open: on start, on refocus, and hourly. */
export const useDirectoryVoteRefresh = () => {
  const account = useAccount();
  const voteSigner = getAccountVoteSigner(account);
  const helia = getBrowserHeliaNode(account);
  const nameResolvers = getBrowserNameResolvers(account);

  useEffect(() => {
    if (!voteSigner || !helia) return;

    let running = false;
    const run = () => {
      if (running) return;
      running = true;
      refreshDueDirectoryVotes({ voteSigner, helia, nameResolvers })
        .catch((error) => console.warn('Failed to refresh directory votes', error))
        .finally(() => {
          running = false;
        });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') run();
    };

    run();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const intervalId = window.setInterval(run, REFRESH_CHECK_INTERVAL_MS);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [voteSigner, helia, nameResolvers]);
};
