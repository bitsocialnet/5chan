import { describe, expect, it } from 'vitest';
import {
  formatQuoteNumber,
  getCompleteThreadCids,
  getPreloadedThreadReplies,
  getPurgedQuoteNumbers,
  getQuoteTargetAvailability,
  isUnavailableQuoteTarget,
  shouldShowFloatingQuotePreview,
} from '../quote-link-utils';

describe('quote-link-utils', () => {
  it('formats quote numbers with the expected prefix', () => {
    expect(formatQuoteNumber(123)).toBe('>>123');
    expect(formatQuoteNumber()).toBe('>>?');
  });

  it('distinguishes unresolved and unavailable quote targets', () => {
    expect(getQuoteTargetAvailability(undefined)).toBe('unresolved');
    expect(getQuoteTargetAvailability({ deleted: true, removed: false })).toBe('unavailable');
    expect(getQuoteTargetAvailability({ deleted: false, removed: true })).toBe('unavailable');
    expect(getQuoteTargetAvailability({ deleted: false, removed: false, commentModeration: { purged: true } })).toBe('unavailable');
    expect(getQuoteTargetAvailability({ deleted: false, removed: false })).toBe('available');
  });

  it('marks deleted, removed, and purged comments as unavailable quote targets', () => {
    expect(isUnavailableQuoteTarget(undefined)).toBe(false);
    expect(isUnavailableQuoteTarget({ deleted: true, removed: false })).toBe(true);
    expect(isUnavailableQuoteTarget({ deleted: false, removed: true })).toBe(true);
    expect(isUnavailableQuoteTarget({ deleted: false, removed: false, commentModeration: { purged: true } })).toBe(true);
    expect(isUnavailableQuoteTarget({ deleted: false, removed: false })).toBe(false);
  });

  it('only shows floating previews for available targets that are hovered out of view', () => {
    expect(
      shouldShowFloatingQuotePreview({
        hoveredCid: 'cid-1',
        outOfViewCid: 'cid-1',
        quoteCid: 'cid-1',
        isUnavailable: false,
      }),
    ).toBe(true);

    expect(
      shouldShowFloatingQuotePreview({
        hoveredCid: 'cid-1',
        outOfViewCid: 'cid-1',
        quoteCid: 'cid-1',
        isUnavailable: true,
      }),
    ).toBe(false);

    expect(
      shouldShowFloatingQuotePreview({
        hoveredCid: 'cid-1',
        outOfViewCid: 'cid-2',
        quoteCid: 'cid-1',
        isUnavailable: false,
      }),
    ).toBe(false);
  });

  it('returns thread cids only once every reply counted by the community is loaded', () => {
    const replies = [
      { cid: 'reply-1' },
      { cid: 'reply-2', removed: true },
      { cid: 'reply-3', deleted: true },
      { cid: 'reply-4' },
      { cid: 'reply-5', pendingApproval: true },
      { content: 'unpublished' },
      undefined,
    ];

    expect(getCompleteThreadCids({ hasMore: false, postCid: 'thread', replies, replyCount: 2 })).toEqual(
      new Set(['thread', 'reply-1', 'reply-2', 'reply-3', 'reply-4', 'reply-5']),
    );
    // Removed, deleted, and pending replies are not in replyCount, so they cannot stand in for a missing reply.
    expect(getCompleteThreadCids({ hasMore: false, postCid: 'thread', replies, replyCount: 3 })).toBeUndefined();
    expect(getCompleteThreadCids({ hasMore: true, postCid: 'thread', replies, replyCount: 2 })).toBeUndefined();
    expect(getCompleteThreadCids({ hasMore: false, postCid: 'thread', replies, replyCount: undefined })).toBeUndefined();
    expect(getCompleteThreadCids({ hasMore: false, postCid: undefined, replies, replyCount: 2 })).toBeUndefined();
  });

  it('counts a reply loaded twice only once', () => {
    expect(getCompleteThreadCids({ hasMore: false, postCid: 'thread', replies: [{ cid: 'reply-1' }, { cid: 'reply-1' }], replyCount: 2 })).toBeUndefined();
  });

  it('reads the whole reply tree from a preloaded page only when no further pages exist', () => {
    const nestedReply = { cid: 'reply-1a' };
    const replies = { pages: { best: { comments: [{ cid: 'reply-1', replies: { pages: { best: { comments: [nestedReply] } } } }, { cid: 'reply-2' }] } } };

    expect(getPreloadedThreadReplies(replies)?.map((reply) => reply.cid)).toEqual(['reply-1', 'reply-1a', 'reply-2']);
    expect(getPreloadedThreadReplies({ ...replies, pageCids: { new: 'page-cid' } })).toBeUndefined();
    expect(getPreloadedThreadReplies({ pages: { best: { comments: [{ cid: 'reply-1' }], nextCid: 'next-page' } } })).toBeUndefined();
    expect(getPreloadedThreadReplies(undefined)).toBeUndefined();
    // A nested chain that continues on another page leaves replies out, so replyCount keeps the thread incomplete.
    const truncatedNested = { pages: { best: { comments: [{ cid: 'reply-1', replies: { pageCids: { best: 'nested-page' } } }] } } };
    expect(getCompleteThreadCids({ hasMore: false, postCid: 'thread', replies: getPreloadedThreadReplies(truncatedNested), replyCount: 3 })).toBeUndefined();
  });

  it('pairs unresolved same-thread quote numbers with purged quoted cids only when unambiguous', () => {
    const numberToCid = { 170: 'reply-170' };
    const getNumbers = (contentNumbers: number[], replyNumber: number, purgedQuotedCids = ['purged-161']) =>
      getPurgedQuoteNumbers({ cidToNumber: {}, contentNumbers, numberToCid, purgedQuotedCids, replyNumber, threadNumber: 158 });

    expect(getNumbers([161], 162)).toEqual([161]);
    expect(getNumbers([161, 170], 180)).toEqual([161]);
    // A number outside the thread's range belongs to another thread, so it is not a pairing candidate.
    expect(getNumbers([50, 161], 162)).toEqual([161]);
    expect(getNumbers([161], 160)).toEqual([]);
    // Two unresolved candidates for one purged cid cannot be told apart.
    expect(getNumbers([159, 161], 162)).toEqual([]);
    expect(getNumbers([161], 162, [])).toEqual([]);
  });

  it('uses a purged cid number cached before the purge instead of pairing it with another quote', () => {
    expect(
      getPurgedQuoteNumbers({
        cidToNumber: { 'purged-161': 161 },
        contentNumbers: [161, 160],
        numberToCid: { 161: 'purged-161' },
        purgedQuotedCids: ['purged-161'],
        replyNumber: 162,
        threadNumber: 158,
      }),
    ).toEqual([161]);
  });
});
