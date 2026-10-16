/**
 * Catalog feed sorting utility for deterministic and testable behavior.
 * Used when displaying catalog feeds with the creation date and replyCount sorts.
 */

/** Minimal post shape for catalog sorting */
export interface CatalogPost {
  cid?: string | null;
  pinned?: boolean;
  replyCount?: number | null;
  lastReplyTimestamp?: number | null;
  timestamp?: number | null;
  updatedAt?: number | null;
}

/** Sort types supported by the catalog feed */
type CatalogSortType = 'active' | 'new' | 'replyCount';

const compareByCreationDate = (a: CatalogPost, b: CatalogPost): number => {
  const tsA = a.timestamp ?? 0;
  const tsB = b.timestamp ?? 0;
  if (tsB !== tsA) return tsB - tsA;

  const cidA = a.cid ?? '';
  const cidB = b.cid ?? '';
  return cidA.localeCompare(cidB);
};

const compareByReplyCount = (a: CatalogPost, b: CatalogPost): number => {
  const rcA = a.replyCount ?? 0;
  const rcB = b.replyCount ?? 0;
  if (rcB !== rcA) return rcB - rcA;

  const bumpA = a.lastReplyTimestamp ?? a.timestamp ?? 0;
  const bumpB = b.lastReplyTimestamp ?? b.timestamp ?? 0;
  if (bumpB !== bumpA) return bumpB - bumpA;

  return compareByCreationDate(a, b);
};

/**
 * Sort catalog feed for display. The feed arrives in the board's own order, bump order wherever the
 * board publishes it, and like 4chan's catalog the other orders re-sort that thread list locally.
 * Sticky threads stay first.
 * - For 'active': returns input order unchanged (no extra sort cost).
 * - For 'new': deterministic sort by timestamp desc, cid.
 * - For 'replyCount': deterministic sort by replyCount desc, bump order, timestamp, cid.
 */
export function sortCatalogFeedForDisplay<T extends CatalogPost>(posts: T[], sortType: CatalogSortType): T[] {
  if (sortType !== 'new' && sortType !== 'replyCount') {
    return posts;
  }

  const pinned: T[] = [];
  const unpinned: T[] = [];

  for (const post of posts) {
    if (post.pinned) {
      pinned.push(post);
    } else {
      unpinned.push(post);
    }
  }

  unpinned.sort(sortType === 'new' ? compareByCreationDate : compareByReplyCount);

  return [...pinned, ...unpinned];
}

/**
 * Place the viewer's pinned threads right after the sticky threads, like 4chan's catalog, in the
 * order of `pinnedPosts` (the order they were pinned), so a new pin goes after the earlier ones.
 * A pinned thread that is also sticky stays with the sticky threads. Each pinned thread shows
 * whichever copy, the feed's or the live one, has the newer update.
 */
export function placePinnedCatalogThreads<T extends CatalogPost>(posts: T[], pinnedPosts: T[]): T[] {
  if (pinnedPosts.length === 0) return posts;

  const feedPostsByCid = new Map(posts.map((post) => [post.cid, post]));
  const newerPinnedPosts = pinnedPosts.map((pinnedPost) => {
    const feedPost = feedPostsByCid.get(pinnedPost.cid);
    return feedPost && (feedPost.updatedAt ?? 0) > (pinnedPost.updatedAt ?? 0) ? feedPost : pinnedPost;
  });
  // Stickiness comes from the feed copy, so a pin a mod stickied after the snapshot doesn't keep its old spot mid-feed.
  const stickyPinnedCids = new Set(pinnedPosts.filter((post) => feedPostsByCid.get(post.cid)?.pinned).map((post) => post.cid));
  const newerPinnedPostsByCid = new Map(newerPinnedPosts.map((post) => [post.cid, post]));

  const otherPosts = posts.flatMap((post) => {
    if (!newerPinnedPostsByCid.has(post.cid)) return [post];
    return stickyPinnedCids.has(post.cid) ? [newerPinnedPostsByCid.get(post.cid) as T] : [];
  });
  const pinnedGroup = newerPinnedPosts.filter((post) => !stickyPinnedCids.has(post.cid));

  const lastStickyIndex = otherPosts.map((post) => post.pinned).lastIndexOf(true);
  return [...otherPosts.slice(0, lastStickyIndex + 1), ...pinnedGroup, ...otherPosts.slice(lastStickyIndex + 1)];
}
