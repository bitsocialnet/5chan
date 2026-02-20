import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useFeedViewSettingsStore from '../use-feed-view-settings-store';

const STORAGE_KEY = 'feed-view-settings-store';

describe('useFeedViewSettingsStore', () => {
  let setItemSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
  });

  afterEach(() => {
    setItemSpy.mockRestore();
    useFeedViewSettingsStore.getState().setEnableInfiniteScroll(false);
  });

  it('defaults enableInfiniteScroll to false', () => {
    const { enableInfiniteScroll } = useFeedViewSettingsStore.getState();
    expect(enableInfiniteScroll).toBe(false);
  });

  it('sets enableInfiniteScroll to true when setEnableInfiniteScroll is called with true', () => {
    useFeedViewSettingsStore.getState().setEnableInfiniteScroll(true);
    const { enableInfiniteScroll } = useFeedViewSettingsStore.getState();
    expect(enableInfiniteScroll).toBe(true);
  });

  it('persists state to localStorage when setEnableInfiniteScroll is called', () => {
    useFeedViewSettingsStore.getState().setEnableInfiniteScroll(true);

    expect(setItemSpy).toHaveBeenCalledWith(STORAGE_KEY, expect.stringContaining('"state":'));
    expect(setItemSpy).toHaveBeenCalledWith(STORAGE_KEY, expect.stringContaining('"enableInfiniteScroll":true'));
  });
});
