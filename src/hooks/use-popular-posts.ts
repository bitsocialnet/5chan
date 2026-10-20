import { useMemo } from 'react';
import { Comment, getPreloadedPostSortType, type Community } from '@bitsocial/bitsocial-react-hooks';
import { MAX_POPULAR_THREADS, getBoardTopThreads, getPopularThreadPool, toPopularPosts, type PopularThreadCandidate } from '../lib/popular-threads';
import useCommunitiesLoadingStartTimestamps from '../stores/use-communities-loading-start-timestamps-store';
import { useCurrentTime } from './use-current-time';

const BOARD_LOADING_TIMEOUT_SECONDS = 30;
// Once the box can be filled, stop waiting for boards that are still loading
// after this long, so one slow or offline board cannot hold the box back.
const FILLED_BOX_BOARD_WAIT_SECONDS = 8;

type PopularPostsCacheEntry = {
  // Fixed per page load so the ranking does not drift while boards load.
  scoreTimestamp: number;
  posts: Comment[];
  revealed: boolean;
};

const popularPostsCacheByInputKey = new Map<string, PopularPostsCacheEntry>();

function isBoardStillLoading(community: Community | undefined, loadingStartTimestamp: number | undefined, nowSeconds: number, timeoutSeconds: number): boolean {
  if (community?.updatedAt) {
    return false;
  }

  if (!loadingStartTimestamp) {
    return true;
  }

  return nowSeconds - loadingStartTimestamp < timeoutSeconds;
}

function getPopularPostsInputKey(communityAddresses: string[]): string {
  return [...communityAddresses].sort().join(',');
}

function getPopularPostsCacheEntry(inputKey: string): PopularPostsCacheEntry {
  const cachedEntry = popularPostsCacheByInputKey.get(inputKey);
  if (cachedEntry) {
    return cachedEntry;
  }

  const cacheEntry = {
    scoreTimestamp: Math.floor(Date.now() / 1000),
    posts: [],
    revealed: false,
  };
  popularPostsCacheByInputKey.set(inputKey, cacheEntry);
  return cacheEntry;
}

export function getRevealedPopularPosts(communityAddresses: string[]): Comment[] | undefined {
  const cacheEntry = popularPostsCacheByInputKey.get(getPopularPostsInputKey(communityAddresses));
  return cacheEntry?.revealed ? cacheEntry.posts : undefined;
}

export function clearPopularPostsCacheForTest() {
  popularPostsCacheByInputKey.clear();
}

/**
 * Ranks every board's most popular thread once the boards have loaded, then
 * shows a random sample from the top of that ranking, one thread per board.
 * Waiting for the boards matters: they load in a fixed order, so revealing
 * the first boards to arrive would show the same boards on every visit.
 *
 * The revealed set is frozen until a real browser refresh creates a fresh
 * module instance or the board filter changes, so threads never disappear
 * during background loads or repeat navigation.
 */
const usePopularPosts = (communities: Array<Community | undefined>, communityAddresses: string[]) => {
  const inputKey = getPopularPostsInputKey(communityAddresses);
  const cacheEntry = getPopularPostsCacheEntry(inputKey);
  const { scoreTimestamp } = cacheEntry;

  const currentTime = useCurrentTime(cacheEntry.revealed ? false : 5);
  const nowSeconds = Math.floor(currentTime);
  const loadingStartTimestamps = useCommunitiesLoadingStartTimestamps(communityAddresses);

  const topThreads = useMemo<PopularThreadCandidate[]>(() => {
    if (cacheEntry.revealed) {
      return [];
    }

    try {
      const boards = communityAddresses.map((address, index) => {
        // A board preloads one page of threads under whichever sort it chooses, not always hot.
        const community = communities[index];
        const preloadedSortType = getPreloadedPostSortType(community);
        const comments = (preloadedSortType ? community?.posts?.pages?.[preloadedSortType]?.comments : undefined) as Record<string, Comment> | undefined;
        return { address, threads: comments ? Object.values(comments) : undefined };
      });
      return getBoardTopThreads(boards, scoreTimestamp);
    } catch (err) {
      console.error('Error in usePopularPosts:', err);
      return [];
    }
  }, [communities, communityAddresses, cacheEntry.revealed, scoreTimestamp]);

  const boardLoadingTimeoutSeconds = topThreads.length >= MAX_POPULAR_THREADS ? FILLED_BOX_BOARD_WAIT_SECONDS : BOARD_LOADING_TIMEOUT_SECONDS;
  const hasPendingBoards = communityAddresses.some((_, index) =>
    isBoardStillLoading(communities[index], loadingStartTimestamps[index], nowSeconds, boardLoadingTimeoutSeconds),
  );

  if (!cacheEntry.revealed && !hasPendingBoards && topThreads.length > 0) {
    cacheEntry.posts = toPopularPosts(getPopularThreadPool(topThreads));
    cacheEntry.revealed = true;
  }

  const isLoading = !cacheEntry.revealed;

  return { popularPosts: cacheEntry.revealed ? cacheEntry.posts : [], isLoading, error: null as string | null };
};

export default usePopularPosts;
