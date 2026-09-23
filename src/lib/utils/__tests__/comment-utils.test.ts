import { describe, expect, it, vi } from 'vitest';
import { withResolvedCommentCommunityAddress } from '../comment-utils';

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
