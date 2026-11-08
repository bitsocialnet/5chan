import { useCallback, useMemo } from 'react';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import { accountsStore } from '../lib/bitsocial-internals/stores';
import { getImageFilterKey } from '../lib/utils/image-filter-utils';
import { getCommentGalleryMediaInfos } from '../lib/utils/media-utils';
import useHiddenCatalogThreadsStore from '../stores/use-hidden-catalog-threads-store';
import useImageFiltersStore from '../stores/use-image-filters-store';
import { useActiveAccountField } from './use-active-account-field';
import { isOwnComment, useIsOwnComment } from './use-is-own-comment';

export type HiddenCidLookup = { [cid: string]: boolean | undefined };

type CommentWithCid = {
  cid?: string;
};

export const isCidHidden = (hiddenCids: HiddenCidLookup | undefined, cid?: string): boolean => Boolean(cid && hiddenCids?.[cid]);

export const filterHiddenComments = <T extends CommentWithCid>(
  comments: readonly T[],
  hiddenCids: HiddenCidLookup | undefined,
  isImageFiltered?: (comment: T) => boolean,
): T[] => comments.filter((comment) => !isCidHidden(hiddenCids, comment?.cid) && !isImageFiltered?.(comment));

const EMPTY_HIDDEN_CIDS: HiddenCidLookup = {};
const EMPTY_ERRORS: never[] = [];

export const useHiddenCids = (): HiddenCidLookup => useActiveAccountField((account) => account?.blockedCids || EMPTY_HIDDEN_CIDS);

// A post's file matches by its link's key, or by the listed hash its image hashed to after loading.
const isLinkImageFiltered = (link: string | undefined, filterKeys: Set<string>, matchedLinks: Record<string, string>): boolean => {
  if (!link) return false;
  const key = getImageFilterKey(link);
  const matchedHash = matchedLinks[link];
  return Boolean((key && filterKeys.has(key)) || (matchedHash && filterKeys.has(matchedHash)));
};

// A post is filtered when any of its files is: its link, or one of its gallery files.
const isCommentImageFiltered = (comment: Comment | undefined, filterKeys: Set<string>, matchedLinks: Record<string, string>): boolean =>
  isLinkImageFiltered(comment?.link, filterKeys, matchedLinks) ||
  getCommentGalleryMediaInfos(comment?.gallery).some(({ url }) => isLinkImageFiltered(url, filterKeys, matchedLinks));

const useIsAccountCommentCid = (cid: string | undefined): boolean => accountsStore((state) => Boolean(cid && state.commentCidsToAccountsComments?.[cid]));

// Like 4chan X, the image filter never hides the viewer's own posts.
/** Tells whether the image filter hides a comment, for lists that leave hidden posts out instead of rendering them. */
export const useIsImageFiltered = () => {
  const filterKeys = useImageFiltersStore((state) => state.filterKeys);
  const matchedLinks = useImageFiltersStore((state) => state.matchedLinks);
  const shownCids = useImageFiltersStore((state) => state.shownCids);
  const isViewerComment = useIsOwnComment();
  return useCallback(
    (comment: Comment) => {
      if (filterKeys.size === 0 || (comment?.cid && shownCids[comment.cid])) return false;
      if (isViewerComment(comment)) return false;
      return isCommentImageFiltered(comment, filterKeys, matchedLinks);
    },
    [filterKeys, isViewerComment, matchedLinks, shownCids],
  );
};

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
  const blocked = useActiveAccountField((account) => isCidHidden(account?.blockedCids, cid));
  const accountAddress = useActiveAccountField((account) => account?.author?.address);
  const isAccountCommentCid = useIsAccountCommentCid(cid);
  const filterableComment = isOwnComment(comment, accountAddress, isAccountCommentCid) ? undefined : comment;
  const matchesImageFilter = useImageFiltersStore((state) => isCommentImageFiltered(filterableComment, state.filterKeys, state.matchedLinks));
  const shownAnyway = useImageFiltersStore((state) => Boolean(cid && state.shownCids[cid]));
  const setPostShown = useImageFiltersStore((state) => state.setPostShown);
  const hidden = blocked || (matchesImageFilter && !shownAnyway);
  const state = hasAccount && cid ? 'ready' : 'initializing';
  const rememberHiddenComment = useHiddenCatalogThreadsStore((state) => state.rememberHiddenComment);
  const forgetHiddenComment = useHiddenCatalogThreadsStore((state) => state.forgetHiddenComment);

  const hide = useCallback(() => {
    if (!cid) {
      return;
    }

    setPostShown(cid, false);
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
  }, [cid, comment, forgetHiddenComment, rememberHiddenComment, setPostShown]);

  const unhide = useCallback(() => {
    if (!cid) {
      return;
    }

    // A filtered post stays on the filter list; showing it only lasts until a reload, as in 4chan X.
    if (matchesImageFilter) {
      setPostShown(cid, true);
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
  }, [cid, forgetHiddenComment, matchesImageFilter, setPostShown]);

  // Hide/unhide report action failures above; keep the hook's error fields empty.
  return useMemo(() => ({ error: undefined, errors: EMPTY_ERRORS, hidden, hide, state, unhide }), [hidden, hide, state, unhide]);
};

export default useHide;
