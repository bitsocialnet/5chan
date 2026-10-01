/**
 * Catalog feed sorting utility for deterministic and testable behavior.
 * Used when displaying catalog feeds with replyCount sort.
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

/**
 * Sort catalog feed for display.
 * - For 'replyCount': deterministic sort by replyCount desc, bump order, timestamp, cid.
 * - For 'active' | 'new': returns input order unchanged (no extra sort cost).
 */
export function sortCatalogFeedForDisplay<T extends CatalogPost>(posts: T[], sortType: CatalogSortType): T[] {
  if (sortType === 'active' || sortType === 'new') {
    return posts;
  }

  if (sortType !== 'replyCount') {
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

  unpinned.sort((a, b) => {
    const rcA = a.replyCount ?? 0;
    const rcB = b.replyCount ?? 0;
    if (rcB !== rcA) return rcB - rcA;

    const bumpA = a.lastReplyTimestamp ?? a.timestamp ?? 0;
    const bumpB = b.lastReplyTimestamp ?? b.timestamp ?? 0;
    if (bumpB !== bumpA) return bumpB - bumpA;

    const tsA = a.timestamp ?? 0;
    const tsB = b.timestamp ?? 0;
    if (tsB !== tsA) return tsB - tsA;

    const cidA = a.cid ?? '';
    const cidB = b.cid ?? '';
    return cidA.localeCompare(cidB);
  });

  return [...pinned, ...unpinned];
}

/**
 * Place the viewer's pinned threads right after the sticky threads, like 4chan's catalog. A pinned
 * thread that is also sticky stays with the sticky threads. Each pinned thread shows whichever copy,
 * the feed's or the live one, has the newer update. Threads keep their feed order, and pinned threads
 * the feed has not loaded follow the ones it has.
 */
export function placePinnedCatalogThreads<T extends CatalogPost>(posts: T[], pinnedPosts: T[]): T[] {
  if (pinnedPosts.length === 0) return posts;

  const pinnedPostsByCid = new Map(pinnedPosts.map((post) => [post.cid, post]));
  const placedCids = new Set<string>();
  const pinnedGroup: T[] = [];
  const otherPosts: T[] = [];

  for (const post of posts) {
    const pinnedPost = post.cid ? pinnedPostsByCid.get(post.cid) : undefined;
    if (!pinnedPost || !post.cid) {
      otherPosts.push(post);
      continue;
    }
    const newerPost = (pinnedPost.updatedAt ?? 0) >= (post.updatedAt ?? 0) ? pinnedPost : post;
    placedCids.add(post.cid);
    if (post.pinned) otherPosts.push(newerPost);
    else pinnedGroup.push(newerPost);
  }
  for (const pinnedPost of pinnedPosts) {
    if (pinnedPost.cid && !placedCids.has(pinnedPost.cid)) pinnedGroup.push(pinnedPost);
  }

  const lastStickyIndex = otherPosts.map((post) => post.pinned).lastIndexOf(true);
  return [...otherPosts.slice(0, lastStickyIndex + 1), ...pinnedGroup, ...otherPosts.slice(lastStickyIndex + 1)];
}
