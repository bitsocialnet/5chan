import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveExternalQuoteTarget, type PostNumberRegistry } from '../external-quote-resolver';

type FeedState = {
  feedsOptions: Record<string, { pageNumber: number }>;
  loadedFeeds: Record<string, unknown[]>;
  feedsHaveMore: Record<string, boolean>;
};

const testState = vi.hoisted(() => ({
  communities: {} as Record<string, unknown>,
  addCommunityToStore: vi.fn(),
  boardFeeds: { feedsOptions: {}, loadedFeeds: {}, feedsHaveMore: {} } as FeedState,
  addFeedToStore: vi.fn(),
  replyFeeds: { feedsOptions: {}, loadedFeeds: {}, feedsHaveMore: {} } as FeedState,
  addRepliesFeedToStore: vi.fn(),
}));

vi.mock('../../bitsocial-internals/stores', () => ({
  communitiesStore: { getState: () => ({ communities: testState.communities, addCommunityToStore: testState.addCommunityToStore }) },
  communitiesPagesStore: { getState: () => ({ comments: {} }) },
  feedsStore: { getState: () => ({ ...testState.boardFeeds, addFeedToStore: testState.addFeedToStore, incrementFeedPageNumber: vi.fn() }) },
  repliesStore: {
    getState: () => ({ ...testState.replyFeeds, addFeedToStoreOrUpdateComment: testState.addRepliesFeedToStore, incrementFeedPageNumber: vi.fn() }),
  },
  feedOptionsToFeedName: (feedOptions: { commentCid: string; sortType: string }) => `replies-${feedOptions.commentCid}-${feedOptions.sortType}`,
}));

const BOARD_ADDRESS = 'board.bso';
const account = { id: 'account-1' };
const postNumbers: PostNumberRegistry = { getState: () => ({ numberToCid: {}, registerComments: vi.fn() }) };

// A board configured with `settings.pages` whose threads overflow the preloaded page, so it serves only these sorts.
const makeBoard = (sortTypes: string[]) => ({
  address: BOARD_ADDRESS,
  updatedAt: 1,
  pageSorts: { posts: Object.fromEntries(sortTypes.map((sortType) => [sortType, { name: sortType }])) },
  posts: {
    pages: { [sortTypes[0]]: { comments: [{ cid: 'thread' }], nextCid: 'next' } },
    pageCids: Object.fromEntries(sortTypes.map((sortType) => [sortType, `${sortType}-cid`])),
  },
});

const serveBoardThreads = (threads: unknown[]) =>
  testState.addFeedToStore.mockImplementation(async (feedName: string) => {
    testState.boardFeeds.feedsOptions[feedName] = { pageNumber: 1 };
    testState.boardFeeds.loadedFeeds[feedName] = threads;
    testState.boardFeeds.feedsHaveMore[feedName] = false;
  });

const resolveQuote = (number: number) =>
  resolveExternalQuoteTarget({
    account,
    directories: [],
    postNumbers,
    reference: { kind: 'same-board', number, raw: `>>${number}`, communityAddress: BOARD_ADDRESS },
  });

afterEach(() => {
  testState.communities = {};
  testState.boardFeeds = { feedsOptions: {}, loadedFeeds: {}, feedsHaveMore: {} };
  testState.replyFeeds = { feedsOptions: {}, loadedFeeds: {}, feedsHaveMore: {} };
  vi.clearAllMocks();
});

describe('resolveExternalQuoteTarget', () => {
  it('loads the board record and searches its threads in bump order, not the new sort', async () => {
    testState.addCommunityToStore.mockImplementation(async () => {
      await Promise.resolve();
      testState.communities[BOARD_ADDRESS] = makeBoard(['active']);
    });
    serveBoardThreads([{ cid: 'thread-7', number: 7 }]);

    const target = await resolveQuote(7);

    expect(testState.addCommunityToStore).toHaveBeenCalledWith(BOARD_ADDRESS, account);
    expect(testState.addFeedToStore.mock.calls[0][3]).toBe('active');
    expect(target?.cid).toBe('thread-7');
  });

  it('searches a board without bump order in the sort the board view reads', async () => {
    testState.communities[BOARD_ADDRESS] = makeBoard(['hot']);
    serveBoardThreads([{ cid: 'thread-7', number: 7 }]);

    await resolveQuote(7);

    expect(testState.addCommunityToStore).not.toHaveBeenCalled();
    expect(testState.addFeedToStore.mock.calls[0][3]).toBe('hot');
  });

  it('searches thread replies in the thread view order', async () => {
    testState.communities[BOARD_ADDRESS] = makeBoard(['active']);
    serveBoardThreads([{ cid: 'thread-1', number: 1, replyCount: 2 }]);
    testState.addRepliesFeedToStore.mockImplementation(async (_thread: unknown, feedOptions: { commentCid: string; sortType: string }) => {
      const feedName = `replies-${feedOptions.commentCid}-${feedOptions.sortType}`;
      testState.replyFeeds.feedsOptions[feedName] = { pageNumber: 1 };
      testState.replyFeeds.loadedFeeds[feedName] = [
        { cid: 'reply-2', number: 2 },
        { cid: 'reply-9', number: 9 },
      ];
      testState.replyFeeds.feedsHaveMore[feedName] = false;
    });

    const target = await resolveQuote(9);

    expect(testState.addRepliesFeedToStore.mock.calls[0][1]).toMatchObject({ commentCid: 'thread-1', sortType: 'old', flat: true });
    expect(target?.cid).toBe('reply-9');
  });

  it('fails as soon as the board record cannot load', async () => {
    testState.addCommunityToStore.mockRejectedValue(new Error('board offline'));

    await expect(resolveQuote(7)).rejects.toThrow('board offline');
    expect(testState.addFeedToStore).not.toHaveBeenCalled();
  });
});
