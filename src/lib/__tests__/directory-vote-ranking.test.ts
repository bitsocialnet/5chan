import { describe, expect, it } from 'vitest';
import type { ContestTally } from '@bitsocial/pubsub-voting';
import { rankDirectoryBoardsByVoteTally } from '../directory-vote-ranking';

const boards = [
  { address: 'manual-winner.bso', publicKey: '12D3KooWManual', score: 100, addedAt: 2 },
  { address: 'vote-winner.bso', publicKey: '12D3KooWVote', score: 1, addedAt: 1 },
  { address: 'no-votes.bso', publicKey: '12D3KooWNone', score: 50, addedAt: 3 },
];

describe('rankDirectoryBoardsByVoteTally', () => {
  it('keeps static list ranking while no live tally is available', () => {
    const ranked = rankDirectoryBoardsByVoteTally(boards, undefined);

    expect(ranked.map(({ board }) => board.address)).toEqual(['manual-winner.bso', 'no-votes.bso', 'vote-winner.bso']);
    expect(ranked.every(({ weight }) => weight === undefined)).toBe(true);
  });

  it('matches by public key and makes bigint vote weight authoritative', () => {
    const tally: ContestTally = {
      contestId: '5chan-dir-a-vote-test-1',
      ranking: [
        { community: { name: 'untrusted-alias.bso', publicKey: '12D3KooWVote' }, weight: BigInt(9), chainVerified: false, nameResolved: false },
        { community: { name: 'not-allowlisted.bso', publicKey: '12D3KooWOther' }, weight: BigInt(99), chainVerified: true, nameResolved: true },
        { community: { name: 'manual-winner.bso', publicKey: '12D3KooWManual' }, weight: BigInt(2), chainVerified: true, nameResolved: true },
      ],
    };

    const ranked = rankDirectoryBoardsByVoteTally(boards, tally);

    expect(ranked.map(({ board, weight }) => [board.address, weight?.toString()])).toEqual([
      ['not-allowlisted.bso', '99'],
      ['vote-winner.bso', '9'],
      ['manual-winner.bso', '2'],
      ['no-votes.bso', '0'],
    ]);
    expect(ranked[0]).toMatchObject({ nominated: true, board: { publicKey: '12D3KooWOther' } });
    expect(ranked[1]).toMatchObject({ chainVerified: false, nameResolved: false });
    expect(ranked[3]).toMatchObject({ chainVerified: true, weight: BigInt(0) });
  });

  it('uses the static non-score tie breakers when live weights match', () => {
    const tally: ContestTally = {
      contestId: '5chan-dir-a-vote-test-1',
      ranking: boards.map((board) => ({ community: { publicKey: board.publicKey }, weight: BigInt(1), chainVerified: true })),
    };

    expect(rankDirectoryBoardsByVoteTally(boards, tally).map(({ board }) => board.address)).toEqual(['vote-winner.bso', 'manual-winner.bso', 'no-votes.bso']);
  });

  it('appends voted boards missing from the list as nominations, hiding failed names', () => {
    const tally: ContestTally = {
      contestId: '5chan-dir-a-vote-test-1',
      ranking: [
        { community: { name: 'nominee.bso', publicKey: '12D3KooWNominee' }, weight: BigInt(3), chainVerified: true, nameResolved: undefined },
        { community: { publicKey: '12D3KooWKeyOnly' }, weight: BigInt(1), chainVerified: false },
        { community: { name: 'squatted.bso', publicKey: '12D3KooWSquat' }, weight: BigInt(5), chainVerified: true, nameResolved: false },
        { community: { name: 'zero.bso', publicKey: '12D3KooWZero' }, weight: BigInt(0), chainVerified: true, nameResolved: true },
      ],
    };

    const ranked = rankDirectoryBoardsByVoteTally(boards, tally);

    expect(ranked.filter(({ nominated }) => nominated).map(({ board }) => board.address)).toEqual(['nominee.bso', '12D3KooWKeyOnly']);
    expect(ranked.map(({ board }) => board.address)).toEqual(['nominee.bso', '12D3KooWKeyOnly', 'vote-winner.bso', 'manual-winner.bso', 'no-votes.bso']);
  });

  it('keeps listed boards in file order and nominations last when votes must not reorder', () => {
    const tally: ContestTally = {
      contestId: '5chan-dir-a-vote-test-1',
      ranking: [
        { community: { name: 'nominee.bso', publicKey: '12D3KooWNominee' }, weight: BigInt(7), chainVerified: true, nameResolved: true },
        { community: { name: 'vote-winner.bso', publicKey: '12D3KooWVote' }, weight: BigInt(9), chainVerified: true, nameResolved: true },
      ],
    };

    const ranked = rankDirectoryBoardsByVoteTally(boards, tally, { orderByVotes: false });

    expect(ranked.map(({ board, weight }) => [board.address, weight?.toString()])).toEqual([
      ['manual-winner.bso', '0'],
      ['no-votes.bso', '0'],
      ['vote-winner.bso', '9'],
      ['nominee.bso', '7'],
    ]);
  });

  it('matches a listed board without a public key by its resolved name', () => {
    const tally: ContestTally = {
      contestId: '5chan-dir-a-vote-test-1',
      ranking: [{ community: { name: 'keyless.bso', publicKey: '12D3KooWKeyless' }, weight: BigInt(4), chainVerified: true, nameResolved: true }],
    };

    const ranked = rankDirectoryBoardsByVoteTally([...boards, { address: 'keyless.bso', addedAt: 4 }], tally);

    expect(ranked[0]).toMatchObject({ board: { address: 'keyless.bso' }, weight: BigInt(4) });
    expect(ranked.some(({ nominated }) => nominated)).toBe(false);
  });
});
