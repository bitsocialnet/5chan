import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  commentMatchesPatternMock: vi.fn((comment: { content?: string; title?: string; link?: string }, pattern: string) => {
    const haystack = [comment?.title, comment?.content, comment?.link].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(pattern.toLowerCase());
  }),
}));

vi.mock('../../lib/utils/pattern-utils', () => ({
  commentMatchesPattern: (comment: unknown, pattern: string) => testState.commentMatchesPatternMock(comment as never, pattern),
}));

type CatalogFiltersStoreModule = typeof import('../use-catalog-filters-store');
type CatalogFiltersStore = Awaited<ReturnType<typeof loadStore>>;

const STORAGE_KEY = 'catalog-filters-storage';

const loadStore = async () => {
  vi.resetModules();
  const module = (await import('../use-catalog-filters-store')) as CatalogFiltersStoreModule;
  await Promise.resolve();
  return module.default;
};

const createFilterItem = (text: string, overrides: Record<string, unknown> = {}) => ({
  text,
  enabled: true,
  count: 0,
  filteredCids: new Set<string>(),
  subplebbitCounts: new Map<string, number>(),
  subplebbitFilteredCids: new Map<string, Set<string>>(),
  hide: true,
  top: false,
  color: '',
  ...overrides,
});

describe('useCatalogFiltersStore', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.clearAllMocks();
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleWarnSpy.mockRestore();
  });

  it('sanitizes filter items and persists only portable filter fields', async () => {
    const useCatalogFiltersStore = await loadStore();

    useCatalogFiltersStore
      .getState()
      .setFilterItems([
        createFilterItem('spam', { color: 'red' }),
        createFilterItem('   '),
        createFilterItem('news', { enabled: false, hide: false, top: true }),
      ] as never);

    const { filterItems } = useCatalogFiltersStore.getState();
    expect(filterItems).toHaveLength(2);
    expect(filterItems[0]).toMatchObject({
      text: 'spam',
      enabled: true,
      count: 0,
      hide: true,
      top: false,
      color: 'red',
    });
    expect(filterItems[0].filteredCids).toEqual(new Set());
    expect(filterItems[0].subplebbitCounts).toEqual(new Map());
    expect(filterItems[1]).toMatchObject({
      text: 'news',
      enabled: false,
      hide: false,
      top: true,
    });

    const persisted = localStorage.getItem(STORAGE_KEY) ?? '';
    expect(persisted).toContain('"text":"spam"');
    expect(persisted).toContain('"hide":true');
    expect(persisted).not.toContain('"count"');
    expect(persisted).not.toContain('"filteredCids"');
  });

  it('applies search and content filters, hides matching comments, and counts hidden cids only once per board', async () => {
    const useCatalogFiltersStore = await loadStore();

    useCatalogFiltersStore.getState().setFilterItems([createFilterItem('spam', { hide: true }), createFilterItem('highlight', { hide: false, top: true })] as never);
    useCatalogFiltersStore.getState().setCurrentSubplebbitAddress('music.eth');
    useCatalogFiltersStore.getState().setSearchFilter('topic');

    const filter = useCatalogFiltersStore.getState().filter;
    expect(filter).toBeTypeOf('function');

    expect(filter?.({ cid: 'cid-1', content: 'topic spam', subplebbitAddress: 'music.eth' } as never)).toBe(false);
    expect(filter?.({ cid: 'cid-1', content: 'topic spam', subplebbitAddress: 'music.eth' } as never)).toBe(false);
    expect(filter?.({ cid: 'cid-2', content: 'topic spam', subplebbitAddress: 'tech.eth' } as never)).toBe(false);
    expect(filter?.({ cid: 'cid-3', content: 'topic highlight', subplebbitAddress: 'music.eth' } as never)).toBe(true);
    expect(filter?.({ cid: 'cid-4', content: 'ordinary update', subplebbitAddress: 'music.eth' } as never)).toBe(false);

    vi.runAllTimers();

    const state = useCatalogFiltersStore.getState();
    expect(testState.commentMatchesPatternMock).toHaveBeenCalled();
    expect(state.filterItems[0].count).toBe(1);
    expect(state.filterItems[0].filteredCids).toEqual(new Set(['cid-1']));
    expect(state.filterItems[0].subplebbitCounts.get('music.eth')).toBe(1);
    expect(state.filteredCount).toBe(1);
    expect(state.getFilteredCountForCurrentSubplebbit()).toBe(1);
  });

  it('preserves counts for unchanged filters when saving and clears matched filters', async () => {
    const useCatalogFiltersStore = await loadStore();

    useCatalogFiltersStore.getState().setFilterItems([createFilterItem('spam')] as never);
    useCatalogFiltersStore.getState().setCurrentSubplebbitAddress('music.eth');
    useCatalogFiltersStore.getState().incrementFilterCount(0, 'cid-1', 'music.eth');
    useCatalogFiltersStore.getState().setMatchedFilter('cid-1', 'red');

    useCatalogFiltersStore
      .getState()
      .saveAndApplyFilters([createFilterItem('spam', { color: 'orange' }), createFilterItem('eggs', { enabled: false, top: true })] as never);

    const { filterItems, filteredCids, matchedFilters } = useCatalogFiltersStore.getState();
    expect(filterItems).toHaveLength(2);
    expect(filterItems[0].text).toBe('spam');
    expect(filterItems[0].count).toBe(1);
    expect(filterItems[0].subplebbitCounts.get('music.eth')).toBe(1);
    expect(filterItems[0].color).toBe('orange');
    expect(filterItems[1]).toMatchObject({
      text: 'eggs',
      count: 0,
      enabled: false,
      top: true,
    });
    expect(filterItems[1].subplebbitCounts).toEqual(new Map());
    expect(filteredCids).toEqual(new Set());
    expect(matchedFilters.size).toBe(0);
  });

  it('switches current boards, recalculates counts, and resets only the active board counters', async () => {
    const useCatalogFiltersStore = await loadStore();

    useCatalogFiltersStore.getState().setFilterItems([createFilterItem('spam')] as never);
    useCatalogFiltersStore.getState().setCurrentSubplebbitAddress('music.eth');
    useCatalogFiltersStore.getState().incrementFilterCount(0, 'cid-1', 'music.eth');
    useCatalogFiltersStore.getState().incrementFilterCount(0, 'cid-2', 'tech.eth');

    expect(useCatalogFiltersStore.getState().getFilteredCountForCurrentSubplebbit()).toBe(1);

    useCatalogFiltersStore.getState().setCurrentSubplebbitAddress('tech.eth');
    expect(useCatalogFiltersStore.getState().currentSubplebbitAddress).toBe('tech.eth');
    expect(useCatalogFiltersStore.getState().getFilteredCountForCurrentSubplebbit()).toBe(1);

    useCatalogFiltersStore.getState().resetCountsForCurrentSubplebbit();
    expect(useCatalogFiltersStore.getState().getFilteredCountForCurrentSubplebbit()).toBe(0);

    useCatalogFiltersStore.getState().setCurrentSubplebbitAddress('music.eth');
    expect(useCatalogFiltersStore.getState().getFilteredCountForCurrentSubplebbit()).toBe(1);

    useCatalogFiltersStore.getState().clearSearchFilter();
    expect(useCatalogFiltersStore.getState().searchText).toBe('');
  });
});
