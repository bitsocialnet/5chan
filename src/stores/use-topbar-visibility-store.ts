import { create } from 'zustand';
import { getAllBoardCodes } from '../constants/board-codes';

const LOCALSTORAGE_KEY_DIRECTORIES = '5chan-topbar-directories-visible';
const LOCALSTORAGE_KEY_SUBSCRIPTIONS = '5chan-topbar-subscriptions-visible';

interface TopbarVisibilityState {
  // Directory codes that are visible (all visible by default)
  visibleDirectories: Set<string>;
  // If true, show all account subscriptions in topbar (default: false)
  showSubscriptionsInTopbar: boolean;
  // Actions
  toggleDirectory: (code: string) => void;
  setDirectoryVisibility: (code: string, visible: boolean) => void;
  setShowSubscriptionsInTopbar: (show: boolean) => void;
  // Initialize from localStorage
  initialize: () => void;
}

const loadFromLocalStorage = (key: string, defaultValue: Set<string>): Set<string> => {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const array = JSON.parse(stored);
      return new Set(array);
    }
  } catch (e) {
    console.warn(`Failed to load ${key} from localStorage:`, e);
  }
  return defaultValue;
};

const saveToLocalStorage = (key: string, set: Set<string>) => {
  try {
    const array = Array.from(set);
    localStorage.setItem(key, JSON.stringify(array));
  } catch (e) {
    console.warn(`Failed to save ${key} to localStorage:`, e);
  }
};

const loadShowSubscriptionsFromStorage = (): boolean => {
  try {
    const stored = localStorage.getItem(LOCALSTORAGE_KEY_SUBSCRIPTIONS);
    if (!stored) return false;
    const parsed = JSON.parse(stored);
    // Migrate from old format (array of addresses)
    if (Array.isArray(parsed)) return parsed.length > 0;
    if (typeof parsed === 'boolean') return parsed;
  } catch (e) {
    console.warn('Failed to load subscriptions visibility from localStorage:', e);
  }
  return false;
};

const saveShowSubscriptionsToStorage = (show: boolean) => {
  try {
    localStorage.setItem(LOCALSTORAGE_KEY_SUBSCRIPTIONS, JSON.stringify(show));
  } catch (e) {
    console.warn('Failed to save subscriptions visibility to localStorage:', e);
  }
};

const useTopbarVisibilityStore = create<TopbarVisibilityState>((set, _get) => {
  // Initialize with all directories visible by default
  const allBoardCodes = getAllBoardCodes();
  const defaultVisibleDirectories = new Set(allBoardCodes);

  return {
    visibleDirectories: loadFromLocalStorage(LOCALSTORAGE_KEY_DIRECTORIES, defaultVisibleDirectories),
    showSubscriptionsInTopbar: loadShowSubscriptionsFromStorage(),

    toggleDirectory: (code: string) => {
      set((state) => {
        const newSet = new Set(state.visibleDirectories);
        if (newSet.has(code)) {
          newSet.delete(code);
        } else {
          newSet.add(code);
        }
        saveToLocalStorage(LOCALSTORAGE_KEY_DIRECTORIES, newSet);
        return { visibleDirectories: newSet };
      });
    },

    setDirectoryVisibility: (code: string, visible: boolean) => {
      set((state) => {
        const newSet = new Set(state.visibleDirectories);
        if (visible) {
          newSet.add(code);
        } else {
          newSet.delete(code);
        }
        saveToLocalStorage(LOCALSTORAGE_KEY_DIRECTORIES, newSet);
        return { visibleDirectories: newSet };
      });
    },

    setShowSubscriptionsInTopbar: (show: boolean) => {
      saveShowSubscriptionsToStorage(show);
      set({ showSubscriptionsInTopbar: show });
    },

    initialize: () => {
      const directories = loadFromLocalStorage(LOCALSTORAGE_KEY_DIRECTORIES, defaultVisibleDirectories);
      const showSubscriptions = loadShowSubscriptionsFromStorage();
      set({
        visibleDirectories: directories,
        showSubscriptionsInTopbar: showSubscriptions,
      });
    },
  };
});

export default useTopbarVisibilityStore;
