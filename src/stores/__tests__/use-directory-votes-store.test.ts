import { beforeEach, describe, expect, it, vi } from 'vitest';
import useDirectoryVotesStore, { type StoredDirectoryVote } from '../use-directory-votes-store';

const STORAGE_KEY = 'directory-votes';
const vote = (contestId: string): StoredDirectoryVote => ({ address: '0xabc', contestId, topic: 'topic', community: { publicKey: '12D3KooWBoard' }, blockNumber: 1800 });
const storedKeys = () => Object.keys(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').state.votes);

describe('useDirectoryVotesStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useDirectoryVotesStore.setState({ votes: {} });
  });

  it('keeps a vote another tab saved when this tab writes next', async () => {
    useDirectoryVotesStore.getState().setVote(vote('a'));
    // Another tab, loaded with the same votes, casts one more and saves.
    const otherTab = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    otherTab.state.votes['0xabc:b'] = vote('b');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(otherTab));
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    await vi.waitFor(() => expect(useDirectoryVotesStore.getState().votes).toHaveProperty(['0xabc:b']));

    useDirectoryVotesStore.getState().removeVote('0xabc', 'a');

    expect(storedKeys()).toEqual(['0xabc:b']);
  });

  it('keeps the same object for a vote another tab saved unchanged', async () => {
    useDirectoryVotesStore.getState().setVote(vote('a'));
    useDirectoryVotesStore.getState().setVote(vote('b'));
    const keptVote = useDirectoryVotesStore.getState().votes['0xabc:a'];
    const otherTab = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    otherTab.state.votes['0xabc:b'] = { ...vote('b'), blockNumber: 3600 };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(otherTab));
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
    await vi.waitFor(() => expect(useDirectoryVotesStore.getState().votes['0xabc:b'].blockNumber).toBe(3600));

    expect(useDirectoryVotesStore.getState().votes['0xabc:a']).toBe(keptVote);
  });

  it('ignores saves to other storage keys', () => {
    useDirectoryVotesStore.getState().setVote(vote('a'));
    const before = useDirectoryVotesStore.getState().votes;

    window.dispatchEvent(new StorageEvent('storage', { key: 'something-else' }));

    expect(useDirectoryVotesStore.getState().votes).toBe(before);
  });
});
