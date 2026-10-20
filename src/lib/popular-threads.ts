import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import { getCommentMediaInfo, getHasThumbnail } from './utils/media-utils';

export const MAX_POPULAR_THREADS = 8;
// Each page load samples the box from the most popular boards, so a refresh
// rotates threads without surfacing boards that have gone quiet.
const CANDIDATE_POOL_SIZE = MAX_POPULAR_THREADS * 2;

// Activity relevance halves every 3 days
const HALF_LIFE_SECONDS = 72 * 3600;

export type PopularThreadCandidate = {
  post: Comment;
  score: number;
};

export type BoardThreads = {
  address: string;
  /** The board's hot threads, or undefined while the board has not loaded. */
  threads: Comment[] | undefined;
};

/**
 * Time-decayed popularity: replyCount divided by age of latest
 * activity so a stale post with many old replies loses to a newer
 * post with a few recent replies.
 */
export function popularityScore(post: Comment, nowSeconds: number): number {
  const lastActivity = post.lastReplyTimestamp ?? post.timestamp ?? 0;
  const ageSeconds = Math.max(0, nowSeconds - lastActivity);
  const replies = post.replyCount ?? 0;
  return Math.max(replies, 0.1) / (1 + ageSeconds / HALF_LIFE_SECONDS);
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

const byScoreDescending = (a: PopularThreadCandidate, b: PopularThreadCandidate) => b.score - a.score;

/**
 * Returns each board's most popular thread, most popular first. A board
 * whose best thread shares media with a more popular board's pick falls
 * back to its next best thread.
 */
export function getBoardTopThreads(boards: BoardThreads[], scoreTimestamp: number): PopularThreadCandidate[] {
  // Directories dedupe by public key, so one address can still be listed twice;
  // it is the same board either way and must contribute only one thread.
  const seenAddresses = new Set<string>();
  const rankedBoardThreads = boards.flatMap(({ address, threads: boardThreads }) => {
    if (!address || !boardThreads || seenAddresses.has(address)) {
      return [];
    }
    seenAddresses.add(address);

    const threads = boardThreads
      .filter(isEligiblePost)
      .map((post) => ({ post, score: popularityScore(post, scoreTimestamp) }))
      .sort(byScoreDescending);
    return threads.length ? [threads] : [];
  });
  rankedBoardThreads.sort((a, b) => byScoreDescending(a[0], b[0]));

  const selectedLinks = new Set<string>();
  const topThreads: PopularThreadCandidate[] = [];
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

/** The top of the ranking in random order: the box shows the first threads of it that it can use. */
export function getPopularThreadPool(topThreads: PopularThreadCandidate[]): PopularThreadCandidate[] {
  return shuffle(topThreads.slice(0, CANDIDATE_POOL_SIZE));
}

/** Orders the threads the box shows, most popular first. */
export function toPopularPosts(candidates: PopularThreadCandidate[]): Comment[] {
  return candidates
    .slice(0, MAX_POPULAR_THREADS)
    .sort(byScoreDescending)
    .map(({ post }) => post);
}
