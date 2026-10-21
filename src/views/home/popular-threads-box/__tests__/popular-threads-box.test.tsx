import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFeedStateString } from '../../../../hooks/use-state-string';
import usePopularPosts from '../../../../hooks/use-popular-posts';
import { getProviderPopularPosts, getStatsProviderSnapshot } from '../../../../lib/stats-provider-snapshot';
import useStatsProvidersStore from '../../../../stores/use-stats-providers-store';
import PopularThreadsBox from '../popular-threads-box';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  communities: [] as unknown[],
  feedStateString: 'Downloading boards',
  isLoading: false,
  requestedCommunityIdentifiers: [] as string[][],
  requestedCommunities: [] as unknown[][],
  revealedPopularPosts: undefined as
    | Array<{
        cid: string;
        communityAddress: string;
        content: string;
        link: string;
        thumbnailUrl: string;
        title: string;
      }>
    | undefined,
  popularPosts: [] as Array<{
    cid: string;
    communityAddress: string;
    content: string;
    link: string;
    thumbnailUrl: string;
    title: string;
  }>,
  providerPopularPosts: [] as unknown[],
  providerSnapshot: null as unknown,
  account: { id: 'account' } as unknown,
}));

// The app requests each result once, so every render reads the same promise.
const requests = new Map<unknown, Promise<unknown>>();
const request = (value: unknown) => {
  if (!requests.has(value)) requests.set(value, Promise.resolve(value));
  return requests.get(value);
};

vi.mock('../../../../lib/stats-provider-snapshot', () => ({
  getStatsProviderSnapshot: vi.fn(() => request(testState.providerSnapshot)),
  getProviderPopularPosts: vi.fn(() => request(testState.providerPopularPosts)),
}));

vi.mock('../../../../lib/stats-provider-verification', () => ({
  verifyProviderThread: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@bitsocial/bitsocial-react-hooks', () => ({
  useAccount: () => testState.account,
  useCommunities: ({ communities }: { communities: unknown[] }) => {
    testState.requestedCommunities.push(communities);
    return { communities: testState.communities };
  },
}));

vi.mock('../../../../hooks/use-community-identifiers', () => ({
  useCommunityIdentifiers: (addresses?: string[]) => {
    testState.requestedCommunityIdentifiers.push(addresses || []);
    return (addresses || []).map((address) => ({ name: address, publicKey: `${address}-key` }));
  },
}));

vi.mock('../../../../hooks/use-state-string', () => ({
  useFeedStateString: vi.fn(() => testState.feedStateString),
}));

vi.mock('../../../../hooks/use-popular-posts', () => ({
  getRevealedPopularPosts: vi.fn(() => testState.revealedPopularPosts),
  default: vi.fn(() => ({
    error: null,
    isLoading: testState.isLoading,
    popularPosts: testState.popularPosts,
  })),
}));

vi.mock('../../../../components/catalog-row', () => ({
  CatalogPostMedia: ({ cid }: { cid: string }) => createElement('div', { 'data-testid': 'popular-thread-media' }, cid),
}));

vi.mock('../../box-modal', () => ({
  default: () => createElement('button', { 'aria-label': 'filters' }),
}));

const directories = [
  { address: 'music-posting.eth', title: '/mu/ - Music' },
  { address: 'tech-posting.eth', title: '/g/ - Technology' },
  { address: 'tv-posting.eth', title: '/tv/ - Television & Film Directory' },
];

let container: HTMLDivElement;
let root: Root;

const renderPopularThreadsBox = async () => {
  await act(async () => {
    root.render(createElement(MemoryRouter, {}, createElement(PopularThreadsBox, { directories, directoryAddresses: directories.map((entry) => entry.address) })));
  });
};

describe('PopularThreadsBox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requests.clear();
    testState.communities = directories.map((entry) => ({ address: entry.address }));
    testState.feedStateString = 'Downloading boards';
    testState.isLoading = false;
    testState.requestedCommunityIdentifiers = [];
    testState.requestedCommunities = [];
    testState.revealedPopularPosts = undefined;
    testState.providerPopularPosts = [];
    testState.providerSnapshot = null;
    testState.account = { id: 'account' };
    useStatsProvidersStore.setState({ usePureP2PStats: false });
    testState.popularPosts = [
      {
        cid: 'thread-1',
        communityAddress: 'music-posting.eth',
        content: 'thread content',
        link: 'https://cdn.example/thread-1.jpg',
        thumbnailUrl: 'https://cdn.example/thread-1-thumb.jpg',
        title: 'thread title',
      },
    ];

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('does not subscribe to feed state once popular threads are visible', async () => {
    await renderPopularThreadsBox();

    expect(container.textContent).toContain('Music');
    expect(container.textContent).toContain('thread title');
    expect(vi.mocked(useFeedStateString)).not.toHaveBeenCalled();
  });

  it('does not subscribe to board communities once the popular posts cache is revealed', async () => {
    testState.revealedPopularPosts = testState.popularPosts;

    await renderPopularThreadsBox();

    expect(testState.requestedCommunityIdentifiers.at(-1)).toEqual([]);
    expect(testState.requestedCommunities).toEqual([[]]);
    expect(container.textContent).toContain('thread title');
  });

  it('preserves literal preview markers without applying body markdown styles', async () => {
    testState.popularPosts = [
      {
        cid: 'thread-markers',
        communityAddress: 'music-posting.eth',
        content: '>we got 5chan before Half Life 3\n*poisons u*',
        link: 'https://cdn.example/thread-markers.jpg',
        thumbnailUrl: 'https://cdn.example/thread-markers-thumb.jpg',
        title: '',
      },
    ];

    await renderPopularThreadsBox();

    expect(container.textContent).toContain('>we got 5chan before Half Life 3');
    expect(container.textContent).toContain('*poisons u*');
    expect(container.querySelector('.greentext')).toBeNull();
    expect(container.querySelector('.spoilertext')).toBeNull();
  });

  it('does not show a stale directory suffix in board titles', async () => {
    testState.popularPosts = [
      {
        cid: 'thread-tv',
        communityAddress: 'tv-posting.eth',
        content: 'thread content',
        link: 'https://cdn.example/thread-tv.jpg',
        thumbnailUrl: 'https://cdn.example/thread-tv-thumb.jpg',
        title: '',
      },
    ];

    await renderPopularThreadsBox();

    expect(container.textContent).toContain('Television & Film');
    expect(container.textContent).not.toContain('Television & Film Directory');
  });

  it('shows verified provider threads without loading the boards over P2P', async () => {
    testState.providerSnapshot = { boards: new Map(), generatedAt: 1, providerId: 'stats-bitsocial-net' };
    testState.providerPopularPosts = [{ ...testState.popularPosts[0], cid: 'provider-thread', title: 'provider thread title' }];

    await renderPopularThreadsBox();

    expect(container.textContent).toContain('provider thread title');
    expect(vi.mocked(getProviderPopularPosts)).toHaveBeenCalledWith(
      testState.providerSnapshot,
      directories.map((entry) => ({ address: entry.address, publicKey: `${entry.address}-key` })),
      expect.any(Function),
    );
    expect(vi.mocked(usePopularPosts)).not.toHaveBeenCalled();
    expect(testState.requestedCommunities).toEqual([]);
  });

  it('waits for the account before verifying provider threads', async () => {
    testState.providerSnapshot = { boards: new Map(), generatedAt: 1, providerId: 'stats-bitsocial-net' };
    testState.account = undefined;

    await renderPopularThreadsBox();

    expect(vi.mocked(getProviderPopularPosts)).not.toHaveBeenCalled();
    expect(vi.mocked(usePopularPosts)).not.toHaveBeenCalled();
    expect(container.textContent).toContain('loading');
  });

  it('falls back to P2P when the provider has no usable threads', async () => {
    testState.providerSnapshot = { boards: new Map(), generatedAt: 1, providerId: 'stats-bitsocial-net' };

    await renderPopularThreadsBox();

    expect(container.textContent).toContain('thread title');
    expect(vi.mocked(usePopularPosts)).toHaveBeenCalled();
  });

  it('falls back to P2P when no stats provider answers', async () => {
    await renderPopularThreadsBox();

    expect(vi.mocked(getProviderPopularPosts)).not.toHaveBeenCalled();
    expect(container.textContent).toContain('thread title');
    expect(testState.requestedCommunities.at(-1)).toEqual(directories.map((entry) => ({ name: entry.address, publicKey: `${entry.address}-key` })));
  });

  it('does not contact a stats provider in pure P2P mode', async () => {
    useStatsProvidersStore.setState({ usePureP2PStats: true });

    await renderPopularThreadsBox();

    expect(vi.mocked(getStatsProviderSnapshot)).not.toHaveBeenCalled();
    expect(container.textContent).toContain('thread title');
  });

  it('subscribes to feed state only while popular threads are loading', async () => {
    testState.isLoading = true;
    testState.popularPosts = [];

    await renderPopularThreadsBox();

    expect(container.textContent).toContain('Downloading boards');
    expect(vi.mocked(useFeedStateString)).toHaveBeenCalledWith(['music-posting.eth', 'tech-posting.eth', 'tv-posting.eth']);
  });
});
