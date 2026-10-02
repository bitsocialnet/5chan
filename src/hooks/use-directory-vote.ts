import { useEffect, useRef, useState } from 'react';
import { useAccount } from '@bitsocial/bitsocial-react-hooks';
import type { Criteria } from '@bitsocial/pubsub-voting';
import { getAccountVoteSigner } from '../lib/directory-vote-signer';
import { getUnmetDirectoryBoardRequirements, type DirectoryBoardRecord, type DirectoryBoardRequirement } from '../lib/directory-board-requirements';
import {
  isSameDirectoryVoteBucket,
  publishDirectoryVote,
  resolveDirectoryBoard,
  withDirectoryVoteLock,
  type DirectoryVoteTarget,
} from '../lib/directory-vote-publishing';
import { getOrCreateBrowserPubsubVoter, isTestnetVotingChain } from '../lib/pubsub-voter';
import useDirectoryVotesStore, { getDirectoryVoteKey, type DirectoryVoteCommunity, type StoredDirectoryVote } from '../stores/use-directory-votes-store';
import { getBrowserHeliaNode, getBrowserNameResolvers } from './use-pubsub-voter';
import type { VoteTallyState } from './use-vote-tally';

export type DirectoryVoteOutcome =
  | { status: 'voted' }
  | { status: 'withdrawn' }
  | { status: 'unavailable' }
  | { status: 'board-not-found' }
  /** The board's record could not be loaded to check it against the directory's requirements. */
  | { status: 'board-unreachable' }
  | { status: 'board-ineligible'; unmet: DirectoryBoardRequirement[] }
  /** The directory was left while the board was resolving or its record loading, so nothing was published. */
  | { status: 'cancelled' }
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
  /** Resolve a board address, then vote for it; covers listed boards without a key. */
  voteForAddress: (address: string, pending?: PendingDirectoryVote) => Promise<DirectoryVoteOutcome>;
  /** Resolve a typed board address and vote for it only once its record meets the directory's requirements. */
  submitBoard: (address: string, requirements: DirectoryBoardRequirement[]) => Promise<DirectoryVoteOutcome>;
}

interface AccountWithPkc {
  pkc?: { getCommunity: (args: DirectoryVoteTarget & { abortSignal?: AbortSignal }) => Promise<DirectoryBoardRecord> };
}

// pkc-js keeps retrying an unreachable board for minutes, and the form and every vote button wait on it.
const REQUIREMENTS_CHECK_TIMEOUT_MS = 60_000;

const getAccountPkc = (account: unknown) => (account && typeof account === 'object' ? (account as AccountWithPkc).pkc : undefined);

const asError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

/**
 * The record to keep after a ballot is published; undefined removes it. A ballot that replaces
 * another in the same bucket may lose the lowest-CID tie-break, so it stays flagged (a withdrawal
 * included) until it is re-signed in a later bucket.
 */
export const nextDirectoryVoteRecord = (
  previous: StoredDirectoryVote | undefined,
  published: Omit<StoredDirectoryVote, 'resignNextBucket'>,
  criteria: Criteria,
): StoredDirectoryVote | undefined => {
  const replacedInSameBucket = !!previous && previous.topic === published.topic && isSameDirectoryVoteBucket(criteria, previous.blockNumber, published.blockNumber);
  if (!published.community && !replacedInSameBucket) return undefined;
  return replacedInSameBucket ? { ...published, resignNextBucket: true } : published;
};

export const useDirectoryVote = (voteTally: VoteTallyState): DirectoryVoteState => {
  const account = useAccount();
  const voteSigner = getAccountVoteSigner(account);
  const helia = getBrowserHeliaNode(account);
  const nameResolvers = getBrowserNameResolvers(account);
  const pkc = getAccountPkc(account);
  const { criteria, contest } = voteTally;
  const storedVote = useDirectoryVotesStore((state) => (voteSigner && criteria ? state.votes[getDirectoryVoteKey(voteSigner.address, criteria.contestId)] : undefined));
  const setVote = useDirectoryVotesStore((state) => state.setVote);
  const removeVote = useDirectoryVotesStore((state) => state.removeVote);
  const [pendingVote, setPendingVote] = useState<PendingDirectoryVote>();
  const directoryScopeRef = useRef<AbortController>(undefined);

  // Leaving the directory, or moving to another one, cancels a vote still resolving its board or
  // checking its record, so it is never published for a directory the user left.
  useEffect(() => {
    const scope = new AbortController();
    directoryScopeRef.current = scope;
    return () => scope.abort();
  }, [criteria?.contestId]);

  // A vote stored for an older manifest revision lives on a dead topic, so it is not this contest's vote.
  const votedCommunity = storedVote && contest && storedVote.topic === contest.topic ? storedVote.community : undefined;

  const publish = async (target: DirectoryVoteTarget | undefined, pending: PendingDirectoryVote): Promise<DirectoryVoteOutcome> => {
    if (!criteria || !voteSigner || !helia) return { status: 'unavailable' };

    setPendingVote(pending);
    try {
      const voter = getOrCreateBrowserPubsubVoter({ helia, nameResolvers });
      const lockKey = getDirectoryVoteKey(voteSigner.address, criteria.contestId);
      return await withDirectoryVoteLock(lockKey, async (): Promise<DirectoryVoteOutcome> => {
        const previous = useDirectoryVotesStore.getState().votes[lockKey];
        const result = await publishDirectoryVote({ voter, criteria, signer: voteSigner.signer, address: voteSigner.address, community: target });
        if (result.status === 'ineligible') {
          return { status: 'ineligible', address: voteSigner.address, error: result.error, testnet: isTestnetVotingChain(criteria.bucketChainId) };
        }
        const published = { address: voteSigner.address, contestId: criteria.contestId, topic: result.topic, community: target, blockNumber: result.blockNumber };
        const next = nextDirectoryVoteRecord(previous, published, criteria);
        if (next) setVote(next);
        else removeVote(voteSigner.address, criteria.contestId);
        return { status: target ? 'voted' : 'withdrawn' };
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

  const resolveAndVote = async (address: string, pending: PendingDirectoryVote, requirements?: DirectoryBoardRequirement[]): Promise<DirectoryVoteOutcome> => {
    if (!criteria || !voteSigner || !helia || (requirements && !pkc)) return { status: 'unavailable' };

    // Taken before the first await: the ref moves on to the next directory's scope.
    const scope = directoryScopeRef.current?.signal;
    setPendingVote(pending);
    let resolution: Awaited<ReturnType<typeof resolveDirectoryBoard>>;
    try {
      resolution = await resolveDirectoryBoard(address, nameResolvers);
    } catch (error) {
      setPendingVote(undefined);
      return { status: 'failed', error: asError(error) };
    }
    if (scope?.aborted) {
      setPendingVote(undefined);
      return { status: 'cancelled' };
    }
    if (resolution.status !== 'resolved') {
      setPendingVote(undefined);
      return { status: 'board-not-found' };
    }
    if (requirements && pkc) {
      const controller = new AbortController();
      const cancel = () => controller.abort();
      scope?.addEventListener('abort', cancel);
      const timeout = setTimeout(cancel, REQUIREMENTS_CHECK_TIMEOUT_MS);
      let record: DirectoryBoardRecord | undefined;
      try {
        record = await pkc.getCommunity({ ...resolution.target, abortSignal: controller.signal });
      } catch (error) {
        if (!scope?.aborted) console.warn(`Failed to load '${address}' to check the directory requirements`, error);
      } finally {
        clearTimeout(timeout);
        scope?.removeEventListener('abort', cancel);
      }
      if (scope?.aborted) {
        setPendingVote(undefined);
        return { status: 'cancelled' };
      }
      if (!record) {
        setPendingVote(undefined);
        return { status: 'board-unreachable' };
      }
      const unmet = getUnmetDirectoryBoardRequirements(requirements, record);
      if (unmet.length > 0) {
        setPendingVote(undefined);
        return { status: 'board-ineligible', unmet };
      }
    }
    return publish(resolution.target, pending);
  };

  const voteForAddress = (address: string, pending: PendingDirectoryVote = { source: 'form' }) => resolveAndVote(address, pending);

  const submitBoard = (address: string, requirements: DirectoryBoardRequirement[]) => resolveAndVote(address, { source: 'form' }, requirements);

  return { votedCommunity, pendingVote, toggleVote, voteForAddress, submitBoard };
};
