import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProviderId, UploadMode } from '../lib/media-hosting/types';
import { MEDIA_HOSTING_PROVIDERS as PROVIDER_REGISTRY } from '../lib/media-hosting/providers';

/** Provider registry for UI: id, label, homepage URL, runtime support */
export const MEDIA_HOSTING_PROVIDERS = PROVIDER_REGISTRY;

interface MediaHostingStore {
  uploadMode: UploadMode;
  preferredProvider: ProviderId;
  setUploadMode: (mode: UploadMode) => void;
  setPreferredProvider: (provider: ProviderId) => void;
}

const PERSIST_VERSION = 2;

function migrate(_state: unknown): MediaHostingStore {
  return {
    uploadMode: 'random',
    preferredProvider: 'catbox',
  } as MediaHostingStore;
}

const useMediaHostingStore = create<MediaHostingStore>()(
  persist(
    (set) => ({
      uploadMode: 'random',
      preferredProvider: 'catbox',
      setUploadMode: (mode) => set({ uploadMode: mode }),
      setPreferredProvider: (provider) => set({ preferredProvider: provider }),
    }),
    {
      name: 'media-hosting-storage',
      version: PERSIST_VERSION,
      migrate: (persistedState, version) => {
        if (version < PERSIST_VERSION) {
          return migrate(persistedState);
        }
        return persistedState as MediaHostingStore;
      },
    },
  ),
);

export default useMediaHostingStore;
