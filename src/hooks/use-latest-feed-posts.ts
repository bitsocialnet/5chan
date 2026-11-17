import { useMemo } from 'react';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';

/**
 * `useFeed().feed` keeps every post as it was when the feed first loaded it, so the list never
 * moves under the reader; the board's later updates to those posts (reply count, last reply, pin,
 * lock) only reach `useFeed().updatedFeed`. This shows a list's posts in their latest state while
 * leaving the list itself as it is: its order, and which posts are in it.
 */
const useLatestFeedPosts = <T extends Comment | undefined>(posts: T[], updatedFeed: readonly Comment[] | undefined): T[] =>
  useMemo(() => {
    if (!updatedFeed?.length || posts.length === 0) {
      return posts;
    }
    const updatedPostsByCid = new Map<string, Comment>();
    for (const updatedPost of updatedFeed) {
      if (updatedPost?.cid) {
        updatedPostsByCid.set(updatedPost.cid, updatedPost);
      }
    }
    let hasNewerPost = false;
    const latestPosts = posts.map((post) => {
      const updatedPost = post?.cid ? updatedPostsByCid.get(post.cid) : undefined;
      if (updatedPost && (updatedPost.updatedAt || 0) > (post?.updatedAt || 0)) {
        hasNewerPost = true;
        return updatedPost as T;
      }
      return post;
    });
    return hasNewerPost ? latestPosts : posts;
  }, [posts, updatedFeed]);

export default useLatestFeedPosts;
