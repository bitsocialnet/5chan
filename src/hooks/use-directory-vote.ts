import { useEffect, useRef, useState } from 'react';
import { useAccount } from '@bitsocial/bitsocial-react-hooks';
import { topicFor, type Criteria, type NameResolver, type PubsubVoterOptions } from '@bitsocial/pubsub-voting';
import { loadDirectoryVoteCriteria } from '../lib/directory-vote-criteria';
import { getAccountVoteSigner, type AccountVoteSigner } from '../lib/directory-vote-signer';
import { getUnmetDirectoryBoardRequirements, type DirectoryBoardRecord, type DirectoryBoardRequirement } from '../lib/directory-board-requirements';
import {
  isDirectoryVoteRefreshDue,
  isSameDirectoryVoteBucket,
  publishDirectoryVote,
  resolveDirectoryBoard,
  withDirectoryVoteLock,
  type DirectoryVoteTarget,
} from '../lib/directory-vote-publishing';
import { getOrCreateBrowserPubsubVoter, getVotingChainClient, isTestnetVotingChain } from '../lib/pubsub-voter';
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

/** Refreshes the votes of the account's built-in wallet, which is derived from its private key here, not in the caller. */
export const refreshAccountDirectoryVotes = async ({ privateKey, ...options }: Omit<RefreshOptions, 'voteSigner'> & { privateKey: string }): Promise<void> => {
  const voteSigner = getAccountVoteSigner({ signer: { privateKey } });
  if (voteSigner) await refreshDueDirectoryVotes({ voteSigner, ...options });
};
