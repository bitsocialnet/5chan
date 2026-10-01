import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import usePinnedCatalogThreads from '../use-pinned-catalog-threads';
import useMarkPinnedThreadRead from '../use-mark-pinned-thread-read';
import usePinnedCatalogThreadsStore from '../../stores/use-pinned-catalog-threads-store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  commentsByCid: {} as Record<string, Partial<Comment>>,
  useCommentsCalls: [] as Array<{ commentCids?: string[]; autoUpdate?: boolean }>,
}));

vi.mock('@bitsocial/bitsocial-react-hooks', () => ({
  useComments: (options: { commentCids?: string[]; autoUpdate?: boolean }) => {
    testState.useCommentsCalls.push(options);
    return { comments: (options.commentCids ?? []).map((cid) => testState.commentsByCid[cid]) };
  },
}));

vi.mock('../../lib/bitsocial-internals/stores', () => ({
  accountsStore: { getState: () => ({ accounts: {}, activeAccountId: undefined, commentCidsToAccountsComments: {} }) },
}));

let container: HTMLDivElement;
let root: Root;
let pinnedPosts: Comment[] = [];

const PinnedThreadsHarness = (props: Parameters<typeof usePinnedCatalogThreads>[0]) => {
  pinnedPosts = usePinnedCatalogThreads(props);
  return null;
};

const ReadHarness = ({ post }: { post: Comment | undefined }) => {
  useMarkPinnedThreadRead(post);
  return null;
};

let pinCount = 0;
const pin = (cid: string, communityAddress = 'music-posting.eth', readReplyCount = 0) =>
  usePinnedCatalogThreadsStore.setState((state) => ({ pinnedThreads: { ...state.pinnedThreads, [cid]: { communityAddress, pinnedAt: ++pinCount, readReplyCount } } }));

describe('usePinnedCatalogThreads', () => {
  beforeEach(() => {
    testState.commentsByCid = {};
    testState.useCommentsCalls = [];
    pinnedPosts = [];
    usePinnedCatalogThreadsStore.setState({ pinnedThreads: {} });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("keeps the catalog boards' pinned threads updating and returns the ones that can show", async () => {
    pin('shown');
    pin('hidden');
    pin('filtered-out');
    pin('loading');
    pin('other-board', 'other-board.eth');
    testState.commentsByCid = {
      shown: { cid: 'shown', timestamp: 1, title: 'shown' },
      hidden: { cid: 'hidden', timestamp: 1, title: 'hidden' },
      'filtered-out': { cid: 'filtered-out', timestamp: 1, title: 'spoiler' },
      loading: { cid: 'loading' },
    };

    await act(async () => {
      root.render(
        createElement(PinnedThreadsHarness, {
          communityAddresses: ['music-posting.bso'],
          enabled: true,
          filter: (comment) => comment.title !== 'spoiler',
          hiddenCids: { hidden: true },
        }),
      );
    });

    expect(testState.useCommentsCalls.at(-1)).toEqual({ commentCids: ['shown', 'hidden', 'filtered-out', 'loading'], autoUpdate: true });
    expect(pinnedPosts.map((post) => post.cid)).toEqual(['shown']);
  });

  it('requests nothing while disabled, keeps archived and removed threads, and unpins purged ones', async () => {
    pin('archived');
    pin('removed');
    pin('purged');
    pin('moderated-purged');
    testState.commentsByCid = {
      archived: { cid: 'archived', timestamp: 1, commentModeration: { archived: true } } as Partial<Comment>,
      removed: { cid: 'removed', timestamp: 1, removed: true },
      purged: { cid: 'purged', timestamp: 1, purged: true } as Partial<Comment>,
      'moderated-purged': { cid: 'moderated-purged', timestamp: 1, commentModeration: { purged: true } } as Partial<Comment>,
    };
    const props = { communityAddresses: ['music-posting.eth'], hiddenCids: {} };

    await act(async () => {
      root.render(createElement(PinnedThreadsHarness, { ...props, enabled: false }));
    });
    expect(testState.useCommentsCalls.at(-1)).toEqual({ commentCids: [], autoUpdate: true });
    expect(Object.keys(usePinnedCatalogThreadsStore.getState().pinnedThreads)).toHaveLength(4);

    await act(async () => {
      root.render(createElement(PinnedThreadsHarness, { ...props, enabled: true }));
    });
    expect(pinnedPosts.map((post) => post.cid)).toEqual(['archived', 'removed']);
    expect(Object.keys(usePinnedCatalogThreadsStore.getState().pinnedThreads)).toEqual(['archived', 'removed']);
  });

  it('returns pinned threads in the order they were pinned', async () => {
    usePinnedCatalogThreadsStore.setState({
      pinnedThreads: {
        second: { communityAddress: 'music-posting.eth', pinnedAt: 20, readReplyCount: 0 },
        first: { communityAddress: 'music-posting.eth', pinnedAt: 10, readReplyCount: 0 },
      },
    });
    testState.commentsByCid = { first: { cid: 'first', timestamp: 1 }, second: { cid: 'second', timestamp: 2 } };

    await act(async () => {
      root.render(createElement(PinnedThreadsHarness, { communityAddresses: ['music-posting.eth'], enabled: true, hiddenCids: {} }));
    });

    expect(pinnedPosts.map((post) => post.cid)).toEqual(['first', 'second']);
  });
});

describe('useMarkPinnedThreadRead', () => {
  beforeEach(() => {
    usePinnedCatalogThreadsStore.setState({ pinnedThreads: {} });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('marks the replies of an open pinned thread read, and leaves other threads alone', async () => {
    pin('thread-1', 'music-posting.eth', 4);

    await act(async () => {
      root.render(createElement(ReadHarness, { post: { cid: 'thread-1', replyCount: 9 } as Comment }));
    });
    expect(usePinnedCatalogThreadsStore.getState().pinnedThreads['thread-1'].readReplyCount).toBe(9);

    await act(async () => {
      root.render(createElement(ReadHarness, { post: { cid: 'thread-2', replyCount: 3 } as Comment }));
    });
    expect(usePinnedCatalogThreadsStore.getState().pinnedThreads).toEqual({
      'thread-1': { communityAddress: 'music-posting.eth', pinnedAt: expect.any(Number), readReplyCount: 9 },
    });
  });
});
