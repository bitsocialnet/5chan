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
}

/** Sort types supported by the catalog feed */
export type CatalogSortType = 'active' | 'new' | 'replyCount';

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
