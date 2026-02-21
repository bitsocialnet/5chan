import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useFeedCacheStore from '../use-feed-cache-store';

describe('useFeedCacheStore', () => {
  beforeEach(() => {
    useFeedCacheStore.getState().clearFeeds();
  });

  afterEach(() => {
    useFeedCacheStore.getState().clearFeeds();
  });

  it('accessFeed adds entries', () => {
    const { accessFeed } = useFeedCacheStore.getState();

    accessFeed('plebbit/board', 'board');
    const afterFirst = useFeedCacheStore.getState().cachedFeeds;
    expect(afterFirst.length).toBe(1);
    expect(afterFirst[0].key).toBe('plebbit/board');
    expect(afterFirst[0].type).toBe('board');

    accessFeed('plebbit/catalog', 'catalog');
    const afterSecond = useFeedCacheStore.getState().cachedFeeds;
    expect(afterSecond.length).toBe(2);
    expect(afterSecond.some((f) => f.key === 'plebbit/catalog' && f.type === 'catalog')).toBe(true);
  });

  it('evicts least recently accessed when cache exceeds maxCacheSize (2)', () => {
    const { accessFeed, isFeedCached } = useFeedCacheStore.getState();
    vi.useFakeTimers();

    accessFeed('a', 'board');
    vi.advanceTimersByTime(1);
    accessFeed('b', 'board');
    vi.advanceTimersByTime(1);
    accessFeed('c', 'board');

    expect(isFeedCached('a')).toBe(false);
    expect(isFeedCached('b')).toBe(true);
    expect(isFeedCached('c')).toBe(true);

    vi.useRealTimers();
  });

  it('clearFeeds empties cache', () => {
    const { accessFeed, clearFeeds } = useFeedCacheStore.getState();

    accessFeed('plebbit/board', 'board');
    accessFeed('other/board', 'catalog');
    expect(useFeedCacheStore.getState().cachedFeeds.length).toBe(2);

    clearFeeds();
    const after = useFeedCacheStore.getState().cachedFeeds;
    expect(after.length).toBe(0);
    expect(after).toEqual([]);
  });

  it('clearFeeds is idempotent when already empty', () => {
    const { clearFeeds } = useFeedCacheStore.getState();

    expect(useFeedCacheStore.getState().cachedFeeds.length).toBe(0);

    clearFeeds();
    clearFeeds();
    clearFeeds();

    const after = useFeedCacheStore.getState().cachedFeeds;
    expect(after.length).toBe(0);
    expect(after).toEqual([]);
  });
});
