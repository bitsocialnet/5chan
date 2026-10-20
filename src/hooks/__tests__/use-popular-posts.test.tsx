import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import usePopularPosts, { clearPopularPostsCacheForTest } from '../use-popular-posts';

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

vi.mock('../../stores/use-communities-loading-start-timestamps-store', () => ({
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
    communityAddress: boardAddress,
    thumbnailUrl: `https://cdn.example/${boardAddress}/${suffix}.thumb.jpg`,
    timestamp,
    title: `${suffix} title`,
  }) as never;

const createCommunity = (boardAddress: string, posts: Array<{ cid: string }>, updatedAt = 1_704_067_150) =>
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

const HookHarness = ({ addresses, communities }: { addresses: string[]; communities: Array<unknown> }) => {
  latestValue = usePopularPosts(communities as never, addresses);
  return null;
};

const renderHook = async (addresses: string[], communities: Array<unknown>) => {
  await act(async () => {
    root.render(createElement(HookHarness, { addresses, communities }));
  });
};

const resetHookRoot = () => {
  act(() => root.unmount());
  container.remove();

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
};

const mockRandomSequence = (values: number[]) => {
  let index = 0;

  return vi.spyOn(Math, 'random').mockImplementation(() => values[index++] ?? values.at(-1) ?? 0);
};

describe('usePopularPosts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.currentTime = 1_704_067_200;
    testState.loadingTimestamps = [];
    testState.requestedAddresses = undefined;
    clearPopularPostsCacheForTest();

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
      createCommunity(addresses[0], [createPost(addresses[0], 'top', 20), createPost(addresses[0], 'backup', 10)]),
      createCommunity(addresses[1], [createPost(addresses[1], 'top', 18), createPost(addresses[1], 'backup', 9)]),
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
      addresses.map((address, index) => createCommunity(address, [createPost(address, 'top', 20 - index), createPost(address, 'backup', 5 - index)])),
    );

    expect(latestValue.isLoading).toBe(false);
    expect(latestValue.popularPosts).toHaveLength(8);
    expect(new Set(latestValue.popularPosts.map((post) => post.communityAddress)).size).toBe(8);
    expect(latestValue.popularPosts.every((post) => post.cid.endsWith('-top'))).toBe(true);
  });

  it('freezes the revealed set until the input board list changes', async () => {
    const addresses = Array.from({ length: 8 }, (_, index) => `board-${index}.eth`);
    testState.loadingTimestamps = addresses.map(() => 1_704_067_180);

    await renderHook(
      addresses,
      addresses.map((address, index) => createCommunity(address, [createPost(address, 'initial', 30 - index)])),
    );

    const initialCids = latestValue.popularPosts.map((post) => post.cid);
    expect(latestValue.isLoading).toBe(false);

    await renderHook(
      addresses,
      addresses.map((address, index) => createCommunity(address, [createPost(address, 'replacement', 100 - index), createPost(address, 'initial', 30 - index)])),
    );

    expect(latestValue.isLoading).toBe(false);
    expect(latestValue.popularPosts.map((post) => post.cid)).toEqual(initialCids);
  });

  it('reveals the committed posts once the remaining boards time out', async () => {
    const addresses = ['board-0.eth', 'board-1.eth'];
    testState.loadingTimestamps = [1_704_067_180, 1_704_067_180];

    await renderHook(addresses, [createCommunity(addresses[0], [createPost(addresses[0], 'only', 12)]), undefined]);

    expect(latestValue.isLoading).toBe(true);
    expect(latestValue.popularPosts).toEqual([]);

    testState.currentTime = 1_704_067_211;
    await renderHook(addresses, [createCommunity(addresses[0], [createPost(addresses[0], 'only', 12)]), undefined]);

    expect(latestValue.isLoading).toBe(false);
    expect(latestValue.popularPosts.map((post) => post.cid)).toEqual([`${addresses[0]}-only`]);
  });

  it('waits for boards still loading instead of revealing the first eight boards to arrive', async () => {
    const addresses = Array.from({ length: 12 }, (_, index) => `board-${index}.eth`);
    testState.loadingTimestamps = addresses.map(() => 1_704_067_195);
    const quietCommunities = addresses.slice(0, 8).map((address, index) => createCommunity(address, [createPost(address, 'quiet', 8 - index)]));

    await renderHook(addresses, [...quietCommunities, undefined, undefined, undefined, undefined]);

    expect(latestValue.isLoading).toBe(true);

    const busyCommunities = addresses.slice(8).map((address, index) => createCommunity(address, [createPost(address, 'busy', 100 - index)]));
    const keepRankingRandom = mockRandomSequence([0.999_999]);
    await renderHook(addresses, [...quietCommunities, ...busyCommunities]);

    expect(latestValue.isLoading).toBe(false);
    expect(latestValue.popularPosts.slice(0, 4).map((post) => post.cid)).toEqual(addresses.slice(8).map((address) => `${address}-busy`));

    keepRankingRandom.mockRestore();
  });

  it('samples only from the most popular boards, ordered by popularity', async () => {
    const addresses = Array.from({ length: 20 }, (_, index) => `board-${index}.eth`);
    const communities = addresses.map((address, index) => createCommunity(address, [createPost(address, 'top', 40 - index)]));
    const random = mockRandomSequence([0.3, 0.9, 0.1, 0.7, 0.5, 0.2, 0.8, 0.4, 0.6, 0, 0.99, 0.35, 0.65, 0.15, 0.85]);

    await renderHook(addresses, communities);

    const replyCounts = latestValue.popularPosts.map((post) => post.replyCount as number);
    expect(latestValue.isLoading).toBe(false);
    expect(replyCounts).toHaveLength(8);
    expect(Math.min(...replyCounts)).toBeGreaterThan(40 - 16);
    expect(replyCounts).toEqual([...replyCounts].sort((a, b) => b - a));

    random.mockRestore();
  });

  it('stops waiting for a slow board once the box can be filled', async () => {
    const addresses = Array.from({ length: 9 }, (_, index) => `board-${index}.eth`);
    const loadedCommunities = addresses.slice(0, 8).map((address, index) => createCommunity(address, [createPost(address, 'top', 20 - index)]));
    testState.loadingTimestamps = addresses.map(() => 1_704_067_195);

    await renderHook(addresses, [...loadedCommunities, undefined]);

    expect(latestValue.isLoading).toBe(true);

    testState.currentTime = 1_704_067_203;
    await renderHook(addresses, [...loadedCommunities, undefined]);

    expect(latestValue.isLoading).toBe(false);
    expect(latestValue.popularPosts).toHaveLength(8);
  });

  it('takes one thread from a board listed twice', async () => {
    const addresses = ['board-0.eth', 'board-0.eth', 'board-1.eth'];
    const repeatedCommunity = createCommunity(addresses[0], [createPost(addresses[0], 'top', 20), createPost(addresses[0], 'backup', 10)]);
    testState.loadingTimestamps = addresses.map(() => 1_704_067_180);

    await renderHook(addresses, [repeatedCommunity, repeatedCommunity, createCommunity(addresses[2], [createPost(addresses[2], 'top', 5)])]);

    expect(latestValue.isLoading).toBe(false);
    expect(latestValue.popularPosts.map((post) => post.cid)).toEqual(['board-0.eth-top', 'board-1.eth-top']);
  });

  it('reads threads from whichever page a board preloads', async () => {
    const addresses = ['board-0.eth'];
    testState.loadingTimestamps = [1_704_067_180];
    const post = createPost(addresses[0], 'active-top', 9);

    await renderHook(addresses, [{ address: addresses[0], updatedAt: 1_704_067_150, posts: { pages: { active: { comments: [post] } } } }]);

    expect(latestValue.isLoading).toBe(false);
    expect(latestValue.popularPosts.map((popularPost) => popularPost.cid)).toEqual(['board-0.eth-active-top']);
  });

  it('keeps loading forever when no board ever produces a thread', async () => {
    const addresses = ['board-0.eth'];
    testState.currentTime = 1_704_067_240;
    testState.loadingTimestamps = [1_704_067_180];

    await renderHook(addresses, [undefined]);

    expect(latestValue.isLoading).toBe(true);
    expect(latestValue.popularPosts).toEqual([]);
  });

  it('keeps selected boards across remounts while the page module stays loaded', async () => {
    const addresses = Array.from({ length: 10 }, (_, index) => `board-${index}.eth`);
    const communities = addresses.map((address, index) => createCommunity(address, [createPost(address, 'top', 30 - index), createPost(address, 'backup', 10 - index)]));
    const keepOrderRandom = mockRandomSequence(Array.from({ length: addresses.length - 1 }, () => 0.999_999));

    await renderHook(addresses, communities);

    expect(latestValue.isLoading).toBe(false);
    expect(latestValue.popularPosts.map((post) => post.communityAddress)).toEqual(addresses.slice(0, 8));
    expect(latestValue.popularPosts.every((post) => post.cid.endsWith('-top'))).toBe(true);

    keepOrderRandom.mockRestore();
    resetHookRoot();

    const rotateOrderRandom = mockRandomSequence(Array.from({ length: addresses.length - 1 }, () => 0));
    await renderHook(addresses, communities);

    expect(latestValue.isLoading).toBe(false);
    expect(latestValue.popularPosts.map((post) => post.communityAddress)).toEqual(addresses.slice(0, 8));
    expect(latestValue.popularPosts.every((post) => post.cid.endsWith('-top'))).toBe(true);
    expect(rotateOrderRandom).not.toHaveBeenCalled();

    rotateOrderRandom.mockRestore();
  });

  it('recalculates popular posts after the page cache is cleared like a browser reload', async () => {
    const addresses = Array.from({ length: 10 }, (_, index) => `board-${index}.eth`);
    const initialCommunities = addresses.map((address, index) =>
      createCommunity(address, [createPost(address, 'top', 30 - index), createPost(address, 'backup', 10 - index)]),
    );
    const keepOrderRandom = mockRandomSequence(Array.from({ length: addresses.length - 1 }, () => 0.999_999));

    await renderHook(addresses, initialCommunities);

    expect(latestValue.isLoading).toBe(false);
    expect(latestValue.popularPosts.map((post) => post.communityAddress)).toEqual(addresses.slice(0, 8));
    expect(latestValue.popularPosts.every((post) => post.cid.endsWith('-top'))).toBe(true);

    keepOrderRandom.mockRestore();
    clearPopularPostsCacheForTest();
    resetHookRoot();

    const refreshedCommunities = addresses.map((address, index) => createCommunity(address, [createPost(address, 'top', 1), createPost(address, 'reload', 100 - index)]));
    const rotateOrderRandom = mockRandomSequence(Array.from({ length: addresses.length - 1 }, () => 0));
    await renderHook(addresses, refreshedCommunities);

    expect(latestValue.isLoading).toBe(false);
    expect(latestValue.popularPosts.map((post) => post.communityAddress)).toEqual(addresses.slice(1, 9));
    expect(latestValue.popularPosts.map((post) => post.cid)).toEqual(addresses.slice(1, 9).map((address) => `${address}-reload`));

    rotateOrderRandom.mockRestore();
  });
});
