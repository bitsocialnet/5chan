import { describe, expect, it } from 'vitest';
import { getVisitedDirectoryCodes, isDirectoryVoteEngaged } from '../directory-vote-engagement';

const voteInA = { contestId: '5chan-dir-a-vote-test-1', community: { name: 'challenger.bso', publicKey: '12D3KooWChallenger' } };
const voteInB = { contestId: '5chan-dir-b-vote-test-1', community: { publicKey: '12D3KooWOther' } };

describe('getVisitedDirectoryCodes', () => {
  it('visits the directories the user votes in that the route belongs to', () => {
    expect(getVisitedDirectoryCodes('a', 'a', [voteInA, voteInB])).toEqual(['a']);
    expect(getVisitedDirectoryCodes('incumbent.bso', 'a', [voteInA, voteInB])).toEqual(['a']);
  });

  it('visits the directory of a vote for the board itself, by name, name alias, or public key', () => {
    expect(getVisitedDirectoryCodes('challenger.bso', undefined, [voteInA])).toEqual(['a']);
    expect(getVisitedDirectoryCodes('challenger.eth', undefined, [voteInA])).toEqual(['a']);
    expect(getVisitedDirectoryCodes('12D3KooWOther', undefined, [voteInA, voteInB])).toEqual(['b']);
  });

  it("visits the directory of a vote cast by public key alone when the board is browsed by name, once its record's key is known", () => {
    expect(getVisitedDirectoryCodes('other.bso', undefined, [voteInA, voteInB])).toEqual([]);
    expect(getVisitedDirectoryCodes('other.bso', undefined, [voteInA, voteInB], '12D3KooWOther')).toEqual(['b']);
  });

  it('visits nothing for a board unrelated to any vote, or a withdrawal still settling', () => {
    expect(getVisitedDirectoryCodes('elsewhere.bso', 'c', [voteInA, voteInB])).toEqual([]);
    expect(getVisitedDirectoryCodes('challenger.bso', undefined, [{ contestId: voteInA.contestId }])).toEqual([]);
  });
});

describe('isDirectoryVoteEngaged', () => {
  it('counts a vote the user cast since the last refresh', () => {
    expect(isDirectoryVoteEngaged(voteInA, {})).toBe(true);
  });

  it('counts a refreshed vote only after a later visit to its directory', () => {
    const refreshed = { ...voteInA, refreshedAt: 1_000 };

    expect(isDirectoryVoteEngaged(refreshed, {})).toBe(false);
    expect(isDirectoryVoteEngaged(refreshed, { a: 1_000 })).toBe(false);
    expect(isDirectoryVoteEngaged(refreshed, { b: 2_000 })).toBe(false);
    expect(isDirectoryVoteEngaged(refreshed, { a: 1_001 })).toBe(true);
  });
});
