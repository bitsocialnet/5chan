import type { CommunityIdentifier } from '@bitsocial/bitsocial-react-hooks';
import { communitiesStore } from '../../lib/bitsocial-internals/stores';

// Same key bitsocial-react-hooks uses for syncStatuses (getCommunityRefKey)
const getCommunityKey = (communityIdentifier?: CommunityIdentifier) => communityIdentifier?.publicKey || communityIdentifier?.name;

/**
 * Everything known about a board that failed to load, for its Failed label to copy. Read at click
 * time, so the page never re-renders for it. bitsocial-react-hooks keeps retriable errors out of
 * `errors` and records the latest on the sync status as `lastRetriableError`, so the whole sync
 * status is copied.
 */
export const getCommunityLoadFailureDetails = (communityIdentifier?: CommunityIdentifier) => {
  const communityKey = getCommunityKey(communityIdentifier);
  const { communities, errors, syncStatuses } = communitiesStore.getState();
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
