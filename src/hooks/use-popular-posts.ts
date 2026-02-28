import { useMemo, useRef } from 'react';
import { Comment, Subplebbit } from '@bitsocialhq/pkc-react-hooks';
import { getCommentMediaInfo, getHasThumbnail } from '../lib/utils/media-utils';

const MAX_POSTS = 8;
const MAX_PER_SUB = 3;

/**
 * Ranked by replyCount instead of a static threshold so the box
 * adapts to both low- and high-activity periods.
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

        subPosts.sort((a, b) => (b.replyCount ?? 0) - (a.replyCount ?? 0));
        allPosts.push(...subPosts.slice(0, MAX_PER_SUB));
      }

      // Primary: most replies first. Tiebreaker: newest first.
      allPosts.sort((a, b) => {
        const diff = (b.replyCount ?? 0) - (a.replyCount ?? 0);
        return diff !== 0 ? diff : (b.timestamp ?? 0) - (a.timestamp ?? 0);
      });

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
