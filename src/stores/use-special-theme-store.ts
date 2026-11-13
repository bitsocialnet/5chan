import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getActiveSpecialTheme, getActiveSpecialThemeEvent } from '../lib/utils/time-utils';

interface SpecialThemeStore {
  isEnabled: boolean | null;
  /** The seasonal event the choice was made in, like `halloween-2026`. */
  event: string | null;
  setIsEnabled: (value: boolean) => void;
}

const useSpecialThemeStore = create(
  persist<SpecialThemeStore>(
    (set) => ({
      isEnabled: null,
      event: null,
      setIsEnabled: (value: boolean) => {
        if (value && !getActiveSpecialTheme()) {
          return;
        }
        set({ isEnabled: value, event: getActiveSpecialThemeEvent() });
      },
    }),
    {
      name: 'Special-theme-storage',
      onRehydrateStorage: () => {
        return (state) => {
          // A choice lasts for the event it was made in, like 4chan's per-event opt-out, so every
          // year's Halloween and Christmas turn the theme on again. vite-static-shell.mjs mirrors this.
          const event = getActiveSpecialThemeEvent();
          if (state && (!event || state.event !== event)) {
            state.isEnabled = null;
            state.event = null;
          }
        };
      },
    },
  ),
);

/**
 * The choice made in the seasonal event running now, or null when none was. Read it in place of
 * `isEnabled`: rehydrating drops a choice from another event only on load, so a session left open
 * still holds one when the next event starts.
 */
export const selectIsSpecialThemeEnabled = (state: Pick<SpecialThemeStore, 'isEnabled' | 'event'>): boolean | null => {
  const event = getActiveSpecialThemeEvent();
  return event && state.event === event ? state.isEnabled : null;
};

export const shouldShowSnow = (): boolean => {
  const isEnabled = selectIsSpecialThemeEnabled(useSpecialThemeStore.getState());
  const activeSpecialTheme = getActiveSpecialTheme();

  if (isEnabled !== null) {
    return isEnabled && activeSpecialTheme === 'christmas';
  }

  return activeSpecialTheme === 'christmas';
};

export default useSpecialThemeStore;
