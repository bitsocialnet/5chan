import { useMemo } from 'react';
import { Comment, type Community } from '@bitsocial/bitsocial-react-hooks';
import { getCommentMediaInfo, getHasThumbnail } from '../lib/utils/media-utils';
import useCommunitiesLoadingStartTimestamps from '../stores/use-communities-loading-start-timestamps-store';
import { useCurrentTime } from './use-current-time';

const MAX_POSTS = 8;
// Each page load samples the box from the most popular boards, so a refresh
// rotates threads without surfacing boards that have gone quiet.
const CANDIDATE_POOL_SIZE = MAX_POSTS * 2;
const BOARD_LOADING_TIMEOUT_SECONDS = 30;
// Once the box can be filled, stop waiting for boards that are still loading
// after this long, so one slow or offline board cannot hold the box back.
const FILLED_BOX_BOARD_WAIT_SECONDS = 8;

// Activity relevance halves every 3 days
const HALF_LIFE_SECONDS = 72 * 3600;

type PopularPostCandidate = {
  post: Comment;
  score: number;
};

type PopularPostsCacheEntry = {
  // Fixed per page load so the ranking does not drift while boards load.
  scoreTimestamp: number;
  posts: Comment[];
  revealed: boolean;
};

const popularPostsCacheByInputKey = new Map<string, PopularPostsCacheEntry>();

/**
 * Time-decayed popularity: replyCount divided by age of latest
 * activity so a stale post with many old replies loses to a newer
 * post with a few recent replies.
 */
function popularityScore(post: Comment, nowSeconds: number): number {
  const lastActivity = post.lastReplyTimestamp ?? post.timestamp ?? 0;
  const ageSeconds = Math.max(0, nowSeconds - lastActivity);
  const replies = post.replyCount ?? 0;
  return Math.max(replies, 0.1) / (1 + ageSeconds / HALF_LIFE_SECONDS);
}

function isBoardStillLoading(community: Community | undefined, loadingStartTimestamp: number | undefined, nowSeconds: number, timeoutSeconds: number): boolean {
  if (community?.updatedAt) {
    return false;
  }

  if (!loadingStartTimestamp) {
    return true;
  }

  return nowSeconds - loadingStartTimestamp < timeoutSeconds;
}

function isEligiblePost(post: Comment): boolean {
  const { deleted, link, linkHeight, linkWidth, locked, pinned, removed, thumbnailUrl } = post;
  if (deleted || removed || locked || pinned) {
    return false;
  }

  try {
    return getHasThumbnail(getCommentMediaInfo(link, thumbnailUrl, linkWidth, linkHeight), link);
  } catch {
    // skip posts with malformed media URLs
    return false;
  }
}

const byScoreDescending = (a: PopularPostCandidate, b: PopularPostCandidate) => b.score - a.score;

/**
 * Returns each board's most popular thread, most popular first. A board
 * whose best thread shares media with a more popular board's pick falls
 * back to its next best thread.
 */
function getBoardTopThreads(communities: Array<Community | undefined>, communityAddresses: string[], scoreTimestamp: number): PopularPostCandidate[] {
  const rankedBoardThreads = communityAddresses.flatMap((boardAddress, index) => {
    const comments = communities[index]?.posts?.pages?.hot?.comments;
    if (!boardAddress || !comments) {
      return [];
    }

    const threads = Object.values(comments as Record<string, Comment>)
      .filter(isEligiblePost)
      .map((post) => ({ post, score: popularityScore(post, scoreTimestamp) }))
      .sort(byScoreDescending);
    return threads.length ? [threads] : [];
  });
  rankedBoardThreads.sort((a, b) => byScoreDescending(a[0], b[0]));

  const selectedLinks = new Set<string>();
  const topThreads: PopularPostCandidate[] = [];
  for (const threads of rankedBoardThreads) {
    const topThread = threads.find(({ post }) => !selectedLinks.has(post.link));
    if (topThread) {
      topThreads.push(topThread);
      selectedLinks.add(topThread.post.link);
    }
  }

  return topThreads.sort(byScoreDescending);
}

function shuffle<T>(items: T[]): T[] {
  const shuffledItems = [...items];

  for (let index = shuffledItems.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffledItems[index], shuffledItems[randomIndex]] = [shuffledItems[randomIndex], shuffledItems[index]];
  }

  return shuffledItems;
}

function pickPopularPosts(topThreads: PopularPostCandidate[]): Comment[] {
  return shuffle(topThreads.slice(0, CANDIDATE_POOL_SIZE))
    .slice(0, MAX_POSTS)
    .sort(byScoreDescending)
    .map(({ post }) => post);
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

  const topThreads = useMemo<PopularPostCandidate[]>(() => {
    if (cacheEntry.revealed) {
      return [];
    }

    try {
      return getBoardTopThreads(communities, communityAddresses, scoreTimestamp);
    } catch (err) {
      console.error('Error in usePopularPosts:', err);
      return [];
    }
  }, [communities, communityAddresses, cacheEntry.revealed, scoreTimestamp]);

  const boardLoadingTimeoutSeconds = topThreads.length >= MAX_POSTS ? FILLED_BOX_BOARD_WAIT_SECONDS : BOARD_LOADING_TIMEOUT_SECONDS;
  const hasPendingBoards = communityAddresses.some((_, index) =>
    isBoardStillLoading(communities[index], loadingStartTimestamps[index], nowSeconds, boardLoadingTimeoutSeconds),
  );

  if (!cacheEntry.revealed && !hasPendingBoards && topThreads.length > 0) {
    cacheEntry.posts = pickPopularPosts(topThreads);
    cacheEntry.revealed = true;
  }

  const isLoading = !cacheEntry.revealed;

  return { popularPosts: cacheEntry.revealed ? cacheEntry.posts : [], isLoading, error: null as string | null };
};

export default usePopularPosts;
