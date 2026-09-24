import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useMediaHostingStore, { MEDIA_HOSTING_PROVIDERS } from '../use-media-hosting-store';

const STORAGE_KEY = 'media-hosting-storage';

describe('useMediaHostingStore', () => {
  let setItemSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
  });

  afterEach(() => {
    setItemSpy.mockRestore();
    useMediaHostingStore.getState().setUploadMode('random');
    useMediaHostingStore.getState().setPreferredProvider('catbox');
  });

  it('exports MEDIA_HOSTING_PROVIDERS with ids, labels, homepage URLs, runtime metadata', () => {
    expect(MEDIA_HOSTING_PROVIDERS).toBeDefined();
    expect(MEDIA_HOSTING_PROVIDERS.map((p) => p.id)).toEqual(['forge', 'catbox', 'imgur', 'imgbb']);
    const forge = MEDIA_HOSTING_PROVIDERS.find((p) => p.id === 'forge');
    expect(forge).toEqual({
      id: 'forge',
      label: 'Forge Images',
      homepageUrl: 'https://img.bitsocialforge.com',
      availabilityProbeUrls: [
        'https://img.bitsocialforge.com/2aa4fa20701cdd6d8d56046069001186b5267e3ee7d0ef618ad2f4a683723e11.png',
        'https://img-api.bitsocialforge.com/health.png',
      ],
      supportedRuntimes: ['web'],
    });
    const catbox = MEDIA_HOSTING_PROVIDERS.find((p) => p.id === 'catbox');
    expect(catbox).toEqual({
      id: 'catbox',
      label: 'Catbox',
      homepageUrl: 'https://catbox.moe',
      availabilityProbeUrls: ['https://catbox.moe/pictures/logo.png', 'https://files.catbox.moe/8ten4y.png'],
      supportedRuntimes: ['electron', 'android'],
    });
    const imgur = MEDIA_HOSTING_PROVIDERS.find((p) => p.id === 'imgur');
    expect(imgur).toEqual({
      id: 'imgur',
      label: 'Imgur',
      homepageUrl: 'https://imgur.com',
      availabilityProbeUrls: ['https://s.imgur.com/images/favicon-32x32.png', 'https://i.imgur.com/YpB7qfa.jpg'],
      supportedRuntimes: ['electron', 'android'],
    });
    const imgbb = MEDIA_HOSTING_PROVIDERS.find((p) => p.id === 'imgbb');
    expect(imgbb).toEqual({
      id: 'imgbb',
      label: 'ImgBB',
      homepageUrl: 'https://imgbb.com',
      availabilityProbeUrls: ['https://simgbb.com/images/logo.png', 'https://i.ibb.co/7Jsq00V5/spoiler.png'],
      supportedRuntimes: ['electron', 'android'],
    });
  });

  it('defaults uploadMode to random and preferredProvider to catbox', () => {
    const { uploadMode, preferredProvider } = useMediaHostingStore.getState();
    expect(uploadMode).toBe('random');
    expect(preferredProvider).toBe('catbox');
  });

  it('sets uploadMode to none when setUploadMode is called with none', () => {
    useMediaHostingStore.getState().setUploadMode('none');
    const { uploadMode } = useMediaHostingStore.getState();
    expect(uploadMode).toBe('none');
  });

  it('persists state to localStorage when setUploadMode is called', () => {
    useMediaHostingStore.getState().setUploadMode('none');

    expect(setItemSpy).toHaveBeenCalledWith(STORAGE_KEY, expect.stringContaining('"uploadMode":"none"'));
  });

  it('persists preferredProvider when setPreferredProvider is called', () => {
    useMediaHostingStore.getState().setPreferredProvider('imgur');

    expect(setItemSpy).toHaveBeenCalledWith(STORAGE_KEY, expect.stringContaining('"preferredProvider":"imgur"'));
  });

  it('migrates legacy selectedProvider state to random + catbox', async () => {
    const legacyState = { state: { selectedProvider: 'imgur' }, version: 0 };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyState));

    await useMediaHostingStore.persist.rehydrate();

    const { uploadMode, preferredProvider } = useMediaHostingStore.getState();
    expect(uploadMode).toBe('random');
    expect(preferredProvider).toBe('catbox');
  });
});
