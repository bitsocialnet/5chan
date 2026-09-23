import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('frames preferences', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => vi.restoreAllMocks());

  it('starts disabled and restores all preferences after a reload', async () => {
    const { default: store, FRAMES_STORAGE_KEY } = await import('../use-frames-store');
    expect(store.getState().useFrames).toBe(false);

    store.getState().setUseFrames(true);
    store.getState().setShowDirectories(true);
    store.getState().setWorksafeOnly(true);
    store.getState().toggleSection('image');
    store.getState().toggleSection('multi');
    expect(JSON.parse(localStorage.getItem(FRAMES_STORAGE_KEY)!)).toEqual({
      useFrames: true,
      showDirectories: true,
      worksafeOnly: true,
      collapsedSections: { image: true, upload: false, multi: true },
    });

    vi.resetModules();
    const restored = (await import('../use-frames-store')).default;
    expect(restored.getState()).toMatchObject({
      useFrames: true,
      showDirectories: true,
      worksafeOnly: true,
      collapsedSections: { image: true, upload: false, multi: true },
    });
    restored.getState().toggleSection('image');
    expect(restored.getState().collapsedSections).toEqual({ image: false, upload: false, multi: true });
  });

  it.each(['invalid json', '{"useFrames":"true","showDirectories":1,"collapsedSections":{"image":"true"}}', 'null'])(
    'uses safe defaults for invalid stored preferences: %s',
    async (stored) => {
      localStorage.setItem('5chan-frames', stored);
      const store = (await import('../use-frames-store')).default;
      expect(store.getState()).toMatchObject({
        useFrames: false,
        showDirectories: false,
        worksafeOnly: false,
        collapsedSections: { image: false, upload: false, multi: false },
      });
    },
  );

  it('keeps controls usable when storage reads and writes throw', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage full');
    });
    const store = (await import('../use-frames-store')).default;

    store.getState().setUseFrames(true);
    store.getState().setShowDirectories(true);
    store.getState().toggleSection('upload');

    expect(store.getState()).toMatchObject({ useFrames: true, showDirectories: true, collapsedSections: { upload: true } });
  });
});
