import type { Comment } from '@bitsocialnet/bitsocial-react-hooks';
import { describe, expect, it } from 'vitest';
import { getRenderableMobileBacklinks } from '../reply-backlink-utils';

const createReply = (overrides: Partial<Comment> = {}) =>
  ({
    cid: 'reply-cid',
    parentCid: 'target-cid',
    subplebbitAddress: 'music.eth',
    ...overrides,
  }) as Comment;

describe('getRenderableMobileBacklinks', () => {
  it('does not report mobile reply backlinks until a renderable backlink exists', () => {
    const unpublishedReply = createReply({
      number: undefined,
    });

    const beforePublish = getRenderableMobileBacklinks({
      cid: 'target-cid',
      parentCid: 'op-cid',
      quotedByMap: new Map([['target-cid', [unpublishedReply]]]),
      directRepliesByParentCid: new Map([['target-cid', [unpublishedReply]]]),
    });

    expect(beforePublish.directReplyBacklinks).toHaveLength(0);
    expect(beforePublish.quotedReplyBacklinks).toHaveLength(0);

    const publishedReply = createReply({
      cid: 'published-reply-cid',
      number: 42,
    });

    const afterPublish = getRenderableMobileBacklinks({
      cid: 'target-cid',
      parentCid: 'op-cid',
      quotedByMap: new Map([['target-cid', [publishedReply]]]),
      directRepliesByParentCid: new Map([['target-cid', [publishedReply]]]),
    });

    expect(afterPublish.directReplyBacklinks).toEqual([publishedReply]);
    expect(afterPublish.quotedReplyBacklinks).toHaveLength(0);
  });
});
