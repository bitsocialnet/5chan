import { useEffect, useMemo, useRef } from 'react';
import { useAccount, type Comment } from '@bitsocial/bitsocial-react-hooks';
import { accountsStore, communitiesStore as useCommunitiesStore, communitiesPagesStore as useCommunitiesPagesStore } from '../lib/bitsocial-internals/stores';
import { getCommentCommunityAddress } from '../lib/utils/comment-utils';
import { isCommentArchived } from '../lib/utils/comment-moderation-utils';
import { getRawBoardThreadState } from '../lib/utils/raw-board-thread-state';
import { useCommunityIdentifier } from './use-community-identifiers';
import { useDirectories } from './use-directories';
import { getBoardAddressKeys, isBoardAddressInScope } from './use-hidden-catalog-threads';

type UsePruneHiddenCatalogThreadsOptions = {
  enabled: boolean;
  hiddenThreadCandidates: readonly Comment[];
  communityAddress: string | undefined;
  sortType: string | undefined;
};

const EMPTY_RAW_BOARD_THREAD_STATE = getRawBoardThreadState({
  accountId: undefined,
  communitiesPages: {},
  community: undefined,
  sortType: 'active',
});

// The board pages only prove a thread is gone once they must list it. A thread waiting for mod approval is never
// in them, and neither is a thread posted shortly before the board's last update: pkc-js accepts a thread stamped
// up to 5 minutes behind the board's clock, and its challenge exchange can take 10 minutes or more after that, so
// an update stamped a little after the thread can still predate it.
const BOARD_PAGES_LISTING_DELAY_SECONDS = 60 * 60;

const canBoardPagesListThread = (comment: Comment, boardUpdatedAt: number | undefined): boolean =>
  comment.pendingApproval !== true &&
  typeof boardUpdatedAt === 'number' &&
  typeof comment.timestamp === 'number' &&
  boardUpdatedAt - comment.timestamp > BOARD_PAGES_LISTING_DELAY_SECONDS;

const usePruneHiddenCatalogThreads = ({ enabled, hiddenThreadCandidates, communityAddress, sortType }: UsePruneHiddenCatalogThreadsOptions) => {
  const account = useAccount();
  const directories = useDirectories();
  // The store keys a community like getCommunityRefKey does, so a directory board is under its public key, not its address.
  const communityIdentifier = useCommunityIdentifier(communityAddress);
  const communityKey = communityIdentifier?.publicKey || communityIdentifier?.name;
  const community = useCommunitiesStore((state) => (communityKey ? state.communities[communityKey] : undefined));
  const communitiesPages = useCommunitiesPagesStore((state) => state.communitiesPages);
  const pendingPruneCidsRef = useRef(new Set<string>());
  const boardAddressKeys = useMemo(() => (enabled ? getBoardAddressKeys(communityAddress, directories) : new Set<string>()), [communityAddress, directories, enabled]);
  const rawBoardCatalogState = useMemo(
    () =>
      enabled
        ? getRawBoardThreadState({
            accountId: account?.id,
            communitiesPages,
            community,
            sortType,
          })
        : EMPTY_RAW_BOARD_THREAD_STATE,
    [account?.id, communitiesPages, community, enabled, sortType],
  );
  const communityUpdatedAt = community?.updatedAt;

  const removedHiddenThreadCids = useMemo(() => {
    if (!enabled || boardAddressKeys.size === 0 || !rawBoardCatalogState.isFullyLoaded) {
      return [];
    }

    return hiddenThreadCandidates
      .filter((comment) => {
        const cid = comment?.cid;
        return (
          cid &&
          !isCommentArchived(comment) &&
          canBoardPagesListThread(comment, communityUpdatedAt) &&
          isBoardAddressInScope(getCommentCommunityAddress(comment), boardAddressKeys, directories) &&
          !rawBoardCatalogState.rootThreadCids.has(cid)
        );
      })
      .map((comment) => comment.cid)
      .filter((cid): cid is string => typeof cid === 'string')
      .sort();
  }, [boardAddressKeys, communityUpdatedAt, directories, enabled, hiddenThreadCandidates, rawBoardCatalogState]);

  useEffect(() => {
    if (!enabled || removedHiddenThreadCids.length === 0) {
      return;
    }

    for (const cid of removedHiddenThreadCids) {
      if (pendingPruneCidsRef.current.has(cid)) {
        continue;
      }

      pendingPruneCidsRef.current.add(cid);
      void accountsStore
        .getState()
        .accountsActions.unblockCid(cid)
        .catch((error: unknown) => {
          const { accounts, activeAccountId } = accountsStore.getState();
          if (activeAccountId && accounts?.[activeAccountId]?.blockedCids?.[cid]) {
            console.error('Failed to remove stale hidden thread from account', error);
          }
        })
        .finally(() => {
          pendingPruneCidsRef.current.delete(cid);
        });
    }
  }, [enabled, removedHiddenThreadCids]);
};

export default usePruneHiddenCatalogThreads;
