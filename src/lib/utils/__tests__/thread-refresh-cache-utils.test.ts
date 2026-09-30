import { beforeEach, describe, expect, it, vi } from 'vitest';

type CommentsStoreState = {
  comments: Record<string, { updatingState?: string }>;
  errors: Record<string, Error[]>;
  stopCommentAutoUpdate: (commentCid: string, subscriberId: string) => Promise<void>;
};

const testState = vi.hoisted(() => ({
  commentsStoreListeners: new Set<(state: CommentsStoreState) => void>(),
  commentsStoreState: { comments: {}, errors: {} } as unknown as CommentsStoreState,
  stopCommentAutoUpdateMock: vi.fn(async () => undefined),
  updateFeedsMock: vi.fn(),
  commentsRemoveItemMock: vi.fn(),
  repliesPagesRemoveItemMock: vi.fn(),
  repliesPagesState: {
    comments: {} as Record<string, unknown>,
    repliesPages: {} as Record<string, { comments?: Array<{ cid?: string }>; nextCid?: string }>,
  },
  repliesPagesSetStateMock: vi.fn(),
}));

vi.mock('../../bitsocial-internals/utils', () => ({
  localForageLru: {
    createInstance: ({ name }: { name: string }) => {
      if (name === 'bitsocialReactHooks-comments') {
        return {
          removeItem: testState.commentsRemoveItemMock,
        };
      }
      return {
        removeItem: testState.repliesPagesRemoveItemMock,
      };
    },
  },
}));

vi.mock('../../bitsocial-internals/stores', () => ({
  commentsStore: {
    getState: () => testState.commentsStoreState,
    subscribe: (listener: (state: CommentsStoreState) => void) => {
      testState.commentsStoreListeners.add(listener);
      return () => testState.commentsStoreListeners.delete(listener);
    },
  },
  repliesStore: {
    getState: () => ({ updateFeeds: testState.updateFeedsMock }),
  },
  repliesPagesStore: {
    getState: () => testState.repliesPagesState,
    setState: (updater: (state: typeof testState.repliesPagesState) => Partial<typeof testState.repliesPagesState>) => {
      testState.repliesPagesSetStateMock(updater);
      const nextState = updater(testState.repliesPagesState);
      testState.repliesPagesState = {
        ...testState.repliesPagesState,
        ...nextState,
      };
    },
  },
}));

import { evictThreadRefreshCaches, refreshCommentOnce, syncThreadRepliesFeeds } from '../thread-refresh-cache-utils';

describe('thread-refresh-cache-utils', () => {
  beforeEach(() => {
    testState.commentsRemoveItemMock.mockReset();
    testState.repliesPagesRemoveItemMock.mockReset();
    testState.repliesPagesSetStateMock.mockClear();
    testState.repliesPagesState = {
      comments: {
        'reply-a': { cid: 'reply-a' },
        'reply-b': { cid: 'reply-b' },
        'reply-c': { cid: 'reply-c' },
        'reply-d': { cid: 'reply-d' },
        unrelated: { cid: 'unrelated' },
      },
      repliesPages: {
        'page-old-1': { comments: [{ cid: 'reply-a' }], nextCid: 'page-old-2' },
        'page-old-2': { comments: [{ cid: 'reply-b' }] },
        'page-old-inline-next': { comments: [{ cid: 'reply-c' }] },
        'page-empty-1': { comments: [{ cid: 'reply-d' }] },
        unrelated: { comments: [{ cid: 'unrelated' }] },
      },
    };
  });

  it('evicts the current thread comment and its persisted reply page chain only', async () => {
    await evictThreadRefreshCaches([
      {
        cid: 'thread-cid',
        replies: {
          pageCids: {
            old: 'page-old-1',
            empty: 'page-empty-1',
          },
          pages: {
            old: {
              comments: [{ cid: 'inline-reply' }],
              nextCid: 'page-old-inline-next',
            },
            empty: {
              comments: [],
            },
          },
        },
      },
      undefined,
      {
        cid: 'thread-cid',
      },
    ]);

    expect(testState.commentsRemoveItemMock).toHaveBeenCalledOnce();
    expect(testState.commentsRemoveItemMock).toHaveBeenCalledWith('thread-cid');
    expect(testState.repliesPagesRemoveItemMock).toHaveBeenCalledTimes(4);
    expect(testState.repliesPagesRemoveItemMock.mock.calls.map(([pageCid]) => pageCid).sort()).toEqual([
      'page-empty-1',
      'page-old-1',
      'page-old-2',
      'page-old-inline-next',
    ]);
    expect(testState.repliesPagesState.repliesPages).toEqual({
      unrelated: { comments: [{ cid: 'unrelated' }] },
    });
    expect(testState.repliesPagesState.comments).toEqual({
      unrelated: { cid: 'unrelated' },
    });
  });
  describe('refreshCommentOnce', () => {
    const setCommentState = (updatingState: string, errors: Error[] = testState.commentsStoreState.errors['post-cid'] ?? []) => {
      testState.commentsStoreState = {
        ...testState.commentsStoreState,
        comments: { 'post-cid': { updatingState } },
        errors: { 'post-cid': errors },
      };
      for (const listener of testState.commentsStoreListeners) listener(testState.commentsStoreState);
    };

    beforeEach(() => {
      testState.commentsStoreListeners.clear();
      testState.stopCommentAutoUpdateMock.mockClear();
      testState.commentsStoreState = { comments: {}, errors: {}, stopCommentAutoUpdate: testState.stopCommentAutoUpdateMock };
    });

    it('reports an update when the hooks refresh settles', async () => {
      await expect(refreshCommentOnce('post-cid', async () => undefined)).resolves.toBe('updated');
      expect(testState.commentsStoreListeners.size).toBe(0);
    });

    it('reports an unchanged thread and stops the one-shot update', async () => {
      const outcome = refreshCommentOnce('post-cid', () => new Promise<void>(() => undefined));
      setCommentState('stopped');
      setCommentState('waiting-retry');
      setCommentState('fetching-update-ipfs');
      setCommentState('waiting-retry');

      await expect(outcome).resolves.toBe('unchanged');
      expect(testState.stopCommentAutoUpdateMock).toHaveBeenCalledWith('post-cid', 'thread-refresh');
      expect(testState.commentsStoreListeners.size).toBe(0);
    });

    it('reports a retriable fetch error as a failure', async () => {
      const outcome = refreshCommentOnce('post-cid', () => new Promise<void>(() => undefined));
      setCommentState('fetching-update-ipfs');
      setCommentState('waiting-retry', [new Error('gateway timeout')]);

      await expect(outcome).resolves.toBe('failed');
      expect(testState.stopCommentAutoUpdateMock).not.toHaveBeenCalled();
    });

    it('reports a rejected refresh as a failure', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await expect(refreshCommentOnce('post-cid', async () => Promise.reject(new Error('offline')))).resolves.toBe('failed');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to refresh thread comments:', expect.any(Error));
      consoleErrorSpy.mockRestore();
    });
  });

  it('recomputes reply feeds without resetting them', () => {
    syncThreadRepliesFeeds();
    expect(testState.updateFeedsMock).toHaveBeenCalledOnce();
  });
});
