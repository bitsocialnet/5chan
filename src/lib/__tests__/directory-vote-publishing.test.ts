import { describe, expect, it, vi } from 'vitest';
import type { Criteria, NameResolver, PubsubVoter, VoteSigner } from '@bitsocial/pubsub-voting';
import { isDirectoryVoteRefreshDue, publishDirectoryVote, resolveDirectoryBoard, withDirectoryVoteLock } from '../directory-vote-publishing';

const PUBLIC_KEY = '12D3KooWR7nTdKZqZ1twGWMfVsXYDGp1XAKUrnYznKP651jFrizE';
const criteria = { contestId: '5chan-dir-a-vote-test-1', blocksPerBucket: 1800, voteExpiryBuckets: 720 } as Criteria;
const signer = { address: () => '0xabc', signBallot: vi.fn() } as VoteSigner;

const createVoter = (eligible: boolean) => {
  const publish = vi.fn(() => Promise.resolve({ bundle: { blockNumber: 3600 } }));
  const createContestVote = vi.fn(() => Promise.resolve({ publish }));
  const checkEligibility = vi.fn(() => Promise.resolve(eligible ? { eligible: true } : { eligible: false, error: 'this wallet holds none of the gate token' }));
  const voter = { createContest: vi.fn(() => Promise.resolve({ topic: 'bitsocial-votes/topic', checkEligibility })), createContestVote } as unknown as PubsubVoter;
  return { voter, createContestVote, checkEligibility, publish };
};

const createResolver = (records: Record<string, string>): NameResolver => ({
  key: 'bso-test',
  provider: 'test',
  canResolve: ({ name }) => name.endsWith('.bso'),
  resolve: vi.fn(({ name }: { name: string }) => Promise.resolve(records[name] ? { publicKey: records[name] } : undefined)),
});

describe('publishDirectoryVote', () => {
  it('checks eligibility, then publishes one upvote and reports its topic and block', async () => {
    const { voter, createContestVote, checkEligibility } = createVoter(true);
    const community = { name: 'board.bso', publicKey: PUBLIC_KEY };

    await expect(publishDirectoryVote({ voter, criteria, signer, address: '0xabc', community })).resolves.toEqual({
      status: 'published',
      topic: 'bitsocial-votes/topic',
      blockNumber: 3600,
    });
    expect(checkEligibility).toHaveBeenCalledWith({ address: '0xabc' });
    expect(createContestVote).toHaveBeenCalledWith({ criteria, votes: [{ community, vote: 1 }], signer });
  });

  it('does not publish for a wallet without the Pass', async () => {
    const { voter, publish } = createVoter(false);

    await expect(publishDirectoryVote({ voter, criteria, signer, address: '0xabc', community: { publicKey: PUBLIC_KEY } })).resolves.toEqual({
      status: 'ineligible',
      error: 'this wallet holds none of the gate token',
    });
    expect(publish).not.toHaveBeenCalled();
  });

  it('withdraws with an empty ballot without an eligibility read', async () => {
    const { voter, createContestVote, checkEligibility } = createVoter(false);

    await expect(publishDirectoryVote({ voter, criteria, signer, address: '0xabc', community: undefined })).resolves.toMatchObject({ status: 'published' });
    expect(checkEligibility).not.toHaveBeenCalled();
    expect(createContestVote).toHaveBeenCalledWith({ criteria, votes: [], signer });
  });
});

describe('withDirectoryVoteLock', () => {
  it('runs operations for one wallet and contest in order, even after a failure', async () => {
    const events: string[] = [];
    let releaseFirst!: () => void;
    const first = withDirectoryVoteLock('0xabc:contest', async () => {
      events.push('first:start');
      await new Promise<void>((resolve) => (releaseFirst = resolve));
      events.push('first:end');
      throw new Error('first failed');
    });
    const second = withDirectoryVoteLock('0xabc:contest', async () => {
      events.push('second');
      return 2;
    });
    const other = withDirectoryVoteLock('0xabc:other', async () => {
      events.push('other');
    });

    await other;
    expect(events).toEqual(['first:start', 'other']);
    releaseFirst();
    await expect(first).rejects.toThrow('first failed');
    await expect(second).resolves.toBe(2);
    expect(events).toEqual(['first:start', 'other', 'first:end', 'second']);
  });
});

describe('isDirectoryVoteRefreshDue', () => {
  it('is due once half of the expiry window has passed, counted in buckets', () => {
    const signedAt = 10 * 1800 + 5;

    expect(isDirectoryVoteRefreshDue(criteria, signedAt, (10 + 359) * 1800 + 1799)).toBe(false);
    expect(isDirectoryVoteRefreshDue(criteria, signedAt, (10 + 360) * 1800)).toBe(true);
  });
});

describe('resolveDirectoryBoard', () => {
  it('resolves a typed .bso address, ignoring slashes and case', async () => {
    const resolvers = [createResolver({ 'board.bso': PUBLIC_KEY })];

    await expect(resolveDirectoryBoard(' /Board.bso/ ', resolvers)).resolves.toEqual({ status: 'resolved', target: { name: 'board.bso', publicKey: PUBLIC_KEY } });
  });

  it('accepts a raw public key without resolving it', async () => {
    await expect(resolveDirectoryBoard(PUBLIC_KEY, undefined)).resolves.toEqual({ status: 'resolved', target: { publicKey: PUBLIC_KEY } });
  });

  it('rejects unknown names, unsupported TLDs, and malformed keys', async () => {
    const resolvers = [createResolver({})];

    await expect(resolveDirectoryBoard('missing.bso', resolvers)).resolves.toEqual({ status: 'not-found' });
    await expect(resolveDirectoryBoard('board.eth', resolvers)).resolves.toEqual({ status: 'invalid' });
    await expect(resolveDirectoryBoard('not-a-key', resolvers)).resolves.toEqual({ status: 'invalid' });
    await expect(resolveDirectoryBoard('   ', resolvers)).resolves.toEqual({ status: 'invalid' });
  });
});
