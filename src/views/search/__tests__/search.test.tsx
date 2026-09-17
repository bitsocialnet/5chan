import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetIndexedBoardsForTests } from '../../../hooks/use-indexed-boards';
import { clearIndexerSearch } from '../../../lib/search-indexer';
import { DEFAULT_SEARCH_QUERY } from '../../../lib/search-navigation';
import { getSearchProviderChain } from '../../../lib/search-providers';
import useSearchProviderStore from '../../../stores/use-search-provider-store';
import useSearchSummaryStore from '../../../stores/use-search-summary-store';
import Search from '../search';
import SearchDirectory from '../../search-directory';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  directories: [{ address: 'music-posting.bso', directoryCode: 'mu', title: '/mu/ - Music' }],
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => (values ? `${key}:${JSON.stringify(values)}` : key),
  }),
}));

vi.mock('../../../hooks/use-directories', async () => {
  const actual = await vi.importActual<typeof import('../../../hooks/use-directories')>('../../../hooks/use-directories');
  return {
    ...actual,
    useDirectories: () => testState.directories,
  };
});

/** The indexer's board list, answered alongside the search on every provider call. */
const indexedBoards = [
  { address: 'music-posting.bso', description: null, nsfw: 0, post_count: 50, title: '/mu/ - Music' },
  { address: 'torrents-posting.bso', description: null, nsfw: 1, post_count: 4, title: 'Torrents' },
];

const getSearchCalls = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/search'));

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid='location'>{location.pathname + location.search}</output>;
};

let container: HTMLDivElement;
let root: Root;

/** MemoryRouter keeps its first entries, so a second route in one test needs a fresh root. */
const remount = () => {
  act(() => root.unmount());
  root = createRoot(container);
};

const renderRoute = async (entry: string | { pathname: string; search?: string; state?: unknown }) => {
  await act(async () => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [entry] },
        createElement(
          React.Fragment,
          {},
          createElement(
            Routes,
            {},
            createElement(Route, { path: '/search', element: createElement(Search) }),
            createElement(Route, { path: '/search/catalog', element: createElement(Search) }),
            createElement(Route, { path: '/search/directory', element: createElement(SearchDirectory) }),
          ),
          createElement(LocationProbe),
        ),
      ),
    );
    await Promise.resolve();
  });
};

describe('archive search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    __resetIndexedBoardsForTests();
    useSearchProviderStore.setState({ selectedProviderId: '5archive' });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('renders a matched reply under its thread OP with the regular post components', async () => {
    const query = `hello-${Date.now()}`;
    const matchedReply = {
      archived: 1,
      author_address: null,
      author_name: 'Archive Anon',
      cid: 'reply-cid',
      community_address: 'music-posting.bso',
      content: 'A preserved reply',
      deleted: 0,
      depth: 1,
      indexed_at: 1_700_000_100,
      parent_cid: 'post-cid',
      post_cid: 'post-cid',
      raw: JSON.stringify({ comment: {}, commentUpdate: { number: 42 } }),
      removed: 0,
      reply_count: 0,
      timestamp: 1_700_000_000,
      title: null,
    };
    const threadPost = { ...matchedReply, cid: 'post-cid', content: 'The thread OP', depth: 0, parent_cid: null, title: 'Thread subject' };
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        json: async () =>
          url.includes('/api/posts/')
            ? { post: threadPost }
            : url.includes('/api/communities')
              ? { communities: indexedBoards }
              : { query, page: 1, limit: 25, total: 1, posts: [matchedReply] },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await renderRoute(`/search?q=${encodeURIComponent(query)}`);

    await vi.waitFor(() => expect(container.textContent).toContain('A preserved reply'));
    // The matched reply is shown inside its thread.
    expect(container.textContent).toContain('The thread OP');
    expect(container.textContent).toContain('Thread subject');
    // Post components render the post number, the archived icon and a board link, like the board views do.
    expect(container.textContent).toContain('Archive Anon');
    expect(container.textContent).toContain('42');
    expect(container.querySelector<HTMLImageElement>('img[title="archived"]')).toBeTruthy();
    expect(container.querySelector<HTMLAnchorElement>('a[href="/mu"]')).toBeTruthy();
    expect(container.querySelector<HTMLAnchorElement>('a[href="/mu/thread/reply-cid"]')).toBeTruthy();
    // The query travels in the router state, not in the provider directory URL.
    expect(container.querySelector<HTMLAnchorElement>('a[href="/search/directory"]')).toBeTruthy();
    // The provider attribution moved to the board header, which this test does not render.
    expect(container.textContent).not.toContain('results_provided_by');
  });

  it('renders a matched thread OP on its own, without its replies', async () => {
    const query = `op-${Date.now()}`;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        query,
        page: 1,
        limit: 25,
        total: 1,
        posts: [
          {
            archived: 0,
            author_address: null,
            author_name: null,
            cid: 'post-cid',
            community_address: 'music-posting.bso',
            content: 'A preserved thread',
            deleted: 0,
            depth: 0,
            indexed_at: 1_700_000_100,
            parent_cid: null,
            post_cid: 'post-cid',
            removed: 0,
            reply_count: 3,
            timestamp: 1_700_000_000,
            title: null,
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderRoute(`/search?q=${encodeURIComponent(query)}`);

    await vi.waitFor(() => expect(container.textContent).toContain('A preserved thread'));
    // The view hands the store publisher to getIndexerSearch; the board header reads the summary from it.
    await vi.waitFor(() => expect(useSearchSummaryStore.getState()).toMatchObject({ query, status: 'answered', total: 1 }));
    // Only the search request: an OP match needs no thread lookup.
    expect(getSearchCalls(fetchMock)).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/posts/'))).toBe(false);
  });

  it('shows the matched threads as catalog tiles, one tile per thread', async () => {
    const query = `catalog-${Date.now()}`;
    const matchedReply = {
      archived: 0,
      author_address: null,
      author_name: null,
      cid: 'reply-cid',
      community_address: 'music-posting.bso',
      content: 'A preserved reply',
      deleted: 0,
      depth: 1,
      indexed_at: 1_700_000_100,
      parent_cid: 'post-cid',
      post_cid: 'post-cid',
      removed: 0,
      reply_count: 0,
      timestamp: 1_700_000_000,
      title: null,
    };
    const otherReply = { ...matchedReply, cid: 'other-reply-cid', content: 'Another preserved reply' };
    const threadPost = { ...matchedReply, cid: 'post-cid', content: 'The thread OP', depth: 0, parent_cid: null, reply_count: 2, title: 'Thread subject' };
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        json: async () => (url.includes('/api/posts/') ? { post: threadPost } : { query, page: 1, limit: 25, total: 2, posts: [matchedReply, otherReply] }),
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await renderRoute({ pathname: '/search/catalog', search: `?q=${encodeURIComponent(query)}` });

    await vi.waitFor(() => expect(container.textContent).toContain('Thread subject'));
    // Both matches belong to the same thread, so the catalog shows it once.
    expect(container.querySelectorAll('a[href="/mu/thread/post-cid"]').length).toBe(1);
    // The catalog links back to the search results.
    expect(container.querySelector<HTMLAnchorElement>(`a[href="/search?q=${encodeURIComponent(query)}"]`)).toBeTruthy();
  });

  it('searches for 5chan when the url carries no query', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ query: '5chan', page: 1, limit: 25, total: 0, posts: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await renderRoute('/search');

    // The url is normalized so links, the header and the field all show the query being searched.
    await vi.waitFor(() => expect(container.querySelector('[data-testid="location"]')?.textContent).toBe('/search?q=5chan'));
    expect(getSearchCalls(fetchMock)[0][0]).toContain('q=5chan');
  });

  it('lists the boards the query matched above the posts, from the directories and the indexer alike', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        json: async () => (url.includes('/api/communities') ? { communities: indexedBoards } : { query: 'music', page: 1, limit: 25, total: 0, posts: [] }),
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await renderRoute('/search?q=music');

    // The directory board is local, so it is listed before the indexer has answered anything.
    const boardLink = container.querySelector<HTMLAnchorElement>('table a[href="/mu"]');
    expect(boardLink?.textContent).toBe('/mu/');
    expect(container.querySelector('table')?.textContent).toContain('Music');
    expect(container.querySelector('table')?.textContent).toContain('music-posting.bso');
    // The posts still load and report their own outcome underneath.
    await vi.waitFor(() => expect(container.textContent).toContain('search_no_results'));
    expect(container.querySelector('table')?.compareDocumentPosition(container.querySelector('[class*="empty"]')!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(fetchMock.mock.calls.some(([url]) => String(url) === 'https://api.5archive.org/api/communities')).toBe(true);
  });

  it('lists a board only the indexer knows, flagged when it is nsfw', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        json: async () => (url.includes('/api/communities') ? { communities: indexedBoards } : { query: 'torrents', page: 1, limit: 25, total: 0, posts: [] }),
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await renderRoute('/search?q=torrents');

    await vi.waitFor(() => expect(container.querySelector<HTMLAnchorElement>('table a[href="/torrents-posting.bso"]')).toBeTruthy());
    const row = container.querySelector<HTMLAnchorElement>('table a[href="/torrents-posting.bso"]')?.closest('tr');
    expect(row?.textContent).toContain('Torrents');
    expect(row?.textContent).toContain('(NSFW)');
  });

  it('offers a typed address that no list knows as a board row, and reveals the rest of a long list on demand', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        json: async () => (url.includes('/api/communities') ? { communities: [] } : { query: 'x', page: 1, limit: 25, total: 0, posts: [] }),
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await renderRoute('/search?q=unlisted-board.bso');

    const unlistedLink = container.querySelector<HTMLAnchorElement>('table a[href="/unlisted-board.bso"]');
    expect(unlistedLink?.textContent).toBe('unlisted-board.bso');
    expect(container.querySelectorAll('table tbody tr')).toHaveLength(1);

    // Seven directory boards share a made-up word no real list carries; five show, two wait behind the button.
    testState.directories = [
      ...testState.directories,
      ...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((code) => ({
        address: `${code}-zzsynthetic.bso`,
        directoryCode: code,
        title: `/${code}/ - Zzsynthetic ${code.toUpperCase()}`,
      })),
    ];
    try {
      remount();
      await renderRoute('/search?q=zzsynthetic');
      expect(container.querySelectorAll('table tbody tr')).toHaveLength(5);
      const showMore = [...container.querySelectorAll('button')].find((button) => button.textContent?.startsWith('search_more_boards'));
      expect(showMore?.textContent).toBe('search_more_boards:{"count":2}');

      await act(async () => {
        showMore?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      });
      expect(container.querySelectorAll('table tbody tr')).toHaveLength(7);
      expect([...container.querySelectorAll('button')].some((button) => button.textContent?.startsWith('search_more_boards'))).toBe(false);

      // A new query starts collapsed again.
      remount();
      await renderRoute('/search?q=zzsyn');
      expect(container.querySelectorAll('table tbody tr')).toHaveLength(5);
    } finally {
      testState.directories = testState.directories.slice(0, 1);
    }
  });

  it('paints the searched terms over the board table and the posts, but not the page chrome, when opened without a query', async () => {
    class FakeHighlight {
      ranges: Range[];
      constructor(...ranges: Range[]) {
        this.ranges = ranges;
      }
    }
    const highlights = new Map<string, FakeHighlight>();
    vi.stubGlobal('Highlight', FakeHighlight);
    vi.stubGlobal('CSS', { highlights });
    const post = {
      archived: 0,
      author_address: null,
      author_name: null,
      cid: 'post-cid',
      community_address: 'music-posting.bso',
      content: 'A thread about 5chan itself',
      deleted: 0,
      depth: 0,
      indexed_at: 1_700_000_100,
      parent_cid: null,
      post_cid: 'post-cid',
      removed: 0,
      reply_count: 0,
      timestamp: 1_700_000_000,
      title: null,
    };
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        json: async () =>
          url.includes('/api/communities')
            ? { communities: [{ address: '5chan-feedback.bso', description: null, nsfw: 0, post_count: 6, title: '/q/ - 5chan Feedback' }] }
            : { query: '5chan', page: 1, limit: 25, total: 1, posts: [post] },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    // The default query is shared with the redirect test above, and searches are cached per query.
    clearIndexerSearch(getSearchProviderChain('5archive'), DEFAULT_SEARCH_QUERY, 1);

    // The boards bar links here with no query; the page redirects to the default one on the same route.
    await renderRoute('/search');

    await vi.waitFor(() => expect(container.textContent).toContain('A thread about 5chan itself'));
    await vi.waitFor(() => expect(container.textContent).toContain('5chan Feedback'));
    await vi.waitFor(() => {
      const painted = highlights.get('search-match')?.ranges.map((range) => range.toString()) ?? [];
      expect(painted.filter((text) => text.toLowerCase() === '5chan').length).toBeGreaterThanOrEqual(3);
    });
    // Every painted range sits in a result region: the table or the feed, never the footer's link to /search.
    const ranges = highlights.get('search-match')?.ranges ?? [];
    expect(ranges.every((range) => (range.startContainer.parentElement as HTMLElement | null)?.closest('[data-search-highlight]'))).toBe(true);
    expect(ranges.some((range) => (range.startContainer.parentElement as HTMLElement | null)?.closest('table'))).toBe(true);
  });

  it('shows no board table when nothing matched a plain word', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        json: async () => (url.includes('/api/communities') ? { communities: indexedBoards } : { query: 'bitcoin', page: 1, limit: 25, total: 0, posts: [] }),
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await renderRoute('/search?q=bitcoin');

    await vi.waitFor(() => expect(container.textContent).toContain('search_no_results'));
    expect(container.querySelector('table')).toBeNull();
  });

  it('lists the current provider in the provider directory and returns to the search it came from', async () => {
    await renderRoute({ pathname: '/search/directory', state: { returnPath: '/search?q=archive' } });

    expect(container.textContent).toContain('5archive.org');
    expect(container.textContent).toContain('current_provider');
    // The selected provider has no [use] action, the way board directories mark their current board.
    expect([...container.querySelectorAll('button')].some((button) => button.textContent === 'use')).toBe(false);
    // It is laid out like the board directories, with their button rows and footer.
    expect([...container.querySelectorAll('button')].some((button) => button.textContent === 'bottom')).toBe(true);
    expect(container.querySelector<HTMLAnchorElement>('a[href="/search?q=archive"]')).toBeTruthy();
  });

  it('returns to the plain search when the provider directory is opened directly', async () => {
    await renderRoute('/search/directory');

    expect(container.querySelector<HTMLAnchorElement>('a[href="/search"]')).toBeTruthy();
  });

  it('submits a new query into the URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ query: 'first', page: 1, limit: 25, total: 0, posts: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await renderRoute('/search?q=first');
    await vi.waitFor(() => expect(container.textContent).toContain('search_no_results'));

    const input = container.querySelector<HTMLInputElement>('input[type="text"]');
    await act(async () => {
      if (input) input.value = 'second query';
      input?.form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe('/search?q=second+query');
  });
});
