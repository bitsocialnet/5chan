import { create, StoreApi } from 'zustand';
import localForageLru from '@bitsocialhq/bitsocial-react-hooks/dist/lib/localforage-lru/index.js';

interface ThemeState {
  themes: {
    nsfw: string;
    sfw: string;
  };
  currentTheme: string | null;
  setTheme: (category: keyof ThemeState['themes'], theme: string) => void;
  getTheme: (category: keyof ThemeState['themes'], updateCurrentTheme?: boolean) => string | null;
  loadThemes: () => Promise<void>;
}

const themeStore = localForageLru.createInstance({
  name: 'themeStore',
  size: 1000,
});

const useThemeStore = create<ThemeState>((set: StoreApi<ThemeState>['setState'], get: StoreApi<ThemeState>['getState']) => ({
  themes: {
    nsfw: 'yotsuba',
    sfw: 'yotsuba-b',
  },
  currentTheme: null,
  setTheme: async (category, theme) => {
    const currentThemes = get().themes;
    const updatedThemes = { ...currentThemes, [category]: theme };
    await themeStore.setItem(category, theme);
    set({ themes: updatedThemes, currentTheme: theme });
  },
  getTheme: (category, updateCurrentTheme = true) => {
    const currentThemes = get().themes;
    const theme = currentThemes[category] || null;
    if (updateCurrentTheme) {
      set({ currentTheme: theme });
    }
    return theme;
  },
  loadThemes: async () => {
    const entries: [keyof ThemeState['themes'], string][] = await themeStore.entries();
    const themes: Record<keyof ThemeState['themes'], string> = {
      nsfw: 'yotsuba',
      sfw: 'yotsuba-b',
    };
    entries.forEach(([key, value]) => {
      themes[key] = value;
    });
    set({ themes, currentTheme: null });
  },
}));

// Load themes on store initialization
useThemeStore.getState().loadThemes();

export default useThemeStore;
