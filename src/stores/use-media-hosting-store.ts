import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const MEDIA_HOSTING_PROVIDERS = [{ id: 'catbox', name: 'Catbox', url: 'https://catbox.moe' }] as const;

export type MediaHostingSelection = (typeof MEDIA_HOSTING_PROVIDERS)[number]['id'] | 'none' | string;

interface MediaHostingStore {
  selectedProvider: MediaHostingSelection;
  setSelectedProvider: (provider: string) => void;
}

const useMediaHostingStore = create<MediaHostingStore>()(
  persist(
    (set) => ({
      selectedProvider: 'catbox',
      setSelectedProvider: (provider) => set({ selectedProvider: provider }),
    }),
    {
      name: 'media-hosting-storage',
    },
  ),
);

export default useMediaHostingStore;
