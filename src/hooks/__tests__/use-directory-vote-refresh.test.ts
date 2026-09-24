import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Criteria, PubsubVoterOptions } from '@bitsocial/pubsub-voting';
import type { AccountVoteSigner } from '../../lib/directory-vote-signer';
import useDirectoryVotesStore from '../../stores/use-directory-votes-store';
import { refreshDueDirectoryVotes } from '../use-directory-vote-refresh';

const mocks = vi.hoisted(() => ({
  criteria: [] as Criteria[],
  headBlock: BigInt(0),
  loadDirectoryVoteCriteria: vi.fn(),
  publishDirectoryVote: vi.fn(),
  topics: {} as Record<string, string>,
}));

vi.mock('@bitsocial/bitsocial-react-hooks', () => ({ useAccount: () => undefined }));

vi.mock('@bitsocial/pubsub-voting', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@bitsocial/pubsub-voting')>()),
  topicFor: (criteria: Criteria) => Promise.resolve(mocks.topics[criteria.contestId]),
}));

vi.mock('../../lib/directory-vote-criteria', () => ({
  loadDirectoryVoteCriteria: (...args: unknown[]) => {
    mocks.loadDirectoryVoteCriteria(...args);
    return Promise.resolve({ criteria: mocks.criteria });
  },
}));

vi.mock('../../lib/directory-vote-publishing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/directory-vote-publishing')>()),
  publishDirectoryVote: (...args: unknown[]) => mocks.publishDirectoryVote(...args),
}));

vi.mock('../../lib/pubsub-voter', () => ({
  getOrCreateBrowserPubsubVoter: () => ({ voter: true }),
  getVotingChainClient: () => ({ getBlockNumber: () => Promise.resolve(mocks.headBlock) }),
}));

const voteSigner = { address: '0xAbC', signer: { address: () => '0xAbC', signBallot: vi.fn() } } as unknown as AccountVoteSigner;
const helia = {} as PubsubVoterOptions['helia'];
const criteria = { contestId: '5chan-dir-a-vote-test-1', bucketChainId: 84532, blocksPerBucket: 1800, voteExpiryBuckets: 720 } as Criteria;
const storedVote = { address: '0xabc', contestId: criteria.contestId, topic: 'topic-a', community: { name: 'board.bso', publicKey: '12D3KooWBoard' }, blockNumber: 1800 };

describe('refreshDueDirectoryVotes', () => {
  beforeEach(() => {
    mocks.criteria = [criteria];
    mocks.headBlock = BigInt(0);
    mocks.topics = { [criteria.contestId]: 'topic-a' };
    mocks.loadDirectoryVoteCriteria.mockClear();
    mocks.publishDirectoryVote.mockReset();
    mocks.publishDirectoryVote.mockResolvedValue({ status: 'published', topic: 'topic-a', blockNumber: 999_000 });
    useDirectoryVotesStore.setState({ votes: {} });
  });

  it('does nothing for a wallet without stored votes', async () => {
    await refreshDueDirectoryVotes({ voteSigner, helia, nameResolvers: undefined });

    expect(mocks.loadDirectoryVoteCriteria).not.toHaveBeenCalled();
  });

  it('re-signs a due vote and records the new block', async () => {
    useDirectoryVotesStore.getState().setVote(storedVote);
    mocks.headBlock = BigInt(361 * 1800);

    await refreshDueDirectoryVotes({ voteSigner, helia, nameResolvers: undefined });

    expect(mocks.publishDirectoryVote).toHaveBeenCalledWith(expect.objectContaining({ criteria, address: '0xAbC', community: storedVote.community }));
    expect(Object.values(useDirectoryVotesStore.getState().votes)).toEqual([{ ...storedVote, blockNumber: 999_000 }]);
  });

  it('leaves a vote alone until half its expiry window has passed', async () => {
    useDirectoryVotesStore.getState().setVote(storedVote);
    mocks.headBlock = BigInt(360 * 1800);

    await refreshDueDirectoryVotes({ voteSigner, helia, nameResolvers: undefined });

    expect(mocks.publishDirectoryVote).not.toHaveBeenCalled();
  });

  it('does not republish or restore a vote the user changed while the refresh was checking', async () => {
    useDirectoryVotesStore.getState().setVote(storedVote);
    const changedVote = { ...storedVote, community: { name: 'other.bso', publicKey: '12D3KooWOther' }, blockNumber: 500 * 1800 };
    mocks.headBlock = BigInt(361 * 1800);
    mocks.topics = {};
    Object.defineProperty(mocks.topics, criteria.contestId, {
      get: () => {
        useDirectoryVotesStore.getState().setVote(changedVote);
        return 'topic-a';
      },
    });

    await refreshDueDirectoryVotes({ voteSigner, helia, nameResolvers: undefined });

    expect(mocks.publishDirectoryVote).not.toHaveBeenCalled();
    expect(Object.values(useDirectoryVotesStore.getState().votes)).toEqual([changedVote]);
  });

  it('re-signs a same-bucket change as soon as the next bucket starts', async () => {
    useDirectoryVotesStore.getState().setVote({ ...storedVote, resignNextBucket: true });
    mocks.headBlock = BigInt(1800 + 1799);
    await refreshDueDirectoryVotes({ voteSigner, helia, nameResolvers: undefined });
    expect(mocks.publishDirectoryVote).not.toHaveBeenCalled();

    mocks.headBlock = BigInt(2 * 1800);
    await refreshDueDirectoryVotes({ voteSigner, helia, nameResolvers: undefined });

    expect(mocks.publishDirectoryVote).toHaveBeenCalledTimes(1);
    expect(Object.values(useDirectoryVotesStore.getState().votes)).toEqual([{ ...storedVote, blockNumber: 999_000 }]);
  });

  it('re-signs a pending same-bucket withdrawal with an empty ballot, then forgets it', async () => {
    useDirectoryVotesStore.getState().setVote({ ...storedVote, community: undefined, resignNextBucket: true });
    mocks.headBlock = BigInt(2 * 1800);

    await refreshDueDirectoryVotes({ voteSigner, helia, nameResolvers: undefined });

    expect(mocks.publishDirectoryVote).toHaveBeenCalledWith(expect.objectContaining({ community: undefined }));
    expect(useDirectoryVotesStore.getState().votes).toEqual({});
  });

  it('skips, but keeps, a vote whose contest topic changed', async () => {
    useDirectoryVotesStore.getState().setVote(storedVote);
    mocks.headBlock = BigInt(10_000 * 1800);
    mocks.topics = { [criteria.contestId]: 'topic-b' };

    await refreshDueDirectoryVotes({ voteSigner, helia, nameResolvers: undefined });

    expect(mocks.publishDirectoryVote).not.toHaveBeenCalled();
    expect(Object.values(useDirectoryVotesStore.getState().votes)).toEqual([storedVote]);
  });
});
