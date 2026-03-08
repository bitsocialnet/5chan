import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import usePopularPosts from '../use-popular-posts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  currentTime: 1_704_067_200,
  loadingTimestamps: [] as number[],
  requestedAddresses: undefined as string[] | undefined,
}));

vi.mock('../use-current-time', () => ({
  useCurrentTime: () => testState.currentTime,
}));

vi.mock('../../stores/use-subplebbits-loading-start-timestamps-store', () => ({
  default: (addresses?: string[]) => {
    testState.requestedAddresses = addresses;
    return testState.loadingTimestamps;
  },
}));

vi.mock('../../lib/utils/media-utils', () => ({
  getCommentMediaInfo: (link: string) => ({ link }),
  getHasThumbnail: (_commentMediaInfo: unknown, link?: string) => Boolean(link),
}));

let latestValue: ReturnType<typeof usePopularPosts>;
let container: HTMLDivElement;
let root: Root;

const createPost = (boardAddress: string, suffix: string, replyCount: number, timestamp = 1_704_067_000) =>
  ({
    cid: `${boardAddress}-${suffix}`,
    content: `${suffix} content`,
    link: `https://cdn.example/${boardAddress}/${suffix}.jpg`,
    replyCount,
    subplebbitAddress: boardAddress,
    thumbnailUrl: `https://cdn.example/${boardAddress}/${suffix}.thumb.jpg`,
    timestamp,
    title: `${suffix} title`,
  }) as never;

const createSubplebbit = (boardAddress: string, posts: Array<{ cid: string }>, updatedAt = 1_704_067_150) =>
  ({
    address: boardAddress,
    updatedAt,
    posts: {
      pages: {
        hot: {
          comments: Object.fromEntries(posts.map((post: { cid: string }) => [post.cid, post])),
        },
      },
    },
  }) as never;

const HookHarness = ({ addresses, subplebbits }: { addresses: string[]; subplebbits: Array<unknown> }) => {
  latestValue = usePopularPosts(subplebbits as never, addresses);
  return null;
};

const renderHook = async (addresses: string[], subplebbits: Array<unknown>) => {
  await act(async () => {
    root.render(createElement(HookHarness, { addresses, subplebbits }));
  });
};

describe('usePopularPosts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.currentTime = 1_704_067_200;
    testState.loadingTimestamps = [];
    testState.requestedAddresses = undefined;

    latestValue = {
      error: null,
      isLoading: true,
      popularPosts: [],
    };

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('keeps the box loading until eight unique boards can supply eight posts', async () => {
    const addresses = Array.from({ length: 8 }, (_, index) => `board-${index}.eth`);
    testState.loadingTimestamps = addresses.map(() => 1_704_067_180);

    await renderHook(addresses, [
      createSubplebbit(addresses[0], [createPost(addresses[0], 'top', 20), createPost(addresses[0], 'backup', 10)]),
      createSubplebbit(addresses[1], [createPost(addresses[1], 'top', 18), createPost(addresses[1], 'backup', 9)]),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);

    expect(testState.requestedAddresses).toEqual(addresses);
    expect(latestValue.isLoading).toBe(true);
    expect(latestValue.popularPosts).toEqual([]);

    await renderHook(
      addresses,
      addresses.map((address, index) => createSubplebbit(address, [createPost(address, 'top', 20 - index), createPost(address, 'backup', 5 - index)])),
    );

    expect(latestValue.isLoading).toBe(false);
    expect(latestValue.popularPosts).toHaveLength(8);
    expect(new Set(latestValue.popularPosts.map((post) => post.subplebbitAddress)).size).toBe(8);
    expect(latestValue.popularPosts.every((post) => post.cid.endsWith('-top'))).toBe(true);
  });

  it('freezes the revealed set until the input board list changes', async () => {
    const addresses = Array.from({ length: 8 }, (_, index) => `board-${index}.eth`);
    testState.loadingTimestamps = addresses.map(() => 1_704_067_180);

    await renderHook(
      addresses,
      addresses.map((address, index) => createSubplebbit(address, [createPost(address, 'initial', 30 - index)])),
    );

    const initialCids = latestValue.popularPosts.map((post) => post.cid);
    expect(latestValue.isLoading).toBe(false);

    await renderHook(
      addresses,
      addresses.map((address, index) => createSubplebbit(address, [createPost(address, 'replacement', 100 - index), createPost(address, 'initial', 30 - index)])),
    );

    expect(latestValue.isLoading).toBe(false);
    expect(latestValue.popularPosts.map((post) => post.cid)).toEqual(initialCids);
  });

  it('reveals the committed posts once the remaining boards time out', async () => {
    const addresses = ['board-0.eth', 'board-1.eth'];
    testState.loadingTimestamps = [1_704_067_180, 1_704_067_180];

    await renderHook(addresses, [createSubplebbit(addresses[0], [createPost(addresses[0], 'only', 12)]), undefined]);

    expect(latestValue.isLoading).toBe(true);
    expect(latestValue.popularPosts).toEqual([]);

    testState.currentTime = 1_704_067_211;
    await renderHook(addresses, [createSubplebbit(addresses[0], [createPost(addresses[0], 'only', 12)]), undefined]);

    expect(latestValue.isLoading).toBe(false);
    expect(latestValue.popularPosts.map((post) => post.cid)).toEqual([`${addresses[0]}-only`]);
  });

  it('keeps loading forever when no board ever produces a thread', async () => {
    const addresses = ['board-0.eth'];
    testState.currentTime = 1_704_067_240;
    testState.loadingTimestamps = [1_704_067_180];

    await renderHook(addresses, [undefined]);

    expect(latestValue.isLoading).toBe(true);
    expect(latestValue.popularPosts).toEqual([]);
  });
});
