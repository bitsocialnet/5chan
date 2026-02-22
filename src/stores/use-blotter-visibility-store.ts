import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface BlotterVisibilityState {
  isHidden: boolean;
  toggleVisibility: () => void;
}

const useBlotterVisibilityStore = create<BlotterVisibilityState>()(
  persist(
    (set) => ({
      isHidden: false,
      toggleVisibility: () =>
        set((state) => ({
          isHidden: !state.isHidden,
        })),
    }),
    {
      name: 'blotter-visibility',
    },
  ),
);

export default useBlotterVisibilityStore;
