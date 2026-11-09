import { useCallback } from 'react';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
// The `use` name makes the React Compiler treat the store as a hook instead of memoizing the call away.
import { accountsStore as useAccountsStore } from '../lib/bitsocial-internals/stores';
import { useActiveAccountField } from './use-active-account-field';

type AccountCommentCids = { [cid: string]: { accountId: string } | undefined } | undefined;

// The map lists the comments of every local account, so a match only counts for the active one.
export const isActiveAccountCommentCid = (accountCommentCids: AccountCommentCids, activeAccountId: string | undefined, cid: string | undefined): boolean =>
  Boolean(cid && activeAccountId && accountCommentCids?.[cid]?.accountId === activeAccountId);

// On per-post pseudonymous boards a post's author address is a one-off alias, so the account's own
// comment list is what identifies the viewer's posts. An index only marks a local comment that has no
// cid yet; a published comment carrying one may come from anyone, so its cid has to be on that list.
export const isOwnComment = (comment: Comment | undefined, accountAddress: string | undefined, isAccountCommentCid: boolean): boolean =>
  isAccountCommentCid || (typeof comment?.index === 'number' && !comment?.cid) || Boolean(accountAddress && comment?.author?.address === accountAddress);

/** Returns a callback telling whether a comment was published by the viewer's account. */
export const useIsOwnComment = () => {
  const accountAddress = useActiveAccountField((account) => account?.author?.address);
  const activeAccountId = useAccountsStore((state) => state.activeAccountId);
  const accountCommentCids = useAccountsStore((state) => state.commentCidsToAccountsComments);
  return useCallback(
    (comment: Comment | undefined) => isOwnComment(comment, accountAddress, isActiveAccountCommentCid(accountCommentCids, activeAccountId, comment?.cid)),
    [accountAddress, accountCommentCids, activeAccountId],
  );
};
