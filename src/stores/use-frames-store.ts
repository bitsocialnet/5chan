import { create } from 'zustand';

export type FramesSection = 'image' | 'upload' | 'multi';

interface FramesPreferences {
  useFrames: boolean;
  showDirectories: boolean;
  worksafeOnly: boolean;
  collapsedSections: Record<FramesSection, boolean>;
}

interface FramesStore extends FramesPreferences {
  setUseFrames: (value: boolean) => void;
  setShowDirectories: (value: boolean) => void;
  setWorksafeOnly: (value: boolean) => void;
  toggleSection: (section: FramesSection) => void;
}

export const FRAMES_STORAGE_KEY = '5chan-frames';

const readPreferences = (): FramesPreferences => {
  try {
    const stored = JSON.parse(localStorage.getItem(FRAMES_STORAGE_KEY) ?? 'null');
    return {
      useFrames: stored?.useFrames === true,
      showDirectories: stored?.showDirectories === true,
      worksafeOnly: stored?.worksafeOnly === true,
      collapsedSections: {
        image: stored?.collapsedSections?.image === true,
        upload: stored?.collapsedSections?.upload === true,
        multi: stored?.collapsedSections?.multi === true,
      },
    };
  } catch {
    return { useFrames: false, showDirectories: false, worksafeOnly: false, collapsedSections: { image: false, upload: false, multi: false } };
  }
};

const savePreferences = ({ useFrames, showDirectories, worksafeOnly, collapsedSections }: FramesPreferences) => {
  try {
    localStorage.setItem(FRAMES_STORAGE_KEY, JSON.stringify({ useFrames, showDirectories, worksafeOnly, collapsedSections }));
  } catch {
    // Frames remain usable when browser storage is unavailable or full.
  }
};

const useFramesStore = create<FramesStore>((set, get) => ({
  ...readPreferences(),
  setUseFrames: (useFrames) => {
    set({ useFrames });
    savePreferences(get());
  },
  setShowDirectories: (showDirectories) => {
    set({ showDirectories });
    savePreferences(get());
  },
  setWorksafeOnly: (worksafeOnly) => {
    set({ worksafeOnly });
    savePreferences(get());
  },
  toggleSection: (section) => {
    set((state) => ({ collapsedSections: { ...state.collapsedSections, [section]: !state.collapsedSections[section] } }));
    savePreferences(get());
  },
}));

export default useFramesStore;
