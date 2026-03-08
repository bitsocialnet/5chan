import { useMemo } from 'react';
import type { DirectoryCommunity } from './use-directories';
import { computeGuiPostsPerPage, getBoardFeedPageSizeConstants, type CommunityWithPostsPerPage } from '../lib/utils/board-feed-pagination';

type BoardFeedPageSize = ReturnType<typeof getBoardFeedPageSizeConstants>;

/**
 * Compute board feed page-size values from directory community.
 *
 * - Single directory board: uses community.features.postsPerPage when valid numeric > 0
 * - Missing metadata, non-directory board, /all, /subs, /mod: fallback 15
 *
 * Returns: guiPostsPerPage, maxGuiPages (10), paginationFeedPostsPerPage, infiniteFeedPostsPerPage
 */
export const useBoardFeedPageSize = (community?: DirectoryCommunity | null): BoardFeedPageSize => {
  return useMemo(() => {
    const guiPostsPerPage = computeGuiPostsPerPage(community as CommunityWithPostsPerPage | null | undefined);
    return getBoardFeedPageSizeConstants(guiPostsPerPage);
  }, [community]);
};
