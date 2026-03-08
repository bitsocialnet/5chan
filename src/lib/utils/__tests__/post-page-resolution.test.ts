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

  it('only accepts strict board feed options for the active single-board feed', () => {
    const baseOptions = {
      sortType: 'active',
      subplebbitAddresses: ['music.eth'],
    };

    expect(isBoardFeedOptions(baseOptions, 'music.eth')).toBe(true);
    expect(isBoardFeedOptions({ ...baseOptions, sortType: 'new' }, 'music.eth')).toBe(false);
    expect(isBoardFeedOptions({ ...baseOptions, subplebbitAddresses: ['music.eth', 'tech.eth'] }, 'music.eth')).toBe(false);
    expect(isBoardFeedOptions({ ...baseOptions, subplebbitAddresses: ['tech.eth'] }, 'music.eth')).toBe(false);
    expect(isBoardFeedOptions({ ...baseOptions, filter: { title: 'test' } }, 'music.eth')).toBe(false);
    expect(isBoardFeedOptions({ ...baseOptions, newerThan: 3600 }, 'music.eth')).toBe(false);
    expect(isBoardFeedOptions({ ...baseOptions, modQueue: true }, 'music.eth')).toBe(false);
    expect(isBoardFeedOptions({ ...baseOptions, accountComments: true }, 'music.eth')).toBe(false);
  });

  it('resolves a post page from matching loaded board feeds and ignores unrelated feeds', () => {
    const feedsOptions = {
      allFeed: {
        sortType: 'active',
        subplebbitAddresses: ['all.eth'],
      },
      catalogFilterFeed: {
        filter: { title: 'match' },
        sortType: 'active',
        subplebbitAddresses: ['music.eth'],
      },
      boardFeed: {
        sortType: 'active',
        subplebbitAddresses: ['music.eth'],
      },
    };
    const loadedFeeds = {
      allFeed: [{ cid: 'post-4' }],
      boardFeed: [{ cid: 'post-1' }, { cid: 'post-2' }, { cid: 'post-3' }, { cid: 'post-4' }],
    };

    expect(findPostPageInLoadedBoardFeeds(feedsOptions, loadedFeeds, 'music.eth', 'post-4', 2)).toBe(2);
    expect(findPostPageInLoadedBoardFeeds(feedsOptions, loadedFeeds, 'music.eth', 'missing-post', 2)).toBeUndefined();
    expect(findPostPageInLoadedBoardFeeds(feedsOptions, { boardFeed: 'not-an-array' as never }, 'music.eth', 'post-4', 2)).toBeUndefined();
  });
});
