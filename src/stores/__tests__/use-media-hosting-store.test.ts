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
    useMediaHostingStore.getState().setSelectedProvider('catbox');
  });

  it('exports MEDIA_HOSTING_PROVIDERS with at least Catbox provider', () => {
    expect(MEDIA_HOSTING_PROVIDERS).toBeDefined();
    expect(MEDIA_HOSTING_PROVIDERS.length).toBeGreaterThanOrEqual(1);
    const catbox = MEDIA_HOSTING_PROVIDERS.find((p) => p.id === 'catbox');
    expect(catbox).toEqual({ id: 'catbox', name: 'Catbox', url: 'https://catbox.moe' });
  });

  it('defaults selectedProvider to catbox', () => {
    const { selectedProvider } = useMediaHostingStore.getState();
    expect(selectedProvider).toBe('catbox');
  });

  it('sets selectedProvider to none when setSelectedProvider is called with none', () => {
    useMediaHostingStore.getState().setSelectedProvider('none');
    const { selectedProvider } = useMediaHostingStore.getState();
    expect(selectedProvider).toBe('none');
  });

  it('persists state to localStorage when setSelectedProvider is called', () => {
    useMediaHostingStore.getState().setSelectedProvider('none');

    expect(setItemSpy).toHaveBeenCalledWith(STORAGE_KEY, expect.stringContaining('"selectedProvider":"none"'));
  });
});
