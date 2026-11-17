import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import useLatestFeedPosts from '../use-latest-feed-posts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const comment = (fields: Partial<Comment>) => fields as Comment;

describe('useLatestFeedPosts', () => {
  let container: HTMLDivElement;
  let root: Root;
  let result: (Comment | undefined)[];

  const render = async (posts: (Comment | undefined)[], updatedFeed: Comment[] | undefined) => {
    const Harness = () => {
      result = useLatestFeedPosts(posts, updatedFeed);
      return null;
    };
    await act(async () => root.render(createElement(Harness)));
  };

  beforeEach(() => {
    container = document.createElement('div');
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
  });

  it('returns the list itself until a post has a newer update', async () => {
    const posts = [comment({ cid: 'a', replyCount: 0, updatedAt: 100 }), comment({ cid: 'b', replyCount: 1, updatedAt: 100 })];
    await render(posts, undefined);
    expect(result).toBe(posts);
    await render(posts, [...posts]);
    expect(result).toBe(posts);
  });

  it('replaces only posts with a newer update, keeping the order and posts outside the feed', async () => {
    const localPost = comment({ cid: 'local', replyCount: 0 });
    const posts = [comment({ cid: 'b', replyCount: 1, updatedAt: 100 }), localPost, undefined, comment({ cid: 'a', replyCount: 0, updatedAt: 100 })];
    const updatedFeed = [
      comment({ cid: 'a', replyCount: 2, updatedAt: 200 }),
      comment({ cid: 'b', replyCount: 7, updatedAt: 50 }),
      comment({ cid: 'c', replyCount: 3, updatedAt: 300 }),
    ];
    await render(posts, updatedFeed);
    expect(result.map((post) => post?.cid)).toEqual(['b', 'local', undefined, 'a']);
    expect(result.map((post) => post?.replyCount)).toEqual([1, 0, undefined, 2]);
    expect(result[1]).toBe(localPost);
  });
});
