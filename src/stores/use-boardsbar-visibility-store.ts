import { create } from 'zustand';
import { getAllBoardCodes } from '../constants/board-codes';

const LOCALSTORAGE_KEY_DIRECTORIES = '5chan-boardsbar-directories-visible';
const LOCALSTORAGE_KEY_SUBSCRIPTIONS = '5chan-boardsbar-subscriptions-visible';
const LOCALSTORAGE_KEY_DIRECTORIES_OLD = '5chan-topbar-directories-visible';
const LOCALSTORAGE_KEY_SUBSCRIPTIONS_OLD = '5chan-topbar-subscriptions-visible';

interface BoardsBarVisibilityState {
  // Directory codes that are visible (all visible by default)
  visibleDirectories: Set<string>;
  // If true, show all account subscriptions in boardsbar (default: false)
  showSubscriptionsInBoardsBar: boolean;
  // Actions
  toggleDirectory: (code: string) => void;
  setDirectoryVisibility: (code: string, visible: boolean) => void;
  setShowSubscriptionsInBoardsBar: (show: boolean) => void;
  // Initialize from localStorage
  initialize: () => void;
}

const loadFromLocalStorage = (key: string, fallbackKey: string, defaultValue: Set<string>): Set<string> => {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const array = JSON.parse(stored);
      return new Set(array);
    }
    const fallbackStored = localStorage.getItem(fallbackKey);
    if (fallbackStored) {
      const array = JSON.parse(fallbackStored);
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
    if (stored !== null) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed.length > 0;
      if (typeof parsed === 'boolean') return parsed;
    }
    const fallbackStored = localStorage.getItem(LOCALSTORAGE_KEY_SUBSCRIPTIONS_OLD);
    if (fallbackStored !== null) {
      const parsed = JSON.parse(fallbackStored);
      if (Array.isArray(parsed)) return parsed.length > 0;
      if (typeof parsed === 'boolean') return parsed;
    }
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

const useBoardsBarVisibilityStore = create<BoardsBarVisibilityState>((set, _get) => {
  // Initialize with all directories visible by default
  const allBoardCodes = getAllBoardCodes();
  const defaultVisibleDirectories = new Set(allBoardCodes);

  return {
    visibleDirectories: loadFromLocalStorage(LOCALSTORAGE_KEY_DIRECTORIES, LOCALSTORAGE_KEY_DIRECTORIES_OLD, defaultVisibleDirectories),
    showSubscriptionsInBoardsBar: loadShowSubscriptionsFromStorage(),

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

    setShowSubscriptionsInBoardsBar: (show: boolean) => {
      saveShowSubscriptionsToStorage(show);
      set({ showSubscriptionsInBoardsBar: show });
    },

    initialize: () => {
      const directories = loadFromLocalStorage(LOCALSTORAGE_KEY_DIRECTORIES, LOCALSTORAGE_KEY_DIRECTORIES_OLD, defaultVisibleDirectories);
      const showSubscriptions = loadShowSubscriptionsFromStorage();
      set({
        visibleDirectories: directories,
        showSubscriptionsInBoardsBar: showSubscriptions,
      });
    },
  };
});

export default useBoardsBarVisibilityStore;
