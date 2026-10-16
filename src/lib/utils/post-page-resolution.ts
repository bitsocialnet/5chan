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
type CommunityIdentifierLike = {
  name?: string;
  publicKey?: string;
};

type LegacyFeedOptionsLike = {
  sortType: string;
  postsPerPage?: number;
  filter?: unknown;
  newerThan?: number;
  modQueue?: unknown;
  accountComments?: unknown;
};

export interface FeedOptionsLike {
  communities?: CommunityIdentifierLike[];
  communityAddresses?: string[];
  sortType: string;
  postsPerPage?: number;
  filter?: unknown;
  newerThan?: number;
  modQueue?: unknown;
  accountComments?: unknown;
}

/** FeedsOptions-like map */
export type FeedsOptionsLike = Record<string, FeedOptionsLike | LegacyFeedOptionsLike>;

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
 * - sortType is the board's own sort (bump order wherever the board publishes it)
 * - single-board feed (one community)
 * - no filter, no newerThan, no modQueue, no accountComments
 */
const getCommunityIdentifiers = (opts: FeedOptionsLike | LegacyFeedOptionsLike): CommunityIdentifierLike[] => {
  if ('communities' in opts && Array.isArray(opts.communities)) {
    return opts.communities;
  }
  if ('communityAddresses' in opts && Array.isArray(opts.communityAddresses)) {
    return opts.communityAddresses.map((communityAddress) => ({ name: communityAddress }));
  }
  return [];
};

/**
 * Supports canonical `communities` and legacy string-array feed options.
 */
export function isBoardFeedOptions(opts: FeedOptionsLike | LegacyFeedOptionsLike, communityAddress: string, boardSortType: string): boolean {
  const communities = getCommunityIdentifiers(opts);

  return (
    opts.sortType === boardSortType &&
    communities.length === 1 &&
    (communities[0]?.name === communityAddress || communities[0]?.publicKey === communityAddress) &&
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
 * @param communityAddress - Board community address
 * @param postCid - CID of the post (OP) to locate
 * @param guiPostsPerPage - Posts per GUI page
 * @param boardSortType - The post sort the board's feed uses
 * @returns 1-based page number, or undefined if not found in any matching feed
 */
export function findPostPageInLoadedBoardFeeds(
  feedsOptions: FeedsOptionsLike,
  loadedFeeds: LoadedFeedsLike,
  communityAddress: string,
  postCid: string,
  guiPostsPerPage: number,
  boardSortType: string,
): number | undefined {
  if (!communityAddress || !postCid || guiPostsPerPage <= 0) return undefined;

  for (const feedName of Object.keys(feedsOptions)) {
    const opts = feedsOptions[feedName];
    if (!opts || !isBoardFeedOptions(opts as FeedOptionsLike, communityAddress, boardSortType)) continue;

    const feed = loadedFeeds[feedName];
    if (!feed || !Array.isArray(feed)) continue;

    const page = findPostPageInFeed(feed, postCid, guiPostsPerPage);
    if (page !== undefined) return page;
  }

  return undefined;
}
