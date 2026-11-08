import { useCallback } from 'react';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
// The `use` name makes the React Compiler treat the store as a hook instead of memoizing the call away.
import { accountsStore as useAccountsStore } from '../lib/bitsocial-internals/stores';
import { useActiveAccountField } from './use-active-account-field';

// On per-post pseudonymous boards a post's author address is a one-off alias, so the account's own
// comment list is what identifies the viewer's posts; an index marks a local account comment.
export const isOwnComment = (comment: Comment | undefined, accountAddress: string | undefined, isAccountCommentCid: boolean): boolean =>
  isAccountCommentCid || typeof comment?.index === 'number' || Boolean(accountAddress && comment?.author?.address === accountAddress);

/** Returns a callback telling whether a comment was published by the viewer's account. */
export const useIsOwnComment = () => {
  const accountAddress = useActiveAccountField((account) => account?.author?.address);
  const accountCommentCids = useAccountsStore((state) => state.commentCidsToAccountsComments);
  return useCallback(
    (comment: Comment | undefined) => isOwnComment(comment, accountAddress, Boolean(comment?.cid && accountCommentCids?.[comment.cid])),
    [accountAddress, accountCommentCids],
  );
};
