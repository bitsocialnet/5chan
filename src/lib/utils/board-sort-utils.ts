import { getAvailablePostSortTypes, getPreloadedPostSortType, type Community } from '@bitsocial/bitsocial-react-hooks';

/** Bump order, the thread order 5chan shows wherever a board publishes it. */
export const BUMP_ORDER_SORT_TYPE = 'active';

/**
 * A board configured with pkc-js `settings.pages` publishes only the post sorts its operator chose,
 * listed in `community.pageSorts.posts`, and a feed requesting another sort stays empty. Prefer bump
 * order, otherwise follow the board's own default sort. Deciding by that list keeps the sort stable
 * while a small board, whose single preloaded page the client could re-sort, outgrows that page.
 * Unconfigured boards publish every built-in sort; bump order is also requested until the board loads.
 */
export const getBoardSortType = (community: Community | undefined): string => {
  const publishedPostSorts = community?.pageSorts?.posts;
  if (!publishedPostSorts || BUMP_ORDER_SORT_TYPE in publishedPostSorts) {
    return BUMP_ORDER_SORT_TYPE;
  }
  return getPreloadedPostSortType(community) ?? Object.keys(publishedPostSorts)[0] ?? BUMP_ORDER_SORT_TYPE;
};

/**
 * A loaded board that publishes threads, just not in the built-in `sortType`, contributes nothing to a
 * feed of that sort, unless its single preloaded page still lets the client compute the sort.
 */
export const isBoardMissingSortType = (community: Community | undefined, sortType: string): boolean => {
  const publishedPostSorts = community?.pageSorts?.posts;
  // Checked first because multiboard views run this for every board on every store update.
  if (!publishedPostSorts || sortType in publishedPostSorts) {
    return false;
  }
  const availableSortTypes = getAvailablePostSortTypes(community);
  return availableSortTypes.length > 0 && !availableSortTypes.includes(sortType);
};
