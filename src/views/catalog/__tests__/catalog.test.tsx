import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Catalog, { type CatalogProps } from '../catalog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

type TestComment = {
  cid: string;
  content?: string;
  title?: string;
  pinned?: boolean;
  subplebbitAddress?: string;
  deleted?: boolean;
  postCid?: string;
  removed?: boolean;
  state?: string;
  timestamp?: number;
};

type FilterItem = {
  color?: string;
  count: number;
  enabled: boolean;
  filteredCids: Set<string>;
  hide: boolean;
  text: string;
  top: boolean;
};

const testState = vi.hoisted(() => ({
  account: { subscriptions: [] as string[] },
  accountComments: [] as TestComment[],
  clearMatchedFiltersMock: vi.fn(),
  directoryByAddress: {
    'music-posting.eth': {
      address: 'music-posting.eth',
      features: { postsPerPage: 2 },
    },
  } as Record<string, { address: string; features?: Record<string, unknown> }>,
  directories: [{ address: 'music-posting.eth', title: '/mu/ - Music' }] as Array<{ address: string; title?: string }>,
  feed: [] as TestComment[],
  filterItems: [] as FilterItem[],
  filteredDirectoryAddresses: ['music-posting.eth'] as string[],
  hasMore: false,
  incrementFilterCountMock: vi.fn(),
  loadMoreMock: vi.fn(),
  pageSizes: {
    guiPostsPerPage: 2,
    maxGuiPages: 3,
    paginationFeedPostsPerPage: 6,
  },
  resetMock: vi.fn(),
  resolvedSubplebbitAddress: 'music-posting.eth' as string | undefined,
  searchText: '',
  setCurrentSubplebbitAddressMock: vi.fn(),
  setMatchedFilterMock: vi.fn(),
  setResetFunctionMock: vi.fn(),
  sortType: 'new' as 'active' | 'new',
  subplebbit: {
    error: undefined as Error | undefined,
    shortAddress: 'music-posting.eth',
    state: 'ready',
    title: '/mu/ - Music',
  },
}));

function getCatalogFiltersState() {
  return {
    clearMatchedFilters: testState.clearMatchedFiltersMock,
    filterItems: testState.filterItems,
    incrementFilterCount: testState.incrementFilterCountMock,
    searchText: testState.searchText,
    setCurrentSubplebbitAddress: testState.setCurrentSubplebbitAddressMock,
    setMatchedFilter: testState.setMatchedFilterMock,
  };
}

function useCatalogFiltersStoreMock<T>(selector?: (state: ReturnType<typeof getCatalogFiltersState>) => T) {
  const state = getCatalogFiltersState();
  return selector ? selector(state) : (state as T);
}

useCatalogFiltersStoreMock.getState = getCatalogFiltersState;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@bitsocialnet/bitsocial-react-hooks', () => ({
  useAccount: () => testState.account,
  useAccountComments: () => ({ accountComments: testState.accountComments }),
  useFeed: (options: { filter?: { filter: (comment: TestComment) => boolean } }) => ({
    feed: options.filter ? testState.feed.filter((comment) => options.filter?.filter(comment)) : testState.feed,
    hasMore: testState.hasMore,
    loadMore: testState.loadMoreMock,
    reset: testState.resetMock,
  }),
  useSubplebbit: () => testState.subplebbit,
}));

vi.mock('react-virtuoso', () => ({
  Virtuoso: React.forwardRef(
    (
      {
        components,
        data = [],
        endReached,
        itemContent,
      }: {
        components?: { Footer?: React.ComponentType };
        data?: Array<TestComment[]>;
        endReached?: ((index: number) => void) | undefined;
        itemContent: (index: number, item: TestComment[]) => React.ReactNode;
      },
      ref: React.ForwardedRef<{ getState: (cb: (snapshot: { ranges: number[]; scrollTop: number }) => void) => void }>,
    ) => {
      React.useImperativeHandle(ref, () => ({
        getState: (cb) => cb({ ranges: [0], scrollTop: 24 }),
      }));

      return createElement(
        'div',
        { 'data-testid': 'virtuoso' },
        data.map((row, index) => createElement('div', { key: `row-${index}` }, itemContent(index, row))),
        endReached ? createElement('button', { 'data-testid': 'end-reached', onClick: () => endReached(data.length) }, 'end-reached') : null,
        components?.Footer ? createElement(components.Footer) : null,
      );
    },
  ),
}));

vi.mock('../../../hooks/use-catalog-feed-rows', () => ({
  default: (_columnCount: number, processedFeed: TestComment[]) => processedFeed.map((comment) => [comment]),
}));

vi.mock('../../../hooks/use-directories', () => ({
  useDirectories: () => testState.directories,
  useDirectoryByAddress: (address: string | undefined) => (address ? testState.directoryByAddress[address] : undefined),
}));

vi.mock('../../../hooks/use-board-feed-page-size', () => ({
  useBoardFeedPageSize: () => testState.pageSizes,
}));

vi.mock('../../../hooks/use-filtered-directory-addresses', () => ({
  useFilteredDirectoryAddresses: () => testState.filteredDirectoryAddresses,
}));

vi.mock('../../../hooks/use-resolved-subplebbit-address', () => ({
  useResolvedSubplebbitAddress: () => testState.resolvedSubplebbitAddress,
}));

vi.mock('../../../hooks/use-state-string', () => ({
  useFeedStateString: () => 'loading_feed',
}));

vi.mock('../../../hooks/use-window-width', () => ({
  default: () => 900,
}));

vi.mock('../../../stores/use-catalog-style-store', () => ({
  default: () => ({
    imageSize: 'Small',
  }),
}));

vi.mock('../../../stores/use-feed-reset-store', () => ({
  default: (selector: (state: { setResetFunction: typeof testState.setResetFunctionMock }) => unknown) =>
    selector({
      setResetFunction: testState.setResetFunctionMock,
    }),
}));

vi.mock('../../../stores/use-sorting-store', () => ({
  default: () => ({
    sortType: testState.sortType,
  }),
}));

vi.mock('../../../stores/use-catalog-filters-store', () => ({
  default: useCatalogFiltersStoreMock,
}));

vi.mock('../../../components/catalog-row', () => ({
  default: ({ row }: { row: TestComment[] }) => createElement('div', { 'data-testid': 'catalog-row' }, `row:${row.map((comment) => comment.cid).join(',')}`),
}));

vi.mock('../../../components/footer', () => ({
  CatalogFooterFirstRow: ({ subplebbitAddress }: { subplebbitAddress?: string }) =>
    createElement('div', { 'data-testid': 'catalog-first-row' }, subplebbitAddress || 'multi'),
  PageFooterDesktop: ({ firstRow }: { firstRow: React.ReactNode }) => createElement('div', { 'data-testid': 'catalog-footer-desktop' }, firstRow),
  PageFooterMobile: ({ children }: { children: React.ReactNode }) => createElement('div', { 'data-testid': 'catalog-footer-mobile' }, children),
}));

vi.mock('../../../components/board-buttons/board-buttons', () => ({
  ReturnButton: () => createElement('button', {}, 'Return'),
  ArchiveButton: () => createElement('button', {}, 'Archive'),
  TopButton: () => createElement('button', {}, 'Top'),
  RefreshButton: () => createElement('button', {}, 'Refresh'),
}));

vi.mock('../../../components/loading-ellipsis', () => ({
  default: ({ string }: { string: string }) => createElement('div', { 'data-testid': 'loading-ellipsis' }, string),
}));

vi.mock('../../../components/error-display/error-display', () => ({
  default: ({ error }: { error?: Error }) => createElement('div', { 'data-testid': 'error-display' }, error?.message || 'no-error'),
}));

vi.mock('../../../lib/utils/pattern-utils', () => ({
  commentMatchesPattern: (comment: TestComment, pattern: string) => {
    const loweredPattern = pattern.toLowerCase();
    return `${comment.title || ''} ${comment.content || ''}`.toLowerCase().includes(loweredPattern);
  },
}));

vi.mock('../../../lib/utils/catalog-sort', () => ({
  sortCatalogFeedForDisplay: (feed: TestComment[]) => feed,
}));

let container: HTMLDivElement;
let latestLocation = '';
let root: Root;

const LocationProbe = () => {
  const location = useLocation();
  React.useLayoutEffect(() => {
    latestLocation = location.pathname;
  }, [location.pathname]);
  return null;
};

const flushEffects = async (count = 5) => {
  for (let i = 0; i < count; i += 1) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
};

const renderCatalog = async ({ catalogProps, initialEntry, routePath }: { catalogProps?: CatalogProps; initialEntry: string; routePath: string }) => {
  latestLocation = initialEntry;
  await act(async () => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [initialEntry] },
        createElement(
          Routes,
          {},
          createElement(Route, { path: routePath, element: createElement(Catalog, catalogProps) }),
          createElement(Route, { path: '*', element: createElement(Catalog, catalogProps) }),
        ),
        createElement(LocationProbe),
      ),
    );
  });
  await flushEffects();
};

describe('Catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    latestLocation = '';
    testState.account = { subscriptions: [] };
    testState.accountComments = [];
    testState.directories = [{ address: 'music-posting.eth', title: '/mu/ - Music' }];
    testState.directoryByAddress = {
      'music-posting.eth': {
        address: 'music-posting.eth',
        features: { postsPerPage: 2 },
      },
    };
    testState.feed = [];
    testState.filterItems = [];
    testState.filteredDirectoryAddresses = ['music-posting.eth'];
    testState.hasMore = false;
    testState.pageSizes = {
      guiPostsPerPage: 2,
      maxGuiPages: 3,
      paginationFeedPostsPerPage: 6,
    };
    testState.resolvedSubplebbitAddress = 'music-posting.eth';
    testState.searchText = '';
    testState.sortType = 'new';
    testState.subplebbit = {
      error: undefined,
      shortAddress: 'music-posting.eth',
      state: 'ready',
      title: '/mu/ - Music',
    };
    testState.clearMatchedFiltersMock.mockReset();
    testState.incrementFilterCountMock.mockReset();
    testState.loadMoreMock.mockReset();
    testState.resetMock.mockReset();
    testState.setCurrentSubplebbitAddressMock.mockReset();
    testState.setMatchedFilterMock.mockReset();
    testState.setResetFunctionMock.mockReset();
    document.title = 'before';

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('applies catalog filters, promotes top matches, and clears board filter state on unmount', async () => {
    testState.feed = [
      { cid: 'boring-post', title: 'plain talk', content: 'nothing special', subplebbitAddress: 'music-posting.eth' },
      { cid: 'hidden-post', title: 'cats and spoilers', content: 'spoiler content', subplebbitAddress: 'music-posting.eth' },
      { cid: 'top-post', title: 'cats forever', content: 'hello world', subplebbitAddress: 'music-posting.eth' },
    ];
    testState.filterItems = [
      { count: 0, enabled: true, filteredCids: new Set(), hide: true, text: 'spoiler', top: false },
      { color: 'red', count: 0, enabled: true, filteredCids: new Set(), hide: false, text: 'cats', top: true },
    ];

    await renderCatalog({ initialEntry: '/mu/catalog', routePath: '/:boardIdentifier/catalog' });

    expect(document.title).toBe('/mu/ - catalog - 5chan');
    expect(testState.setCurrentSubplebbitAddressMock).toHaveBeenCalledWith('music-posting.eth');
    expect(testState.clearMatchedFiltersMock).toHaveBeenCalled();
    expect(Array.from(container.querySelectorAll('[data-testid="catalog-row"]')).map((element) => element.textContent)).toEqual(['row:top-post', 'row:boring-post']);
    expect(testState.incrementFilterCountMock).toHaveBeenCalledWith(0, 'hidden-post', 'music-posting.eth');
    expect(testState.incrementFilterCountMock).toHaveBeenCalledWith(1, 'top-post', 'music-posting.eth');
    expect(testState.setMatchedFilterMock).toHaveBeenCalledWith('top-post', 'red');

    act(() => root.unmount());

    expect(testState.setCurrentSubplebbitAddressMock).toHaveBeenLastCalledWith(null);
    expect(testState.clearMatchedFiltersMock).toHaveBeenCalledTimes(3);

    root = createRoot(container);
  });

  it('canonicalizes multiboard catalog paths and keeps load-more wired for infinite scrolling', async () => {
    testState.feed = [{ cid: 'all-post', title: 'one', subplebbitAddress: 'music-posting.eth' }];
    testState.hasMore = true;

    await renderCatalog({
      catalogProps: { viewType: 'all' },
      initialEntry: '/all/catalog/7',
      routePath: '/all/*',
    });

    expect(latestLocation).toBe('/all/catalog');

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="end-reached"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(testState.loadMoreMock).toHaveBeenCalledTimes(1);
  });

  it('shows the empty subscriptions state when there are no subscribed boards to browse', async () => {
    testState.account = { subscriptions: [] };

    await renderCatalog({
      catalogProps: { viewType: 'subs' },
      initialEntry: '/subs/catalog',
      routePath: '/subs/*',
    });

    expect(container.textContent).toContain('not_subscribed_to_any_board');
    expect(container.querySelector('[data-testid="catalog-first-row"]')?.textContent).toBe('music-posting.eth');
  });
});
