import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findNewThreadReplies, getThreadDeadReason } from '../thread-updater-utils';

const testState = vi.hoisted(() => ({
  commentCidsToAccountsComments: {} as Record<string, unknown>,
}));

vi.mock('../../bitsocial-internals/stores', () => ({
  accountsStore: {
    getState: () => ({ commentCidsToAccountsComments: testState.commentCidsToAccountsComments }),
  },
}));

const post = { cid: 'op', number: 1 } as Comment;
const reply = (cid: string, fields: Partial<Comment> = {}) => ({ cid, parentCid: 'op', postCid: 'op', ...fields }) as Comment;

describe('findNewThreadReplies', () => {
  beforeEach(() => {
    testState.commentCidsToAccountsComments = {};
  });

  it('counts only replies that were not seen yet', () => {
    const replies = [reply('a', { number: 2 }), reply('b', { number: 3 }), reply('c', { number: 4 })];

    expect(findNewThreadReplies({ post, replies, seenReplyCids: new Set(['a']) })).toEqual({ count: 2, quotesOwnPost: false });
  });

  it("skips the viewer's own replies, published or pending", () => {
    testState.commentCidsToAccountsComments = { mine: { accountId: 'account', accountCommentIndex: 0 } };
    const replies = [reply('a'), reply('mine'), { index: 3, content: 'pending' } as Comment, reply('b')];

    expect(findNewThreadReplies({ post, replies, seenReplyCids: new Set(['a']) })).toEqual({ count: 1, quotesOwnPost: false });
  });

  it("flags new replies that quote or answer the viewer's posts", () => {
    testState.commentCidsToAccountsComments = { mine: {} };
    const seenReplyCids = new Set(['mine']);

    expect(findNewThreadReplies({ post, replies: [reply('mine', { number: 7 }), reply('b', { content: '>>7 based' })], seenReplyCids }).quotesOwnPost).toBe(true);
    expect(findNewThreadReplies({ post, replies: [reply('mine', { number: 7 }), reply('b', { parentCid: 'mine' })], seenReplyCids }).quotesOwnPost).toBe(true);
    expect(findNewThreadReplies({ post, replies: [reply('mine', { number: 7 }), reply('b', { content: '>>17 >>70' })], seenReplyCids }).quotesOwnPost).toBe(false);
  });

  it("treats a quote of the viewer's own thread as a reply to them, but not every thread reply", () => {
    testState.commentCidsToAccountsComments = { op: {} };

    expect(findNewThreadReplies({ post, replies: [reply('b')], seenReplyCids: new Set() }).quotesOwnPost).toBe(false);
    expect(findNewThreadReplies({ post, replies: [reply('b', { content: '>>1' })], seenReplyCids: new Set() }).quotesOwnPost).toBe(true);
  });
});

describe('getThreadDeadReason', () => {
  it('reports archived and deleted threads', () => {
    expect(getThreadDeadReason(undefined)).toBeUndefined();
    expect(getThreadDeadReason(post)).toBeUndefined();
    expect(getThreadDeadReason({ ...post, archived: true } as Comment)).toBe('archived');
    expect(getThreadDeadReason({ ...post, commentModeration: { archived: true } } as Comment)).toBe('archived');
    expect(getThreadDeadReason({ ...post, deleted: true } as Comment)).toBe('deleted');
    expect(getThreadDeadReason({ ...post, removed: true } as Comment)).toBe('deleted');
    expect(getThreadDeadReason({ ...post, commentModeration: { purged: true } } as Comment)).toBe('deleted');
  });
});
