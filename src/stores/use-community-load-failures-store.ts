import { create } from 'zustand';
import type { CommunityIdentifier } from '@bitsocial/bitsocial-react-hooks';
import { communitiesStore as useCommunitiesStore } from '../lib/bitsocial-internals/stores';

// pkc-js retries an unreachable community forever, cycling 'fetching-ipns' -> 'waiting-retry', and
// bitsocial-react-hooks drops errors marked retriable, so neither `community.error` nor
// `community.state === 'failed'` ever reports it. The sync state is only 'retrying' between attempts,
// so remember a failed first load until it succeeds to keep telling the user the board failed.
// Loaded communities also park in 'waiting-retry' between polls, so only never-loaded ones count.
interface CommunityLoadFailuresState {
  failedCommunityKeys: Record<string, true>;
}

const useCommunityLoadFailuresStore = create<CommunityLoadFailuresState>(() => ({
  failedCommunityKeys: {},
}));

const recordCommunityLoadFailures = ({ communities, syncStatuses }: ReturnType<typeof useCommunitiesStore.getState>) => {
  const { failedCommunityKeys } = useCommunityLoadFailuresStore.getState();
  let nextFailedCommunityKeys: Record<string, true> | undefined;

  for (const communityKey in syncStatuses) {
    const syncState = syncStatuses[communityKey]?.syncState;
    if (syncState === 'retrying' && !failedCommunityKeys[communityKey] && typeof communities[communityKey]?.updatedAt !== 'number') {
      nextFailedCommunityKeys ??= { ...failedCommunityKeys };
      nextFailedCommunityKeys[communityKey] = true;
    } else if (syncState === 'succeeded' && failedCommunityKeys[communityKey]) {
      nextFailedCommunityKeys ??= { ...failedCommunityKeys };
      delete nextFailedCommunityKeys[communityKey];
    }
  }
  // deleteCommunity removes the sync status, so a later re-add starts without the old failure
  for (const communityKey in failedCommunityKeys) {
    if (!syncStatuses[communityKey]) {
      nextFailedCommunityKeys ??= { ...failedCommunityKeys };
      delete nextFailedCommunityKeys[communityKey];
    }
  }

  if (nextFailedCommunityKeys) {
    useCommunityLoadFailuresStore.setState({ failedCommunityKeys: nextFailedCommunityKeys });
  }
};

recordCommunityLoadFailures(useCommunitiesStore.getState());
const unsubscribeFromCommunities = useCommunitiesStore.subscribe((state, prevState) => {
  if (state.syncStatuses !== prevState.syncStatuses) {
    recordCommunityLoadFailures(state);
  }
});
import.meta.hot?.dispose(unsubscribeFromCommunities);

// Same key bitsocial-react-hooks uses for syncStatuses (getCommunityRefKey)
const getCommunityKey = (communityIdentifier?: CommunityIdentifier) => communityIdentifier?.publicKey || communityIdentifier?.name;

export const useHasCommunityLoadFailed = (communityIdentifier?: CommunityIdentifier): boolean => {
  const communityKey = getCommunityKey(communityIdentifier);
  const hasFailed = useCommunityLoadFailuresStore((state) => Boolean(communityKey && state.failedCommunityKeys[communityKey]));
  // The pkc-js RPC client applies 'succeeded' without emitting it, so also stop once data arrives
  // Named as a hook so React Compiler never memoizes this subscription away
  const hasLoaded = useCommunitiesStore((state) => Boolean(communityKey && typeof state.communities[communityKey]?.updatedAt === 'number'));
  return hasFailed && !hasLoaded;
};

/**
 * Everything known about a board that failed to load, for its Failed label to copy. Read at click
 * time, so the page never re-renders for it. bitsocial-react-hooks keeps retriable errors out of
 * `errors` and records the latest on the sync status as `lastRetriableError`, so the whole sync
 * status is copied.
 */
export const getCommunityLoadFailureDetails = (communityIdentifier?: CommunityIdentifier) => {
  const communityKey = getCommunityKey(communityIdentifier);
  const { communities, errors, syncStatuses } = useCommunitiesStore.getState();
  const community = communityKey ? communities[communityKey] : undefined;
  const details = {
    message: 'Failed to load board',
    community: communityIdentifier,
    copiedAt: new Date().toISOString(),
    updatingState: community?.updatingState,
    syncStatus: communityKey ? syncStatuses[communityKey] : undefined,
    errors: communityKey ? errors[communityKey] : undefined,
    clients: community?.clients,
  };
  // The clipboard serializer spells out undefined, so leave out what is not known.
  return Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined));
};

export default useCommunityLoadFailuresStore;
