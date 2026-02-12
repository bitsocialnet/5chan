import { useCallback, useMemo, useRef } from 'react';
import { Comment } from '@plebbit/plebbit-react-hooks';
import { QUOTE_NUMBER_REGEX } from '../lib/utils/url-utils';
import usePostNumberStore from '../stores/use-post-number-store';

interface ReplyQuoteTargets {
  reply: Comment;
  quotedPostNumbers: number[];
}

const getReplyFingerprint = (reply: Comment) =>
  `${reply?.cid ?? ''}|${reply?.deleted ? '1' : '0'}|${reply?.removed ? '1' : '0'}|${reply?.edit?.timestamp ?? ''}|${reply?.state ?? ''}`;

const areQuotedByMapsEquivalent = (previousMap: Map<string, Comment[]>, nextMap: Map<string, Comment[]>) => {
  if (previousMap.size !== nextMap.size) {
    return false;
  }

  for (const [quotedCid, nextReplies] of nextMap) {
    const previousReplies = previousMap.get(quotedCid);
    if (!previousReplies || previousReplies.length !== nextReplies.length) {
      return false;
    }

    for (let i = 0; i < nextReplies.length; i++) {
      if (getReplyFingerprint(previousReplies[i]) !== getReplyFingerprint(nextReplies[i])) {
        return false;
      }
    }
  }

  return true;
};

const extractReplyQuoteTargets = (replies: Comment[]) => {
  const quotedPostNumbers = new Set<number>();
  const replyQuoteTargets: ReplyQuoteTargets[] = [];

  for (const reply of replies) {
    const quotedPostNumbersForReply: number[] = [];

    if (reply.content) {
      for (const match of reply.content.matchAll(QUOTE_NUMBER_REGEX)) {
        const postNumber = Number.parseInt(match[1], 10);
        if (!Number.isNaN(postNumber)) {
          quotedPostNumbersForReply.push(postNumber);
          quotedPostNumbers.add(postNumber);
        }
      }
    }

    replyQuoteTargets.push({
      reply,
      quotedPostNumbers: quotedPostNumbersForReply,
    });
  }

  return {
    replyQuoteTargets,
    quotedPostNumbers: [...quotedPostNumbers].sort((a, b) => a - b),
  };
};

const useQuotedByMap = (replies: Comment[] = []) => {
  const stableQuotedByMapRef = useRef<Map<string, Comment[]>>(new Map());
  const { replyQuoteTargets, quotedPostNumbers } = useMemo(() => extractReplyQuoteTargets(replies), [replies]);

  // Subscribe only to post numbers referenced in this thread to avoid unrelated global store churn.
  const quotedNumbersSignature = usePostNumberStore(
    useCallback((state) => quotedPostNumbers.map((postNumber) => `${postNumber}:${state.numberToCid[postNumber] ?? ''}`).join('|'), [quotedPostNumbers]),
  );

  const quotedNumberToCid = useMemo(() => {
    if (quotedPostNumbers.length === 0) {
      return {} as Record<number, string>;
    }

    const { numberToCid } = usePostNumberStore.getState();
    const nextQuotedNumberToCid: Record<number, string> = {};

    for (const postNumber of quotedPostNumbers) {
      const quotedCid = numberToCid[postNumber];
      if (quotedCid) {
        nextQuotedNumberToCid[postNumber] = quotedCid;
      }
    }

    return nextQuotedNumberToCid;
  }, [quotedPostNumbers, quotedNumbersSignature]);

  return useMemo(() => {
    const map = new Map<string, Comment[]>();

    for (const { reply, quotedPostNumbers: quotedNumbersForReply } of replyQuoteTargets) {
      const cidSet = new Set<string>();

      if (reply.quotedCids?.length) {
        for (const quotedCid of reply.quotedCids) {
          cidSet.add(quotedCid);
        }
      }

      for (const postNumber of quotedNumbersForReply) {
        const quotedCid = quotedNumberToCid[postNumber];
        if (quotedCid) {
          cidSet.add(quotedCid);
        }
      }

      for (const quotedCid of cidSet) {
        const repliesQuotingCid = map.get(quotedCid);
        if (repliesQuotingCid) {
          repliesQuotingCid.push(reply);
        } else {
          map.set(quotedCid, [reply]);
        }
      }
    }

    if (areQuotedByMapsEquivalent(stableQuotedByMapRef.current, map)) {
      return stableQuotedByMapRef.current;
    }

    stableQuotedByMapRef.current = map;
    return map;
  }, [replyQuoteTargets, quotedNumberToCid]);
};

export default useQuotedByMap;
