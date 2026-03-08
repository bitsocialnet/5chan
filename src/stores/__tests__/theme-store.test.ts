import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  entriesMock: vi.fn(async () => [] as Array<['nsfw' | 'sfw', string]>),
  setItemMock: vi.fn(async () => undefined),
}));

vi.mock('@bitsocialhq/bitsocial-react-hooks/dist/lib/localforage-lru/index.js', () => ({
  default: {
    createInstance: () => ({
      entries: testState.entriesMock,
      setItem: testState.setItemMock,
    }),
  },
}));

const waitFor = async (predicate: () => boolean) => {
  for (let i = 0; i < 20; i += 1) {
    await Promise.resolve();
    if (predicate()) {
      return;
    }
  }
};

describe('useThemeStore', () => {
  beforeEach(() => {
    vi.resetModules();
    testState.entriesMock.mockReset();
    testState.entriesMock.mockResolvedValue([]);
    testState.setItemMock.mockReset();
    testState.setItemMock.mockResolvedValue(undefined);
  });

  it('loads stored themes on initialization', async () => {
    testState.entriesMock.mockResolvedValue([
      ['nsfw', 'tomorrow'],
      ['sfw', 'photon'],
    ]);

    const store = (await import('../use-theme-store')).default;
    await waitFor(() => store.getState().themes.nsfw === 'tomorrow');

    expect(store.getState().themes).toEqual({
      nsfw: 'tomorrow',
      sfw: 'photon',
    });
    expect(store.getState().currentTheme).toBeNull();
  });

  it('setTheme persists the updated theme and updates currentTheme', async () => {
    const store = (await import('../use-theme-store')).default;
    await waitFor(() => testState.entriesMock.mock.calls.length > 0);

    await store.getState().setTheme('nsfw', 'photon');

    expect(testState.setItemMock).toHaveBeenCalledWith('nsfw', 'photon');
    expect(store.getState().themes.nsfw).toBe('photon');
    expect(store.getState().currentTheme).toBe('photon');
  });

  it('getTheme can skip updating currentTheme when requested', async () => {
    const store = (await import('../use-theme-store')).default;
    await waitFor(() => testState.entriesMock.mock.calls.length > 0);

    expect(store.getState().getTheme('sfw', false)).toBe('yotsuba-b');
    expect(store.getState().currentTheme).toBeNull();

    expect(store.getState().getTheme('sfw')).toBe('yotsuba-b');
    expect(store.getState().currentTheme).toBe('yotsuba-b');
  });
});
