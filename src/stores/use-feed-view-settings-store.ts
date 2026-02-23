import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FeedViewSettingsState {
  enableInfiniteScroll: boolean;
  setEnableInfiniteScroll: (enable: boolean) => void;
}

const useFeedViewSettingsStore = create<FeedViewSettingsState>()(
  persist(
    (set) => ({
      enableInfiniteScroll: false,
      setEnableInfiniteScroll: (enable) => set({ enableInfiniteScroll: enable }),
    }),
    {
      name: 'feed-view-settings-store',
    },
  ),
);

export default useFeedViewSettingsStore;
