const GUI_POSTS_PER_PAGE_FALLBACK = 15;
const MAX_GUI_PAGES = 10;

/** Minimal shape for directory community with optional postsPerPage */
export interface CommunityWithPostsPerPage {
  features?: { postsPerPage?: number };
}

/**
 * Compute posts-per-page for the GUI from directory features.
 * Single directory board: uses community.features.postsPerPage when valid numeric > 0.
 * Missing metadata, non-directory board, /all, /subs, /mod: fallback 15.
 */
export const computeGuiPostsPerPage = (community?: CommunityWithPostsPerPage | null): number => {
  const value = community?.features?.postsPerPage;
  if (typeof value === 'number' && value > 0 && Number.isFinite(value)) {
    return Math.floor(value);
  }
  return GUI_POSTS_PER_PAGE_FALLBACK;
};

/**
 * Board feed pagination constants.
 * Fallback 15 and max 10 GUI pages are fixed.
 */
export const getBoardFeedPageSizeConstants = (guiPostsPerPage: number) => ({
  guiPostsPerPage,
  maxGuiPages: MAX_GUI_PAGES,
  paginationFeedPostsPerPage: guiPostsPerPage * MAX_GUI_PAGES,
  infiniteFeedPostsPerPage: guiPostsPerPage,
});

/**
 * Slice items for a given page with page clamping.
 * When total items shrink, the requested page is clamped to the last valid page.
 */
export const getPageSlice = <T>(items: T[], page: number, guiPostsPerPage: number, maxGuiPages: number): T[] => {
  if (guiPostsPerPage <= 0 || maxGuiPages <= 0) {
    return [];
  }

  const totalItems = items.length;
  const totalGuiPages = Math.min(maxGuiPages, Math.ceil(totalItems / guiPostsPerPage) || 1);
  const clampedPage = Math.max(1, Math.min(page, totalGuiPages));
  const start = (clampedPage - 1) * guiPostsPerPage;
  const end = start + guiPostsPerPage;

  return items.slice(start, end);
};
