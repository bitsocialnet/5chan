import { describe, expect, it, vi } from 'vitest';
import type { Criteria } from '@bitsocial/pubsub-voting';
import { nextDirectoryVoteRecord } from '../use-directory-vote';

vi.mock('@bitsocial/bitsocial-react-hooks', () => ({ useAccount: () => undefined }));

const criteria = { contestId: '5chan-dir-a-vote-test-1', blocksPerBucket: 1800, voteExpiryBuckets: 720 } as Criteria;
const base = { address: '0xabc', contestId: criteria.contestId, topic: 'topic-a' };
const board = { name: 'board.bso', publicKey: '12D3KooWBoard' };
const other = { name: 'other.bso', publicKey: '12D3KooWOther' };

describe('nextDirectoryVoteRecord', () => {
  it('stores a first vote without a re-sign flag', () => {
    expect(nextDirectoryVoteRecord(undefined, { ...base, community: board, blockNumber: 1800 }, criteria)).toEqual({ ...base, community: board, blockNumber: 1800 });
  });

  it('flags a board switch in the same bucket so it is re-signed in the next one', () => {
    const previous = { ...base, community: board, blockNumber: 1800 };

    expect(nextDirectoryVoteRecord(previous, { ...base, community: other, blockNumber: 1800 }, criteria)).toEqual({
      ...base,
      community: other,
      blockNumber: 1800,
      resignNextBucket: true,
    });
    expect(nextDirectoryVoteRecord(previous, { ...base, community: other, blockNumber: 3600 }, criteria)).toEqual({ ...base, community: other, blockNumber: 3600 });
  });

  it('keeps a same-bucket withdrawal pending and drops a later-bucket withdrawal', () => {
    const previous = { ...base, community: board, blockNumber: 1800 };

    expect(nextDirectoryVoteRecord(previous, { ...base, community: undefined, blockNumber: 1800 }, criteria)).toEqual({
      ...base,
      community: undefined,
      blockNumber: 1800,
      resignNextBucket: true,
    });
    expect(nextDirectoryVoteRecord(previous, { ...base, community: undefined, blockNumber: 3600 }, criteria)).toBeUndefined();
  });

  it('ignores a previous ballot on an older manifest topic', () => {
    const previous = { ...base, topic: 'old-topic', community: board, blockNumber: 1800 };

    expect(nextDirectoryVoteRecord(previous, { ...base, community: undefined, blockNumber: 1800 }, criteria)).toBeUndefined();
  });
});
