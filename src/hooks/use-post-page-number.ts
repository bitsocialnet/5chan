import { useMemo } from 'react';
import { useFeed } from '@bitsocialhq/pkc-react-hooks';
import useFeedsStore from '@bitsocialhq/pkc-react-hooks/dist/stores/feeds';
import { useDirectoryByAddress } from './use-directories';
import { useBoardFeedPageSize } from './use-board-feed-page-size';
import { findPostPageInFeed, findPostPageInLoadedBoardFeeds, type FeedsOptionsLike, type LoadedFeedsLike } from '../lib/utils/post-page-resolution';

export interface UsePostPageNumberOptions {
  subplebbitAddress: string | undefined;
  postCid: string | undefined;
  /** When false, page segment is excluded (e.g. pending-post view). When true, resolve and show page. */
  enabled?: boolean;
}

/**
 * Resolve the board pagination page (1-based) for a post in a thread view.
 * Uses cache-first lookup from feeds store, then preloads via useFeed if miss.
 * Preload depth is capped to board pagination window (10 pages via paginationFeedPostsPerPage).
 *
 * @returns 1-based page number, or undefined when unresolved (render as "?")
 */
export function usePostPageNumber({ subplebbitAddress, postCid, enabled = true }: UsePostPageNumberOptions): number | undefined {
  const community = useDirectoryByAddress(subplebbitAddress);
  const { guiPostsPerPage, paginationFeedPostsPerPage } = useBoardFeedPageSize(community);

  const canResolve = Boolean(enabled && subplebbitAddress && postCid && guiPostsPerPage > 0);

  // Cache-first: selector returns only computed page to minimize rerenders
  const cachedPage = useFeedsStore((state) => {
    if (!canResolve) return undefined;
    return findPostPageInLoadedBoardFeeds(state.feedsOptions as FeedsOptionsLike, state.loadedFeeds as LoadedFeedsLike, subplebbitAddress!, postCid!, guiPostsPerPage);
  });

  // Preload when cache miss and enabled (10 GUI pages)
  const preloadOptions = useMemo(
    () =>
      canResolve
        ? {
            subplebbitAddresses: [subplebbitAddress!],
            sortType: 'active' as const,
            postsPerPage: paginationFeedPostsPerPage,
          }
        : undefined,
    [canResolve, subplebbitAddress, paginationFeedPostsPerPage],
  );

  const { feed: preloadFeed } = useFeed(preloadOptions);

  const preloadedPage = useMemo(() => {
    if (!canResolve || !preloadFeed?.length) return undefined;
    return findPostPageInFeed(preloadFeed, postCid!, guiPostsPerPage);
  }, [canResolve, postCid, preloadFeed, guiPostsPerPage]);

  return cachedPage ?? preloadedPage;
}
