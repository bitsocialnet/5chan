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
    expect(MEDIA_HOSTING_PROVIDERS.length).toBe(2);
    const catbox = MEDIA_HOSTING_PROVIDERS.find((p) => p.id === 'catbox');
    expect(catbox).toEqual({
      id: 'catbox',
      label: 'Catbox',
      homepageUrl: 'https://catbox.moe',
      supportedRuntimes: ['web', 'electron', 'android'],
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
