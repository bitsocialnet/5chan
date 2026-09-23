import { useState } from 'react';
import { useAccount } from '@bitsocial/bitsocial-react-hooks';
import { getAccountVoteSigner } from '../lib/directory-vote-signer';
import { publishDirectoryVote, resolveDirectoryBoard, withDirectoryVoteLock, type DirectoryVoteTarget } from '../lib/directory-vote-publishing';
import { getOrCreateBrowserPubsubVoter, isTestnetVotingChain } from '../lib/pubsub-voter';
import useDirectoryVotesStore, { getDirectoryVoteKey, type DirectoryVoteCommunity } from '../stores/use-directory-votes-store';
import { getBrowserHeliaNode, getBrowserNameResolvers } from './use-pubsub-voter';
import type { VoteTallyState } from './use-vote-tally';

export type DirectoryVoteOutcome =
  | { status: 'voted' }
  | { status: 'withdrawn' }
  | { status: 'unavailable' }
  | { status: 'board-not-found' }
  | { status: 'ineligible'; address: string; error: string; testnet: boolean }
  | { status: 'failed'; error: Error };

/**
 * The ballot being resolved, signed, and broadcast: from a directory row (keyed by its public key,
 * or its address when the list has no key) or from the submit form.
 */
export type PendingDirectoryVote = { source: 'row'; key: string } | { source: 'form' };

export interface DirectoryVoteState {
  /** The board this account's voting wallet currently votes for in this directory. */
  votedCommunity?: DirectoryVoteCommunity;
  pendingVote?: PendingDirectoryVote;
  /** Vote for a board, or withdraw when it is already this account's vote. */
  toggleVote: (target: DirectoryVoteTarget) => Promise<DirectoryVoteOutcome>;
  /** Resolve a board address, then vote for it; covers typed submissions and listed boards without a key. */
  voteForAddress: (address: string, pending?: PendingDirectoryVote) => Promise<DirectoryVoteOutcome>;
}

const asError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

export const useDirectoryVote = (voteTally: VoteTallyState): DirectoryVoteState => {
  const account = useAccount();
  const voteSigner = getAccountVoteSigner(account);
  const helia = getBrowserHeliaNode(account);
  const nameResolvers = getBrowserNameResolvers(account);
  const { criteria, contest } = voteTally;
  const storedVote = useDirectoryVotesStore((state) => (voteSigner && criteria ? state.votes[getDirectoryVoteKey(voteSigner.address, criteria.contestId)] : undefined));
  const setVote = useDirectoryVotesStore((state) => state.setVote);
  const removeVote = useDirectoryVotesStore((state) => state.removeVote);
  const [pendingVote, setPendingVote] = useState<PendingDirectoryVote>();

  // A vote stored for an older manifest revision lives on a dead topic, so it is not this contest's vote.
  const votedCommunity = storedVote && contest && storedVote.topic === contest.topic ? storedVote.community : undefined;

  const publish = async (target: DirectoryVoteTarget | undefined, pending: PendingDirectoryVote): Promise<DirectoryVoteOutcome> => {
    if (!criteria || !voteSigner || !helia) return { status: 'unavailable' };

    setPendingVote(pending);
    try {
      const voter = getOrCreateBrowserPubsubVoter({ helia, nameResolvers });
      const lockKey = getDirectoryVoteKey(voteSigner.address, criteria.contestId);
      return await withDirectoryVoteLock(lockKey, async (): Promise<DirectoryVoteOutcome> => {
        const result = await publishDirectoryVote({ voter, criteria, signer: voteSigner.signer, address: voteSigner.address, community: target });
        if (result.status === 'ineligible') {
          return { status: 'ineligible', address: voteSigner.address, error: result.error, testnet: isTestnetVotingChain(criteria.bucketChainId) };
        }
        if (!target) {
          removeVote(voteSigner.address, criteria.contestId);
          return { status: 'withdrawn' };
        }
        setVote({ address: voteSigner.address, contestId: criteria.contestId, topic: result.topic, community: target, blockNumber: result.blockNumber });
        return { status: 'voted' };
      });
    } catch (error) {
      console.error(`Failed to publish directory vote for '${criteria.contestId}'`, error);
      return { status: 'failed', error: asError(error) };
    } finally {
      setPendingVote(undefined);
    }
  };

  const toggleVote = (target: DirectoryVoteTarget) =>
    publish(target.publicKey === votedCommunity?.publicKey ? undefined : target, { source: 'row', key: target.publicKey });

  const voteForAddress = async (address: string, pending: PendingDirectoryVote = { source: 'form' }): Promise<DirectoryVoteOutcome> => {
    if (!criteria || !voteSigner || !helia) return { status: 'unavailable' };

    setPendingVote(pending);
    let resolution: Awaited<ReturnType<typeof resolveDirectoryBoard>>;
    try {
      resolution = await resolveDirectoryBoard(address, nameResolvers);
    } catch (error) {
      setPendingVote(undefined);
      return { status: 'failed', error: asError(error) };
    }
    if (resolution.status !== 'resolved') {
      setPendingVote(undefined);
      return { status: 'board-not-found' };
    }
    return publish(resolution.target, pending);
  };

  return { votedCommunity, pendingVote, toggleVote, voteForAddress };
};
