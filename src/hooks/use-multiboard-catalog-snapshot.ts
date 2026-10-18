import { useEffect, useMemo, useState } from 'react';
import type { Comment, CommunityIdentifier } from '@bitsocial/bitsocial-react-hooks';
import { communitiesStore as useCommunitiesStore } from '../lib/bitsocial-internals/stores';
import { communityPostsCacheExpired } from '../lib/bitsocial-internals/utils';
import { sortCatalogFeedForDisplay, type CatalogSortType } from '../lib/utils/catalog-sort';

// How long a board may keep loading before the catalog is shown without it.
export const MULTIBOARD_CATALOG_SNAPSHOT_TIMEOUT_MS = 20_000;

const NO_THREADS: Comment[] = [];
const NO_ADDRESSES: string[] = [];

interface MultiboardCatalogSnapshotOptions {
  enabled: boolean;
  /** The boards' threads as loaded so far; complete once no board has more to load. */
  feed: Comment[];
  /** `useFeed().communityKeysWithMore`: the boards whose threads are not all loaded yet. */
  communityKeysWithMore: readonly string[];
  communityAddresses: readonly string[];
  communities: readonly CommunityIdentifier[];
  sortType: CatalogSortType;
  /** Changes whenever the set of threads has to be taken again (other boards, filters, time window, refresh). */
  snapshotKey: string;
}

interface MultiboardCatalogSnapshot {
  key: string;
  threads: Comment[];
  missingBoardAddresses: string[];
}

// useFeed keys a board by its public key, or by its name when it has none
const getCommunityKey = (community: CommunityIdentifier) => community.publicKey || community.name || '';

// A board whose record never loaded, or is too old to use, and whose last attempts failed will not
// add threads without a refresh. A board that is still trying is waited for.
const isCommunityLoadFailed = (community: { updatedAt?: number } | undefined, errors: readonly unknown[] | undefined) =>
  !!errors?.length && (!community?.updatedAt || communityPostsCacheExpired(community));

/**
 * A local sort (last reply, creation date, reply count) is only right over every thread, so a
 * multiboard catalog waits for every board to load or fail, or for the timeout, then sorts that
 * set once. Its order stays until the snapshot is taken again, so loading more never reshuffles the
 * threads on screen; the threads still show their latest state, and leave when hidden or removed.
 */
const useMultiboardCatalogSnapshot = ({
  enabled,
  feed,
  communityKeysWithMore,
  communityAddresses,
  communities,
  sortType,
  snapshotKey,
}: MultiboardCatalogSnapshotOptions) => {
  const [snapshot, setSnapshot] = useState<MultiboardCatalogSnapshot>();
  const [timedOutSnapshotKey, setTimedOutSnapshotKey] = useState<string>();
  const hasSnapshot = enabled && snapshot?.key === snapshotKey;

  const waitingCommunityKeyCount = useCommunitiesStore((state) =>
    enabled && !hasSnapshot
      ? communityKeysWithMore.filter((communityKey) => !isCommunityLoadFailed(state.communities[communityKey], state.errors[communityKey])).length
      : 0,
  );

  const getMissingBoardAddresses = () => {
    const addressesByKey = new Map(communities.map((community, index) => [getCommunityKey(community), communityAddresses[index]]));
    return communityKeysWithMore.map((communityKey) => addressesByKey.get(communityKey) || communityKey);
  };
  if (enabled && !hasSnapshot && (waitingCommunityKeyCount === 0 || timedOutSnapshotKey === snapshotKey)) {
    setSnapshot({ key: snapshotKey, threads: feed, missingBoardAddresses: getMissingBoardAddresses() });
  }

  useEffect(() => {
    if (!enabled || hasSnapshot) {
      return;
    }
    const timeout = setTimeout(() => setTimedOutSnapshotKey(snapshotKey), MULTIBOARD_CATALOG_SNAPSHOT_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [enabled, hasSnapshot, snapshotKey]);

  // sort the threads as they were taken, so later updates to their counts don't move them
  const snapshotCids = useMemo(
    () => (hasSnapshot && snapshot ? sortCatalogFeedForDisplay(snapshot.threads, sortType).map((thread) => thread.cid) : undefined),
    [hasSnapshot, snapshot, sortType],
  );
  const threads = useMemo(() => {
    if (!snapshotCids) {
      return NO_THREADS;
    }
    const threadsByCid = new Map(feed.map((thread) => [thread.cid, thread]));
    return snapshotCids.flatMap((cid) => {
      const thread = threadsByCid.get(cid);
      return thread ? [thread] : [];
    });
  }, [feed, snapshotCids]);

  return {
    isLoading: enabled && !hasSnapshot,
    loadedBoardCount: communities.length - communityKeysWithMore.length,
    boardCount: communities.length,
    threads,
    missingBoardAddresses: hasSnapshot && snapshot ? snapshot.missingBoardAddresses : NO_ADDRESSES,
  };
};

export default useMultiboardCatalogSnapshot;
