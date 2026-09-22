import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface HomepageIntroductionState {
  showIntroduction: boolean;
  setShowIntroduction: (showIntroduction: boolean) => void;
}

const useHomepageIntroductionStore = create<HomepageIntroductionState>()(
  persist(
    (set) => ({
      showIntroduction: true,
      setShowIntroduction: (showIntroduction) => set({ showIntroduction }),
    }),
    { name: 'homepage-introduction' },
  ),
);

export default useHomepageIntroductionStore;
