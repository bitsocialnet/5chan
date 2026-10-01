import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import { accountsStore } from '../bitsocial-internals/stores';
import { isCommentArchived } from './comment-moderation-utils';
import { QUOTE_NUMBER_REGEX } from './url-utils';

export type ThreadDeadReason = 'archived' | 'deleted';

export const getThreadDeadReason = (post: Comment | undefined): ThreadDeadReason | undefined => {
  if (!post) return undefined;
  if (isCommentArchived(post)) return 'archived';
  if (post.deleted || post.removed || post.purged || post.commentModeration?.purged) return 'deleted';
  return undefined;
};

const isAccountComment = (comment: Comment | undefined): boolean => {
  if (typeof comment?.index === 'number') return true;
  const cid = comment?.cid;
  return typeof cid === 'string' && Boolean(accountsStore.getState().commentCidsToAccountsComments?.[cid]);
};

const getQuotedNumbers = (content: unknown): number[] =>
  typeof content === 'string' ? Array.from(content.matchAll(QUOTE_NUMBER_REGEX), (match) => Number.parseInt(match[1], 10)) : [];

interface FindNewThreadRepliesOptions {
  post: Comment;
  replies: Comment[];
  seenReplyCids: ReadonlySet<string>;
}

/**
 * Finds rendered replies the viewer has not seen yet. The viewer's own replies are never new,
 * the way 4chan's updater skips the reply just sent from its quick reply form.
 */
export const findNewThreadReplies = ({ post, replies, seenReplyCids }: FindNewThreadRepliesOptions) => {
  const ownCids = new Set<string>();
  const ownNumbers = new Set<number>();
  for (const comment of [post, ...replies]) {
    if (!isAccountComment(comment)) continue;
    if (comment.cid) ownCids.add(comment.cid);
    if (typeof comment.number === 'number') ownNumbers.add(comment.number);
  }

  let count = 0;
  let quotesOwnPost = false;
  for (const reply of replies) {
    if (!reply?.cid || seenReplyCids.has(reply.cid) || ownCids.has(reply.cid) || typeof reply.index === 'number') continue;
    count += 1;
    // Every reply's parent is the OP in a flat thread, so only a deeper parent or a quote targets a post.
    const answersOwnReply = !!reply.parentCid && reply.parentCid !== post.cid && ownCids.has(reply.parentCid);
    if (answersOwnReply || getQuotedNumbers(reply.content).some((number) => ownNumbers.has(number))) {
      quotesOwnPost = true;
    }
  }

  return { count, quotesOwnPost };
};
