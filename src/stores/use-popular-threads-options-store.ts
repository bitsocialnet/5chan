import { create } from 'zustand';

export type PopularThreadsContentFilter = 'all' | 'worksafe' | 'nsfw';

interface PopularThreadsOptionsStore {
  contentFilter: PopularThreadsContentFilter;
  setContentFilter: (value: PopularThreadsContentFilter) => void;
}

const LOCALSTORAGE_KEY = '5chan-popular-threads-filter';
// Read once to carry the choice over from the two separate flags this used to be saved as. Two
// tabs could leave both on, which hid every board; that pair maps to worksafe, the default.
const LEGACY_WORKSAFE_KEY = 'showWorksafeContentOnly';
const LEGACY_NSFW_KEY = 'showNsfwContentOnly';

const readInitialContentFilter = (): PopularThreadsContentFilter => {
  try {
    const stored = localStorage.getItem(LOCALSTORAGE_KEY);
    if (stored === 'all' || stored === 'worksafe' || stored === 'nsfw') return stored;
    const legacyWorksafe = localStorage.getItem(LEGACY_WORKSAFE_KEY);
    if (legacyWorksafe === null || legacyWorksafe === 'true') return 'worksafe';
    return localStorage.getItem(LEGACY_NSFW_KEY) === 'true' ? 'nsfw' : 'all';
  } catch {
    return 'worksafe';
  }
};

const usePopularThreadsOptionsStore = create<PopularThreadsOptionsStore>((set) => ({
  contentFilter: readInitialContentFilter(),
  setContentFilter: (value) => {
    set({ contentFilter: value });
    try {
      localStorage.setItem(LOCALSTORAGE_KEY, value);
    } catch (error) {
      console.warn('Failed to save the popular threads filter to localStorage:', error);
    }
  },
}));

export default usePopularThreadsOptionsStore;
