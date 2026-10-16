import { describe, expect, it } from 'vitest';
import { findPostPageInFeed, findPostPageInLoadedBoardFeeds, isBoardFeedOptions } from '../post-page-resolution';

describe('post-page-resolution', () => {
  it('finds the GUI page for a post inside a feed and rejects invalid inputs', () => {
    const feed = [{ cid: 'post-1' }, { cid: 'post-2' }, { cid: 'post-3' }, { cid: 'post-4' }];

    expect(findPostPageInFeed(feed, 'post-3', 2)).toBe(2);
    expect(findPostPageInFeed(feed, 'missing-post', 2)).toBeUndefined();
    expect(findPostPageInFeed(feed, 'post-1', 0)).toBeUndefined();
    expect(findPostPageInFeed(feed, '', 2)).toBeUndefined();
  });

  it('only accepts strict board feed options for the board sort single-board feed', () => {
    const baseOptions = {
      sortType: 'active',
      communityAddresses: ['music.eth'],
    };

    expect(isBoardFeedOptions(baseOptions, 'music.eth', 'active')).toBe(true);
    expect(isBoardFeedOptions({ ...baseOptions, sortType: 'new' }, 'music.eth', 'active')).toBe(false);
    expect(isBoardFeedOptions({ ...baseOptions, sortType: 'hot' }, 'music.eth', 'hot')).toBe(true);
    expect(isBoardFeedOptions({ ...baseOptions, communityAddresses: ['music.eth', 'tech.eth'] }, 'music.eth', 'active')).toBe(false);
    expect(isBoardFeedOptions({ ...baseOptions, communityAddresses: ['tech.eth'] }, 'music.eth', 'active')).toBe(false);
    expect(isBoardFeedOptions({ ...baseOptions, filter: { title: 'test' } }, 'music.eth', 'active')).toBe(false);
    expect(isBoardFeedOptions({ ...baseOptions, newerThan: 3600 }, 'music.eth', 'active')).toBe(false);
    expect(isBoardFeedOptions({ ...baseOptions, modQueue: true }, 'music.eth', 'active')).toBe(false);
    expect(isBoardFeedOptions({ ...baseOptions, accountComments: true }, 'music.eth', 'active')).toBe(false);
  });

  it('resolves a post page from matching loaded board feeds and ignores unrelated feeds', () => {
    const feedsOptions = {
      allFeed: {
        sortType: 'active',
        communityAddresses: ['all.eth'],
      },
      catalogFilterFeed: {
        filter: { title: 'match' },
        sortType: 'active',
        communityAddresses: ['music.eth'],
      },
      boardFeed: {
        sortType: 'active',
        communityAddresses: ['music.eth'],
      },
    };
    const loadedFeeds = {
      allFeed: [{ cid: 'post-4' }],
      boardFeed: [{ cid: 'post-1' }, { cid: 'post-2' }, { cid: 'post-3' }, { cid: 'post-4' }],
    };

    expect(findPostPageInLoadedBoardFeeds(feedsOptions, loadedFeeds, 'music.eth', 'post-4', 2, 'active')).toBe(2);
    expect(findPostPageInLoadedBoardFeeds(feedsOptions, loadedFeeds, 'music.eth', 'post-4', 2, 'hot')).toBeUndefined();
    expect(findPostPageInLoadedBoardFeeds(feedsOptions, loadedFeeds, 'music.eth', 'missing-post', 2, 'active')).toBeUndefined();
    expect(findPostPageInLoadedBoardFeeds(feedsOptions, { boardFeed: 'not-an-array' as never }, 'music.eth', 'post-4', 2, 'active')).toBeUndefined();
  });
});
