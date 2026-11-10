import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => {
  const createDatabaseMock = () => {
    const items = new Map<string, unknown>();
    return {
      items,
      getItem: vi.fn(async (key: string) => items.get(key)),
      removeItem: vi.fn(async (key: string) => {
        items.delete(key);
      }),
      setItem: vi.fn(async (key: string, value: unknown) => {
        items.set(key, value);
      }),
    };
  };
  const commentsDatabase = createDatabaseMock();
  const repliesPagesDatabase = createDatabaseMock();

  return {
    commentsDatabase,
    commentsRemoveItemMock: commentsDatabase.removeItem,
    repliesPagesDatabase,
    repliesPagesRemoveItemMock: repliesPagesDatabase.removeItem,
    repliesPagesState: {
      comments: {} as Record<string, unknown>,
      repliesPages: {} as Record<string, { comments?: Array<{ cid?: string }>; nextCid?: string }>,
    },
    repliesPagesSetStateMock: vi.fn(),
  };
});

vi.mock('../../bitsocial-internals/utils', () => ({
  localForageLru: {
    createInstance: ({ name }: { name: string }) => (name === 'bitsocialReactHooks-comments' ? testState.commentsDatabase : testState.repliesPagesDatabase),
  },
}));

vi.mock('../../bitsocial-internals/stores', () => ({
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

import { evictThreadRefreshCaches } from '../thread-refresh-cache-utils';

describe('thread-refresh-cache-utils', () => {
  beforeEach(() => {
    for (const database of [testState.commentsDatabase, testState.repliesPagesDatabase]) {
      database.items.clear();
      database.getItem.mockClear();
      database.removeItem.mockClear();
      database.setItem.mockClear();
    }
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

  it('puts back what it evicted when the refresh fails, without replacing what the refresh already stored', async () => {
    const thread = { cid: 'thread-cid', replies: { pageCids: { old: 'page-old-1' } } };
    testState.commentsDatabase.items.set('thread-cid', { cid: 'thread-cid', updatedAt: 1 });
    testState.repliesPagesDatabase.items.set('page-old-1', { comments: [{ cid: 'reply-a' }], nextCid: 'page-old-2' });
    testState.repliesPagesDatabase.items.set('page-old-2', { comments: [{ cid: 'reply-b' }] });
    const initialRepliesPages = testState.repliesPagesState.repliesPages;
    const initialComments = testState.repliesPagesState.comments;

    const restoreEvictedCaches = await evictThreadRefreshCaches([thread]);

    expect(testState.commentsDatabase.items.has('thread-cid')).toBe(false);
    expect(testState.repliesPagesDatabase.items.size).toBe(0);
    expect(testState.repliesPagesState.repliesPages['page-old-1']).toBeUndefined();

    // The refresh stored a newer page 2 before it failed.
    testState.repliesPagesDatabase.items.set('page-old-2', { comments: [{ cid: 'reply-b' }], refetched: true });
    testState.repliesPagesState.comments = { ...testState.repliesPagesState.comments, 'reply-b': { cid: 'reply-b', refetched: true } };

    await restoreEvictedCaches();

    expect(testState.commentsDatabase.items.get('thread-cid')).toEqual({ cid: 'thread-cid', updatedAt: 1 });
    expect(testState.repliesPagesDatabase.items.get('page-old-1')).toEqual({ comments: [{ cid: 'reply-a' }], nextCid: 'page-old-2' });
    expect(testState.repliesPagesDatabase.items.get('page-old-2')).toEqual({ comments: [{ cid: 'reply-b' }], refetched: true });
    expect(testState.repliesPagesState.repliesPages).toEqual(initialRepliesPages);
    expect(testState.repliesPagesState.comments).toEqual({ ...initialComments, 'reply-b': { cid: 'reply-b', refetched: true } });
  });
});
