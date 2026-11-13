import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { communitiesStore } from '../../lib/bitsocial-internals/stores';
import { __resetDirectoryVoteVisitsForTests, getDirectoryVoteVisits } from '../../lib/directory-vote-visits';
import useDirectoryVotesStore from '../../stores/use-directory-votes-store';
import { useDirectoryVoteVisits } from '../use-directory-vote-visits';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (callback: () => void) => void }).act as (callback: () => void) => void;

vi.mock('../use-directories', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../use-directories')>()),
  useDirectories: () => [{ address: 'incumbent.bso', directoryCode: 'a', title: '/a/ - Anime & Manga' }],
}));

const vote = {
  address: '0xabc',
  contestId: '5chan-dir-a-vote-test-1',
  topic: 'topic-a',
  community: { name: 'challenger.bso', publicKey: '12D3KooWChallenger' },
  blockNumber: 1800,
};

describe('useDirectoryVoteVisits', () => {
  let root: Root;
  let now: number;

  beforeEach(() => {
    now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    useDirectoryVotesStore.setState({ votes: {} });
    communitiesStore.setState({ communities: {} });
    __resetDirectoryVoteVisitsForTests();
    root = createRoot(document.createElement('div'));
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.restoreAllMocks();
  });

  const mount = (boardIdentifier: string) => {
    const Harness = () => {
      useDirectoryVoteVisits(boardIdentifier);
      return null;
    };
    act(() => root.render(createElement(Harness)));
  };

  it("records a visit to the directory's own route, and again when the tab comes back into view", () => {
    useDirectoryVotesStore.getState().setVote(vote);
    mount('a');
    expect(getDirectoryVoteVisits()).toEqual({ a: 1_000 });

    now = 2_000;
    act(() => document.dispatchEvent(new Event('visibilitychange')));

    expect(getDirectoryVoteVisits()).toEqual({ a: 2_000 });
  });

  it('records a visit to the board voted for, outside its directory route', () => {
    useDirectoryVotesStore.getState().setVote(vote);
    mount('challenger.bso');

    expect(getDirectoryVoteVisits()).toEqual({ a: 1_000 });
  });

  it('records a visit to a board voted for by public key alone, browsed by name, once its record loads', () => {
    useDirectoryVotesStore.getState().setVote({ ...vote, community: { publicKey: '12D3KooWUnlisted' } });
    mount('unlisted.bso');
    expect(getDirectoryVoteVisits()).toEqual({});

    act(() =>
      communitiesStore.setState({
        communities: { 'unlisted.bso': { address: 'unlisted.bso', name: 'unlisted.bso', publicKey: '12D3KooWUnlisted' } },
      }),
    );

    expect(getDirectoryVoteVisits()).toEqual({ a: 1_000 });
  });

  it('records nothing in a directory the user does not vote in', () => {
    mount('a');

    expect(getDirectoryVoteVisits()).toEqual({});
  });

  it('does not count a background refresh of the vote as a visit', () => {
    useDirectoryVotesStore.getState().setVote(vote);
    mount('a');

    now = 2_000;
    act(() => useDirectoryVotesStore.getState().setVote({ ...vote, blockNumber: 362 * 1800, refreshedAt: 2_000 }));

    expect(getDirectoryVoteVisits()).toEqual({ a: 1_000 });
  });
});
