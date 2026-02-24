/**
 * Post page resolution utilities.
 * Page semantics are board pagination pages (not catalog ordering, not fetch-chunk index).
 */

/** Minimal Comment shape with cid */
export interface CommentWithCid {
  cid?: string;
  [key: string]: unknown;
}

/** Minimal FeedOptions shape for board-feed filtering */
export interface FeedOptionsLike {
  subplebbitAddresses: string[];
  sortType: string;
  postsPerPage?: number;
  filter?: unknown;
  newerThan?: number;
  modQueue?: unknown;
  accountComments?: unknown;
}

/** FeedsOptions-like map */
export type FeedsOptionsLike = Record<string, FeedOptionsLike>;

/** Loaded feeds map: feedName -> Comment[] */
export type LoadedFeedsLike = Record<string, CommentWithCid[]>;

/**
 * Find the board pagination page (1-based) containing postCid in a feed.
 * Pure index math: page = floor(index / guiPostsPerPage) + 1.
 *
 * @param feed - Array of comments (posts) in feed order
 * @param postCid - CID of the post (OP) to locate
 * @param guiPostsPerPage - Posts per GUI page
 * @returns 1-based page number, or undefined if post not found
 */
export function findPostPageInFeed(feed: CommentWithCid[], postCid: string, guiPostsPerPage: number): number | undefined {
  if (!postCid || guiPostsPerPage <= 0) return undefined;
  const index = feed.findIndex((c) => c.cid === postCid);
  if (index < 0) return undefined;
  return Math.floor(index / guiPostsPerPage) + 1;
}

/**
 * Strict board-feed filter criteria.
 * A feed is a "board feed" iff:
 * - sortType === 'active'
 * - single-sub feed (subplebbitAddresses.length === 1)
 * - no filter, no newerThan, no modQueue, no accountComments
 */
export function isBoardFeedOptions(opts: FeedOptionsLike, subplebbitAddress: string): boolean {
  return (
    opts.sortType === 'active' &&
    opts.subplebbitAddresses?.length === 1 &&
    opts.subplebbitAddresses[0] === subplebbitAddress &&
    !opts.filter &&
    opts.newerThan == null &&
    !opts.modQueue &&
    !opts.accountComments
  );
}

/**
 * Find the board pagination page for postCid by searching loaded board feeds.
 * Only considers feeds matching strict board-feed criteria.
 *
 * @param feedsOptions - Feeds store feedsOptions
 * @param loadedFeeds - Feeds store loadedFeeds
 * @param subplebbitAddress - Board subplebbit address
 * @param postCid - CID of the post (OP) to locate
 * @param guiPostsPerPage - Posts per GUI page
 * @returns 1-based page number, or undefined if not found in any matching feed
 */
export function findPostPageInLoadedBoardFeeds(
  feedsOptions: FeedsOptionsLike,
  loadedFeeds: LoadedFeedsLike,
  subplebbitAddress: string,
  postCid: string,
  guiPostsPerPage: number,
): number | undefined {
  if (!subplebbitAddress || !postCid || guiPostsPerPage <= 0) return undefined;

  for (const feedName of Object.keys(feedsOptions)) {
    const opts = feedsOptions[feedName];
    if (!opts || !isBoardFeedOptions(opts, subplebbitAddress)) continue;

    const feed = loadedFeeds[feedName];
    if (!feed || !Array.isArray(feed)) continue;

    const page = findPostPageInFeed(feed, postCid, guiPostsPerPage);
    if (page !== undefined) return page;
  }

  return undefined;
}
