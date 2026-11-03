import { describe, expect, it, vi } from 'vitest';
import { hasAuthoritativeCommentPayload, mergeCommentFallback, withResolvedCommentCommunityAddress } from '../comment-utils';

describe('gallery-only comments', () => {
  const gallery = [{ htmlTagName: 'img', url: 'https://example.com/cat.jpg' }];

  it('count a gallery as payload', () => {
    expect(hasAuthoritativeCommentPayload({ gallery })).toBe(true);
    expect(hasAuthoritativeCommentPayload({ cid: 'cid' })).toBe(false);
  });

  it('keep a loaded gallery-only comment instead of its fallback', () => {
    const comment = { cid: 'cid', gallery };
    expect(mergeCommentFallback(comment, { cid: 'cid', content: 'fallback' })).toBe(comment);
  });
});

describe('withResolvedCommentCommunityAddress', () => {
  it('preserves canonical comments without traversing their preloaded reply trees', () => {
    const readReplies = vi.fn(() => ({ pages: { new: { comments: [{ communityAddress: 'board.bso' }] } } }));
    const post = {
      communityAddress: 'board.bso',
      get replies() {
        return readReplies();
      },
    };

    expect(withResolvedCommentCommunityAddress(post)).toBe(post);
    expect(readReplies).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 'unresolved', 0])('preserves an unresolved input: %s', (comment) => {
    expect(withResolvedCommentCommunityAddress(comment)).toBe(comment);
  });
});
