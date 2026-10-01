import { beforeEach, describe, expect, it } from 'vitest';
import usePinnedCatalogThreadsStore, { getPinnedThreadNewReplyCount } from '../use-pinned-catalog-threads-store';

const getState = () => usePinnedCatalogThreadsStore.getState();

describe('usePinnedCatalogThreadsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    usePinnedCatalogThreadsStore.setState({ pinnedThreads: {} });
  });

  it('pins a thread at its current reply count and keeps it across reloads', () => {
    getState().pinThread({ cid: 'thread-1', communityAddress: 'music-posting.eth', replyCount: 12 });

    expect(getState().pinnedThreads).toEqual({ 'thread-1': { communityAddress: 'music-posting.eth', readReplyCount: 12 } });
    expect(JSON.parse(localStorage.getItem('pinned-catalog-threads-store') ?? '{}').state.pinnedThreads).toEqual(getState().pinnedThreads);
  });

  it('counts replies since the thread was pinned or last read', () => {
    getState().pinThread({ cid: 'thread-1', communityAddress: 'music-posting.eth', replyCount: 12 });
    expect(getPinnedThreadNewReplyCount(getState().pinnedThreads['thread-1'], 15)).toBe(3);

    getState().markThreadRead('thread-1', 15);
    expect(getPinnedThreadNewReplyCount(getState().pinnedThreads['thread-1'], 15)).toBe(0);
    // Purged replies can lower the count below what was read.
    expect(getPinnedThreadNewReplyCount(getState().pinnedThreads['thread-1'], 14)).toBe(0);
  });

  it('ignores reads of threads that are not pinned and unpins on request', () => {
    getState().markThreadRead('thread-2', 4);
    expect(getState().pinnedThreads).toEqual({});

    getState().pinThread({ cid: 'thread-1', communityAddress: 'music-posting.eth' });
    expect(getState().pinnedThreads['thread-1'].readReplyCount).toBe(0);
    getState().unpinThread('thread-1');
    expect(getState().pinnedThreads).toEqual({});
  });
});
