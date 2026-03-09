import { useMemo, useRef } from 'react';
import { Comment, Subplebbit } from '@bitsocialnet/bitsocial-react-hooks';
import { getCommentMediaInfo, getHasThumbnail } from '../lib/utils/media-utils';
import useSubplebbitsLoadingStartTimestamps from '../stores/use-subplebbits-loading-start-timestamps-store';
import { useCurrentTime } from './use-current-time';

const MAX_POSTS = 8;
const BOARD_LOADING_TIMEOUT_SECONDS = 30;

// Activity relevance halves every 3 days
const HALF_LIFE_SECONDS = 72 * 3600;

type PopularPostCandidate = {
  boardAddress: string;
  post: Comment;
};

type CommittedPopularPosts = {
  posts: Comment[];
  revealed: boolean;
};

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

function isBoardStillLoading(subplebbit: Subplebbit | undefined, loadingStartTimestamp: number | undefined, nowSeconds: number): boolean {
  if (subplebbit?.updatedAt) {
    return false;
  }

  if (!loadingStartTimestamp) {
    return true;
  }

  return nowSeconds - loadingStartTimestamp < BOARD_LOADING_TIMEOUT_SECONDS;
}

function shuffleBoardAddresses(boardAddresses: string[]): string[] {
  const shuffledBoardAddresses = [...boardAddresses];

  for (let index = shuffledBoardAddresses.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffledBoardAddresses[index], shuffledBoardAddresses[randomIndex]] = [shuffledBoardAddresses[randomIndex], shuffledBoardAddresses[index]];
  }

  return shuffledBoardAddresses;
}

/**
 * Each board contributes at most one time-decayed popular thread, but the
 * board order is shuffled on mount so repeat visits surface different boards.
 *
 * The first revealed set is frozen until the user refreshes or changes
 * the board filter, so threads never disappear during background loads.
 */
const usePopularPosts = (subplebbits: Array<Subplebbit | undefined>, subplebbitAddresses: string[]) => {
  const inputKey = [...subplebbitAddresses].sort().join(',');
  const committedRef = useRef<CommittedPopularPosts>({
    posts: [],
    revealed: false,
  });
  const prevInputKeyRef = useRef('');
  const randomizedBoardAddressesRef = useRef<string[]>([]);

  // Reset committed and reshuffle when the requested board set changes (e.g. NSFW filter toggle).
  if (prevInputKeyRef.current !== inputKey) {
    prevInputKeyRef.current = inputKey;
    randomizedBoardAddressesRef.current = shuffleBoardAddresses(subplebbitAddresses);
    committedRef.current = {
      posts: [],
      revealed: false,
    };
  }

  const currentTime = useCurrentTime(committedRef.current.revealed ? 300 : 5);
  const nowSeconds = Math.floor(currentTime);
  const loadingStartTimestamps = useSubplebbitsLoadingStartTimestamps(subplebbitAddresses);

  const candidates = useMemo<PopularPostCandidate[]>(() => {
    if (committedRef.current.revealed || committedRef.current.posts.length >= MAX_POSTS) {
      return [];
    }

    try {
      const selectedLinks = new Set<string>();
      const allPosts: PopularPostCandidate[] = [];
      const subplebbitsByAddress = new Map(subplebbitAddresses.map((boardAddress, index) => [boardAddress, subplebbits[index]]));

      randomizedBoardAddressesRef.current.forEach((boardAddress) => {
        const subplebbit = subplebbitsByAddress.get(boardAddress);
        if (!boardAddress || !subplebbit?.posts?.pages?.hot?.comments) {
          return;
        }

        const subPosts: Comment[] = [];
        for (const post of Object.values(subplebbit.posts.pages.hot.comments as Record<string, Comment>)) {
          const { deleted, link, linkHeight, linkWidth, locked, pinned, removed, thumbnailUrl } = post;

          try {
            const commentMediaInfo = getCommentMediaInfo(link, thumbnailUrl, linkWidth, linkHeight);
            const hasThumbnail = getHasThumbnail(commentMediaInfo, link);

            if (hasThumbnail && !deleted && !removed && !locked && !pinned) {
              subPosts.push(post);
            }
          } catch {
            // skip posts with malformed media URLs
          }
        }

        subPosts.sort((a, b) => popularityScore(b, nowSeconds) - popularityScore(a, nowSeconds));

        const bestPost = subPosts.find((post) => !selectedLinks.has(post.link));
        if (bestPost) {
          allPosts.push({ boardAddress, post: bestPost });
          selectedLinks.add(bestPost.link);
        }
      });

      return allPosts;
    } catch (err) {
      console.error('Error in usePopularPosts:', err);
      return [];
    }
  }, [nowSeconds, subplebbits, subplebbitAddresses]);

  const hasPendingBoards = subplebbitAddresses.some((_, index) => isBoardStillLoading(subplebbits[index], loadingStartTimestamps[index], nowSeconds));

  if (!committedRef.current.revealed && (candidates.length >= MAX_POSTS || (!hasPendingBoards && candidates.length > 0))) {
    committedRef.current.posts = candidates.slice(0, MAX_POSTS).map(({ post }) => post);
    committedRef.current.revealed = true;
  }

  const isLoading = !committedRef.current.revealed;

  return { popularPosts: committedRef.current.revealed ? committedRef.current.posts : [], isLoading, error: null as string | null };
};

export default usePopularPosts;
