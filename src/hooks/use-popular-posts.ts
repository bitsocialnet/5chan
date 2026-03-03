import { useMemo, useRef } from 'react';
import { Comment, Subplebbit } from '@bitsocialhq/pkc-react-hooks';
import { getCommentMediaInfo, getHasThumbnail } from '../lib/utils/media-utils';

const MAX_POSTS = 8;
const MAX_PER_SUB = 3;

// Activity relevance halves every 3 days
const HALF_LIFE_SECONDS = 72 * 3600;

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

/**
 * Ranked by time-decayed popularity so the box surfaces posts with
 * recent engagement rather than stale all-time reply leaders.
 *
 * Grow-only commit: once a post enters the grid it never shifts or
 * disappears — new posts fill remaining slots until the cap is reached.
 */
const usePopularPosts = (subplebbits: Subplebbit[]) => {
  const committedRef = useRef<{ posts: Comment[]; cids: Set<string> }>({
    posts: [],
    cids: new Set(),
  });
  const prevInputKeyRef = useRef('');

  // Reset committed when the board set changes (e.g. NSFW filter toggle)
  const inputKey = subplebbits
    .map((s) => s?.address)
    .filter(Boolean)
    .sort()
    .join(',');
  if (prevInputKeyRef.current !== inputKey) {
    prevInputKeyRef.current = inputKey;
    committedRef.current = { posts: [], cids: new Set() };
  }

  const candidates = useMemo(() => {
    if (committedRef.current.posts.length >= MAX_POSTS) return [];

    const nowSeconds = Math.floor(Date.now() / 1000);

    try {
      const uniqueLinks = new Set<string>();
      const allPosts: Comment[] = [];

      for (const sub of subplebbits) {
        if (!sub?.posts?.pages?.hot?.comments) continue;

        const subPosts: Comment[] = [];
        for (const post of Object.values(sub.posts.pages.hot.comments as Comment)) {
          const { deleted, link, linkHeight, linkWidth, locked, pinned, removed, thumbnailUrl } = post;

          try {
            const commentMediaInfo = getCommentMediaInfo(link, thumbnailUrl, linkWidth, linkHeight);
            const hasThumbnail = getHasThumbnail(commentMediaInfo, link);

            if (hasThumbnail && !deleted && !removed && !locked && !pinned && !uniqueLinks.has(link)) {
              subPosts.push(post);
              uniqueLinks.add(link);
            }
          } catch {
            // skip posts with malformed media URLs
          }
        }

        subPosts.sort((a, b) => popularityScore(b, nowSeconds) - popularityScore(a, nowSeconds));
        allPosts.push(...subPosts.slice(0, MAX_PER_SUB));
      }

      allPosts.sort((a, b) => popularityScore(b, nowSeconds) - popularityScore(a, nowSeconds));

      return allPosts;
    } catch (err) {
      console.error('Error in usePopularPosts:', err);
      return [];
    }
  }, [subplebbits]);

  // Grow-only: committed posts keep their position, new ones fill empty slots
  const { posts, cids } = committedRef.current;
  for (const post of candidates) {
    if (posts.length >= MAX_POSTS) break;
    if (post.cid && !cids.has(post.cid)) {
      posts.push(post);
      cids.add(post.cid);
    }
  }

  const hasLoadedData = subplebbits.some((sub) => sub?.posts?.pages?.hot?.comments);
  const isLoading = subplebbits.length > 0 && !hasLoadedData;

  return { popularPosts: posts, isLoading, error: null as string | null };
};

export default usePopularPosts;
