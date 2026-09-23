import { create } from 'zustand';

export interface CachedFeed {
  key: string;
  type: 'board' | 'catalog';
  lastAccessed: number;
}

interface FeedCacheState {
  cachedFeeds: CachedFeed[];
  maxCacheSize: number;
  accessFeed: (key: string, type: 'board' | 'catalog') => void;
  removeFeed: (key: string) => void;
  clearFeeds: () => void;
  isFeedCached: (key: string) => boolean;
}

/** Pure projection shared by navigation rendering and the committed LRU update. */
export const getFeedCacheAfterAccess = (cachedFeeds: CachedFeed[], maxCacheSize: number, incomingFeed: CachedFeed): CachedFeed[] => {
  const existingIndex = cachedFeeds.findIndex((feed) => feed.key === incomingFeed.key);
  if (existingIndex !== -1) {
    return cachedFeeds.map((feed, index) => (index === existingIndex ? { ...feed, lastAccessed: incomingFeed.lastAccessed } : feed));
  }

  const updatedFeeds = [...cachedFeeds, incomingFeed];
  if (updatedFeeds.length > maxCacheSize) {
    updatedFeeds.sort((a, b) => a.lastAccessed - b.lastAccessed);
    return updatedFeeds.slice(updatedFeeds.length - maxCacheSize);
  }
  return updatedFeeds;
};

const useFeedCacheStore = create<FeedCacheState>((set, get) => ({
  cachedFeeds: [],
  maxCacheSize: 2,

  accessFeed: (key: string, type: 'board' | 'catalog') => {
    const { cachedFeeds, maxCacheSize } = get();
    set({ cachedFeeds: getFeedCacheAfterAccess(cachedFeeds, maxCacheSize, { key, type, lastAccessed: Date.now() }) });
  },

  removeFeed: (key: string) => {
    const { cachedFeeds } = get();
    set({ cachedFeeds: cachedFeeds.filter((feed) => feed.key !== key) });
  },

  clearFeeds: () => {
    const { cachedFeeds } = get();
    if (cachedFeeds.length === 0) return;
    set({ cachedFeeds: [] });
  },

  isFeedCached: (key: string) => {
    const { cachedFeeds } = get();
    return cachedFeeds.some((feed) => feed.key === key);
  },
}));

export default useFeedCacheStore;
