import { useCallback, useMemo } from 'react';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import { accountsStore } from '../lib/bitsocial-internals/stores';
import useHiddenCatalogThreadsStore from '../stores/use-hidden-catalog-threads-store';
import { useActiveAccountField } from './use-active-account-field';

export type HiddenCidLookup = { [cid: string]: boolean | undefined };

type CommentWithCid = {
  cid?: string;
};

export const isCidHidden = (hiddenCids: HiddenCidLookup | undefined, cid?: string): boolean => Boolean(cid && hiddenCids?.[cid]);

export const filterHiddenComments = <T extends CommentWithCid>(comments: readonly T[], hiddenCids: HiddenCidLookup | undefined): T[] =>
  comments.filter((comment) => !isCidHidden(hiddenCids, comment?.cid));

const EMPTY_HIDDEN_CIDS: HiddenCidLookup = {};
const EMPTY_ERRORS: never[] = [];

export const useHiddenCids = (): HiddenCidLookup => useActiveAccountField((account) => account?.blockedCids || EMPTY_HIDDEN_CIDS);

const shouldLogHideActionError = (cid: string, expectedHidden: boolean): boolean => {
  const { accounts, activeAccountId } = accountsStore.getState();
  if (!activeAccountId) {
    return true;
  }

  return Boolean(accounts?.[activeAccountId]?.blockedCids?.[cid]) !== expectedHidden;
};

const getCurrentAccountHiddenState = (cid: string): boolean => {
  const { accounts, activeAccountId } = accountsStore.getState();
  return Boolean(activeAccountId && accounts?.[activeAccountId]?.blockedCids?.[cid]);
};

const useHide = ({ cid, comment }: { cid: string; comment?: Comment }) => {
  const hasAccount = useActiveAccountField((account) => Boolean(account));
  const hidden = useActiveAccountField((account) => isCidHidden(account?.blockedCids, cid));
  const state = hasAccount && cid ? 'ready' : 'initializing';
  const rememberHiddenComment = useHiddenCatalogThreadsStore((state) => state.rememberHiddenComment);
  const forgetHiddenComment = useHiddenCatalogThreadsStore((state) => state.forgetHiddenComment);

  const hide = useCallback(() => {
    if (!cid) {
      return;
    }

    if (getCurrentAccountHiddenState(cid)) {
      rememberHiddenComment(comment);
      return;
    }

    rememberHiddenComment(comment);
    void accountsStore
      .getState()
      .accountsActions.blockCid(cid)
      .catch((error: unknown) => {
        if (!getCurrentAccountHiddenState(cid)) {
          forgetHiddenComment(cid);
        }
        if (shouldLogHideActionError(cid, true)) {
          console.error('Failed to hide post', error);
        }
      });
  }, [cid, comment, forgetHiddenComment, rememberHiddenComment]);

  const unhide = useCallback(() => {
    if (!cid) {
      return;
    }

    forgetHiddenComment(cid);
    if (!getCurrentAccountHiddenState(cid)) {
      return;
    }

    void accountsStore
      .getState()
      .accountsActions.unblockCid(cid)
      .catch((error: unknown) => {
        if (shouldLogHideActionError(cid, false)) {
          console.error('Failed to unhide post', error);
        }
      });
  }, [cid, forgetHiddenComment]);

  // Hide/unhide report action failures above; keep the hook's error fields empty.
  return useMemo(() => ({ error: undefined, errors: EMPTY_ERRORS, hidden, hide, state, unhide }), [hidden, hide, state, unhide]);
};

export default useHide;
