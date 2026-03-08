import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAllBoardCodes } from '../../constants/board-codes';

describe('preference stores', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it('useAllFeedFilterStore loads and persists the selected filter', async () => {
    localStorage.setItem('5chan-all-feed-filter', 'nsfw');

    const store = (await import('../use-all-feed-filter-store')).default;

    expect(store.getState().filter).toBe('nsfw');

    store.getState().setFilter('sfw');

    expect(store.getState().filter).toBe('sfw');
    expect(localStorage.getItem('5chan-all-feed-filter')).toBe('sfw');
  });

  it('useBoardsFilterStore restores board preferences and saves updates', async () => {
    localStorage.setItem('5chan-boards-use-catalog', 'true');
    localStorage.setItem('5chan-boards-filter', 'worksafe');

    const store = (await import('../use-boards-filter-store')).default;

    expect(store.getState().useCatalogLinks).toBe(true);
    expect(store.getState().boardFilter).toBe('worksafe');

    store.getState().setUseCatalogLinks(false);
    store.getState().setBoardFilter('nsfw');

    expect(store.getState().useCatalogLinks).toBe(false);
    expect(store.getState().boardFilter).toBe('nsfw');
    expect(localStorage.getItem('5chan-boards-use-catalog')).toBe('false');
    expect(localStorage.getItem('5chan-boards-filter')).toBe('nsfw');
  });

  it('useCatalogStyleStore reads existing preferences and updates both settings', async () => {
    localStorage.setItem('imageSize', 'Large');
    localStorage.setItem('showOPComment', 'false');

    const store = (await import('../use-catalog-style-store')).default;

    expect(store.getState().imageSize).toBe('Large');
    expect(store.getState().showOPComment).toBe(false);

    store.getState().setImageSize('Small');
    store.getState().setShowOPComment(true);

    expect(store.getState().imageSize).toBe('Small');
    expect(store.getState().showOPComment).toBe(true);
    expect(localStorage.getItem('imageSize')).toBe('Small');
    expect(localStorage.getItem('showOPComment')).toBe('true');
  });

  it('useBoardsBarVisibilityStore loads legacy keys and updates visibility settings', async () => {
    const boardCodes = getAllBoardCodes();
    localStorage.setItem('5chan-topbar-directories-visible', JSON.stringify([boardCodes[0]]));
    localStorage.setItem('5chan-topbar-subscriptions-visible', JSON.stringify(['sub-1']));

    const store = (await import('../use-boards-bar-visibility-store')).default;

    expect(Array.from(store.getState().visibleDirectories)).toEqual([boardCodes[0]]);
    expect(store.getState().showSubscriptionsInBoardsBar).toBe(true);

    store.getState().toggleDirectory(boardCodes[1]);
    expect(store.getState().visibleDirectories.has(boardCodes[1])).toBe(true);

    store.getState().setDirectoryVisibility(boardCodes[0], false);
    expect(store.getState().visibleDirectories.has(boardCodes[0])).toBe(false);

    store.getState().setShowSubscriptionsInBoardsBar(false);
    expect(store.getState().showSubscriptionsInBoardsBar).toBe(false);
    expect(localStorage.getItem('5chan-boardsbar-subscriptions-visible')).toBe('false');
  });

  it('useBoardsBarVisibilityStore reinitializes from current storage keys', async () => {
    const boardCodes = getAllBoardCodes();
    const store = (await import('../use-boards-bar-visibility-store')).default;

    localStorage.setItem('5chan-boardsbar-directories-visible', JSON.stringify([boardCodes[2], boardCodes[3]]));
    localStorage.setItem('5chan-boardsbar-subscriptions-visible', JSON.stringify(true));

    store.getState().initialize();

    expect(Array.from(store.getState().visibleDirectories)).toEqual([boardCodes[2], boardCodes[3]]);
    expect(store.getState().showSubscriptionsInBoardsBar).toBe(true);
  });
});
