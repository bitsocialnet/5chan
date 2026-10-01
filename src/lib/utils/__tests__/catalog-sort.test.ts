import { describe, it, expect } from 'vitest';
import { placePinnedCatalogThreads, sortCatalogFeedForDisplay, type CatalogPost } from '../catalog-sort';

describe('sortCatalogFeedForDisplay', () => {
  describe('replyCount sort', () => {
    it('orders by replyCount descending', () => {
      const posts: CatalogPost[] = [
        { cid: 'a', replyCount: 5 },
        { cid: 'b', replyCount: 20 },
        { cid: 'c', replyCount: 10 },
      ];
      const result = sortCatalogFeedForDisplay(posts, 'replyCount');
      expect(result.map((p) => p.cid)).toEqual(['b', 'c', 'a']);
      expect(result.map((p) => p.replyCount)).toEqual([20, 10, 5]);
    });

    it('tie-breaks on bump order (lastReplyTimestamp, then timestamp)', () => {
      const posts: CatalogPost[] = [
        { cid: 'a', replyCount: 10, lastReplyTimestamp: 100, timestamp: 50 },
        { cid: 'b', replyCount: 10, lastReplyTimestamp: 300, timestamp: 60 },
        { cid: 'c', replyCount: 10, lastReplyTimestamp: 200, timestamp: 70 },
      ];
      const result = sortCatalogFeedForDisplay(posts, 'replyCount');
      expect(result.map((p) => p.cid)).toEqual(['b', 'c', 'a']);
    });

    it('handles undefined replyCount as 0', () => {
      const posts: CatalogPost[] = [{ cid: 'a', replyCount: 5 }, { cid: 'b' }, { cid: 'c', replyCount: undefined }, { cid: 'd', replyCount: null }];
      const result = sortCatalogFeedForDisplay(posts, 'replyCount');
      expect(result.map((p) => p.cid)).toEqual(['a', 'b', 'c', 'd']);
    });

    it('keeps pinned posts at top in input order', () => {
      const posts: CatalogPost[] = [
        { cid: 'mid', replyCount: 100 },
        { cid: 'pinned1', replyCount: 1, pinned: true },
        { cid: 'low', replyCount: 5 },
        { cid: 'pinned2', replyCount: 50, pinned: true },
      ];
      const result = sortCatalogFeedForDisplay(posts, 'replyCount');
      expect(result.map((p) => p.cid)).toEqual(['pinned1', 'pinned2', 'mid', 'low']);
    });

    it('produces deterministic ordering under full ties', () => {
      const posts: CatalogPost[] = [
        { cid: 'z', replyCount: 0 },
        { cid: 'a', replyCount: 0 },
        { cid: 'm', replyCount: 0 },
      ];
      const result = sortCatalogFeedForDisplay(posts, 'replyCount');
      expect(result.map((p) => p.cid)).toEqual(['a', 'm', 'z']);
    });

    it('produces deterministic ordering under full ties (repeated runs)', () => {
      const posts: CatalogPost[] = [
        { cid: 'x', replyCount: 5, lastReplyTimestamp: 100, timestamp: 50 },
        { cid: 'y', replyCount: 5, lastReplyTimestamp: 100, timestamp: 50 },
      ];
      const r1 = sortCatalogFeedForDisplay(posts, 'replyCount');
      const r2 = sortCatalogFeedForDisplay(posts, 'replyCount');
      expect(r1.map((p) => p.cid)).toEqual(r2.map((p) => p.cid));
    });
  });

  describe('non-replyCount sorts', () => {
    it('returns original order for active sort', () => {
      const posts: CatalogPost[] = [
        { cid: 'c', replyCount: 10 },
        { cid: 'a', replyCount: 100 },
        { cid: 'b', replyCount: 50 },
      ];
      const result = sortCatalogFeedForDisplay(posts, 'active');
      expect(result).toBe(posts);
      expect(result.map((p) => p.cid)).toEqual(['c', 'a', 'b']);
    });

    it('returns original order for new sort', () => {
      const posts: CatalogPost[] = [
        { cid: 'c', replyCount: 10 },
        { cid: 'a', replyCount: 100 },
        { cid: 'b', replyCount: 50 },
      ];
      const result = sortCatalogFeedForDisplay(posts, 'new');
      expect(result).toBe(posts);
      expect(result.map((p) => p.cid)).toEqual(['c', 'a', 'b']);
    });
  });
});

describe('placePinnedCatalogThreads', () => {
  it('returns the feed unchanged when nothing is pinned', () => {
    const posts: CatalogPost[] = [{ cid: 'a' }, { cid: 'b' }];
    expect(placePinnedCatalogThreads(posts, [])).toBe(posts);
  });

  it('places pinned threads after the sticky threads in the order they were pinned, wherever the feed has them', () => {
    const posts: CatalogPost[] = [{ cid: 'sticky', pinned: true }, { cid: 'a' }, { cid: 'pinned-2' }, { cid: 'b' }, { cid: 'pinned-1' }];
    const pinnedPosts: CatalogPost[] = [{ cid: 'pinned-1' }, { cid: 'unloaded' }, { cid: 'pinned-2' }];

    expect(placePinnedCatalogThreads(posts, pinnedPosts).map((post) => post.cid)).toEqual(['sticky', 'pinned-1', 'unloaded', 'pinned-2', 'a', 'b']);
  });

  it('puts pinned threads first without sticky threads and keeps a pinned sticky thread with the sticky ones', () => {
    expect(placePinnedCatalogThreads([{ cid: 'a' }, { cid: 'pinned' }], [{ cid: 'pinned' }]).map((post) => post.cid)).toEqual(['pinned', 'a']);
    expect(
      placePinnedCatalogThreads([{ cid: 'sticky-1', pinned: true }, { cid: 'sticky-2', pinned: true }, { cid: 'a' }], [{ cid: 'sticky-1', pinned: true }]).map(
        (post) => post.cid,
      ),
    ).toEqual(['sticky-1', 'sticky-2', 'a']);
  });

  it('shows the copy with the newer update', () => {
    const feedPost: CatalogPost = { cid: 'pinned', replyCount: 3, updatedAt: 100 };
    const livePost: CatalogPost = { cid: 'pinned', replyCount: 5, updatedAt: 200 };

    expect(placePinnedCatalogThreads([feedPost], [livePost])[0]).toBe(livePost);
    expect(placePinnedCatalogThreads([livePost], [feedPost])[0]).toBe(livePost);
  });
});
