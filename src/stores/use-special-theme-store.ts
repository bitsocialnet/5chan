import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getActiveSpecialTheme } from '../lib/utils/time-utils';

interface SpecialThemeStore {
  isEnabled: boolean | null;
  setIsEnabled: (value: boolean) => void;
}

const useSpecialThemeStore = create(
  persist<SpecialThemeStore>(
    (set) => ({
      isEnabled: null,
      setIsEnabled: (value: boolean) => {
        if (value && !getActiveSpecialTheme()) {
          return;
        }
        set({ isEnabled: value });
      },
    }),
    {
      name: 'Special-theme-storage',
      onRehydrateStorage: () => {
        return (state) => {
          if (state && !getActiveSpecialTheme()) {
            state.isEnabled = null;
          }
        };
      },
    },
  ),
);

export const shouldShowSnow = (): boolean => {
  const isEnabled = useSpecialThemeStore.getState().isEnabled;
  const activeSpecialTheme = getActiveSpecialTheme();

  if (isEnabled !== null) {
    return isEnabled && activeSpecialTheme === 'christmas';
  }

  return activeSpecialTheme === 'christmas';
};

export default useSpecialThemeStore;
