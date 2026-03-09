import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePostPageNumber } from '../use-post-page-number';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  community: { address: 'music.eth', features: {} },
  feedsOptions: {} as Record<string, unknown>,
  loadedFeeds: {} as Record<string, unknown>,
  preloadFeed: undefined as Array<{ cid: string }> | undefined,
  preloadOptions: undefined as Record<string, unknown> | undefined,
  sizes: {
    guiPostsPerPage: 2,
    paginationFeedPostsPerPage: 20,
  },
}));

vi.mock('@bitsocialnet/bitsocial-react-hooks', () => ({
  useFeed: (options: Record<string, unknown> | undefined) => {
    testState.preloadOptions = options;
    return { feed: testState.preloadFeed };
  },
}));

vi.mock('@bitsocialnet/bitsocial-react-hooks/dist/stores/feeds', () => ({
  default: (selector: (state: { feedsOptions: Record<string, unknown>; loadedFeeds: Record<string, unknown> }) => unknown) =>
    selector({
      feedsOptions: testState.feedsOptions,
      loadedFeeds: testState.loadedFeeds,
    }),
}));

vi.mock('../use-directories', () => ({
  useDirectoryByAddress: () => testState.community,
}));

vi.mock('../use-board-feed-page-size', () => ({
  useBoardFeedPageSize: () => testState.sizes,
}));

let latestValue: number | undefined;
let container: HTMLDivElement;
let root: Root;

const HookHarness = ({ enabled = true, postCid, subplebbitAddress }: { enabled?: boolean; postCid?: string; subplebbitAddress?: string }) => {
  latestValue = usePostPageNumber({ enabled, postCid, subplebbitAddress });
  return null;
};

const renderHook = (props: { enabled?: boolean; postCid?: string; subplebbitAddress?: string }) => {
  act(() => {
    root.render(createElement(HookHarness, props));
  });

  return latestValue;
};

describe('usePostPageNumber', () => {
  beforeEach(() => {
    latestValue = undefined;
    testState.community = { address: 'music.eth', features: {} };
    testState.feedsOptions = {};
    testState.loadedFeeds = {};
    testState.preloadFeed = undefined;
    testState.preloadOptions = undefined;
    testState.sizes = {
      guiPostsPerPage: 2,
      paginationFeedPostsPerPage: 20,
    };

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('returns the cached board page when the post already exists in loaded feeds', () => {
    testState.feedsOptions = {
      boardFeed: {
        sortType: 'active',
        subplebbitAddresses: ['music.eth'],
      },
    };
    testState.loadedFeeds = {
      boardFeed: [{ cid: 'post-1' }, { cid: 'post-2' }, { cid: 'post-3' }],
    };

    expect(renderHook({ postCid: 'post-3', subplebbitAddress: 'music.eth' })).toBe(2);
    expect(testState.preloadOptions).toEqual({
      postsPerPage: 20,
      sortType: 'active',
      subplebbitAddresses: ['music.eth'],
    });
  });

  it('falls back to the preloaded feed when cached feeds do not contain the post yet', () => {
    testState.preloadFeed = [{ cid: 'post-1' }, { cid: 'post-2' }, { cid: 'post-3' }, { cid: 'post-4' }];

    expect(renderHook({ postCid: 'post-4', subplebbitAddress: 'music.eth' })).toBe(2);
    expect(testState.preloadOptions).toEqual({
      postsPerPage: 20,
      sortType: 'active',
      subplebbitAddresses: ['music.eth'],
    });
  });

  it('skips resolution entirely when the hook is disabled or required inputs are missing', () => {
    testState.preloadFeed = [{ cid: 'post-1' }];

    expect(renderHook({ enabled: false, postCid: 'post-1', subplebbitAddress: 'music.eth' })).toBeUndefined();
    expect(testState.preloadOptions).toBeUndefined();

    expect(renderHook({ enabled: true, postCid: undefined, subplebbitAddress: 'music.eth' })).toBeUndefined();
    expect(testState.preloadOptions).toBeUndefined();
  });
});
