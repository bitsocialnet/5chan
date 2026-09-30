import type { Comment } from '@bitsocial/bitsocial-react-hooks';

type QuoteTargetAvailability = 'available' | 'unresolved' | 'unavailable';

export const formatQuoteNumber = (number?: number) => `>>${number ?? '?'}`;

type QuoteTargetComment = Partial<Pick<Comment, 'deleted' | 'removed' | 'commentModeration'>>;

export const getQuoteTargetAvailability = (comment?: QuoteTargetComment | null): QuoteTargetAvailability => {
  if (!comment) {
    return 'unresolved';
  }

  return comment.deleted || comment.removed || comment.commentModeration?.purged ? 'unavailable' : 'available';
};

export const isUnavailableQuoteTarget = (comment?: QuoteTargetComment | null) => getQuoteTargetAvailability(comment) === 'unavailable';

export const shouldShowFloatingQuotePreview = ({
  hoveredCid,
  outOfViewCid,
  quoteCid,
  isUnavailable,
}: {
  hoveredCid: string | null;
  outOfViewCid: string | null;
  quoteCid?: string;
  isUnavailable?: boolean;
}) => Boolean(quoteCid && !isUnavailable && hoveredCid === quoteCid && outOfViewCid === quoteCid);

type ThreadReply = QuoteTargetComment & Partial<Pick<Comment, 'cid' | 'pendingApproval'>> & { replies?: RepliesPages };
type RepliesPages = {
  pageCids?: Record<string, unknown>;
  pages?: Record<string, { comments?: Array<ThreadReply | undefined>; nextCid?: string } | undefined>;
};

// The replies (nested ones included) of a comment whose preloaded replies page holds them all, as
// the community only publishes pageCids and a nextCid once that page overflows. Feed and board
// copies of a thread carry this page too, so short threads are complete without opening them.
export const getPreloadedThreadReplies = (replies?: RepliesPages): ThreadReply[] | undefined => {
  if (!replies || Object.keys(replies.pageCids || {}).length > 0) {
    return undefined;
  }

  const page = Object.values(replies.pages || {}).find((candidate) => Array.isArray(candidate?.comments) && !candidate.nextCid);
  // An incomplete nested page leaves replies out, which getCompleteThreadCids catches via replyCount.
  return page?.comments?.flatMap((reply) => (reply ? [reply, ...(getPreloadedThreadReplies(reply.replies) ?? [])] : []));
};

// The thread's own cid plus every loaded reply cid, or undefined while any reply may be unloaded.
// The community's replyCount excludes deleted, removed, and pending replies, so only the rest count.
export const getCompleteThreadCids = ({
  hasMore,
  postCid,
  replies,
  replyCount,
}: {
  hasMore: boolean;
  postCid?: string;
  replies?: Array<ThreadReply | undefined>;
  replyCount?: number;
}): ReadonlySet<string> | undefined => {
  if (!postCid || !replies || hasMore || typeof replyCount !== 'number') {
    return undefined;
  }

  const cids = new Set([postCid]);
  let countedReplyCount = 0;
  for (const reply of replies) {
    if (!reply?.cid || cids.has(reply.cid)) continue;
    cids.add(reply.cid);
    if (!reply.pendingApproval && getQuoteTargetAvailability(reply) === 'available') {
      countedReplyCount++;
    }
  }

  return countedReplyCount >= replyCount ? cids : undefined;
};

// The community verifies that every quotedCid is in the reply's thread when it is published, and
// only purging drops a comment from the thread's pages (deleted and removed ones stay flagged). A
// quotedCid missing from a completely loaded thread was therefore purged. Its number is usually
// unknown (it was never loaded), so the >>number that quoted it cannot resolve; those numbers are
// only paired with the unnumbered purged cids when the pairing is unambiguous. A same-thread quote
// is numbered after the OP and before the reply.
export const getPurgedQuoteNumbers = ({
  cidToNumber,
  contentNumbers,
  numberToCid,
  purgedQuotedCids,
  replyNumber,
  threadNumber,
}: {
  cidToNumber: Record<string, number>;
  contentNumbers: Iterable<number>;
  numberToCid?: Record<number, string>;
  purgedQuotedCids: string[];
  replyNumber?: number;
  threadNumber?: number;
}): number[] => {
  const knownPurgedNumbers = new Set<number>();
  let unnumberedPurgedCidCount = 0;
  for (const cid of purgedQuotedCids) {
    const number = cidToNumber[cid];
    if (typeof number === 'number') {
      knownPurgedNumbers.add(number);
    } else {
      unnumberedPurgedCidCount++;
    }
  }

  const numbers = [...contentNumbers];
  const unresolvedNumbers = numbers.filter(
    (number) => !numberToCid?.[number] && (threadNumber === undefined || number > threadNumber) && (replyNumber === undefined || number < replyNumber),
  );
  const pairedNumbers = unnumberedPurgedCidCount > 0 && unresolvedNumbers.length === unnumberedPurgedCidCount ? unresolvedNumbers : [];
  return [...numbers.filter((number) => knownPurgedNumbers.has(number)), ...pairedNumbers];
};
