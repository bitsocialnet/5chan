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

const useFeedCacheStore = create<FeedCacheState>((set, get) => ({
  cachedFeeds: [],
  maxCacheSize: 2,

  accessFeed: (key: string, type: 'board' | 'catalog') => {
    const { cachedFeeds, maxCacheSize } = get();
    const now = Date.now();
    const existingIndex = cachedFeeds.findIndex((feed) => feed.key === key);

    if (existingIndex !== -1) {
      const updatedFeeds = [...cachedFeeds];
      updatedFeeds[existingIndex] = { ...updatedFeeds[existingIndex], lastAccessed: now };
      set({ cachedFeeds: updatedFeeds });
    } else {
      const newFeed: CachedFeed = { key, type, lastAccessed: now };
      let updatedFeeds = [...cachedFeeds, newFeed];

      if (updatedFeeds.length > maxCacheSize) {
        updatedFeeds.sort((a, b) => a.lastAccessed - b.lastAccessed);
        updatedFeeds = updatedFeeds.slice(1);
      }

      set({ cachedFeeds: updatedFeeds });
    }
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
