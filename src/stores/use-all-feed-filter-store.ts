import { create } from 'zustand';

type AllFeedFilter = 'all' | 'nsfw' | 'sfw';

interface AllFeedFilterStore {
  filter: AllFeedFilter;
  setFilter: (value: AllFeedFilter) => void;
}

const getStoredFilter = (): AllFeedFilter => {
  try {
    const stored = localStorage.getItem('5chan-all-feed-filter') as AllFeedFilter;
    return stored === 'nsfw' || stored === 'sfw' ? stored : 'all';
  } catch {
    return 'all';
  }
};

const useAllFeedFilterStore = create<AllFeedFilterStore>((set) => ({
  filter: getStoredFilter(),
  setFilter: (value: AllFeedFilter) => {
    set({ filter: value });
    try {
      localStorage.setItem('5chan-all-feed-filter', value);
    } catch (error) {
      console.warn('Failed to save allFeedFilter to localStorage:', error);
    }
  },
}));

export default useAllFeedFilterStore;
