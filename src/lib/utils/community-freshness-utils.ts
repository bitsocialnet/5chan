import type { CommunitySyncState } from '@bitsocial/bitsocial-react-hooks';

export const COMMUNITY_OFFLINE_THRESHOLD_SECONDS = 30 * 60;

export interface CommunityFreshnessState {
  state?: string;
  syncState?: CommunitySyncState;
  updatedAt?: number;
  /** When the board's update loop last fetched successfully. */
  lastSuccessfulFetchAt?: number;
  /** The error behind the current retries, cleared once a fetch succeeds. */
  lastRetriableError?: unknown;
  /** The hooks stopped updating the board because nothing showed it; showing it restarts it. */
  stoppedUntilUsed?: boolean;
}

export const isCommunityUpdateStale = (updatedAt: number | undefined, nowSeconds: number): boolean =>
  updatedAt !== undefined && nowSeconds - updatedAt >= COMMUNITY_OFFLINE_THRESHOLD_SECONDS;

export const isCommunitySyncLoading = (syncState: CommunitySyncState | undefined): boolean =>
  syncState === 'initializing' || syncState === 'loading' || syncState === 'retrying';

export const isCommunitySyncTerminal = (syncState: CommunitySyncState | undefined): boolean => syncState !== undefined && !isCommunitySyncLoading(syncState);

/**
 * The time a board's record age is measured at. The hooks stop updating a board a couple of
 * minutes after nothing shows it, and showing it again restarts its updates. While it is stopped
 * or fetching and its last fetch did not fail, nothing has checked it since that fetch, so its
 * record is judged by its age back then: a board that was online when it stopped updating does
 * not flash offline or loading while it restarts. A failed or finished fetch measures now.
 */
export const getCommunityFreshnessNowSeconds = (communityState: CommunityFreshnessState | undefined, nowSeconds: number): number => {
  const { syncState, lastSuccessfulFetchAt, lastRetriableError } = communityState || {};
  const isUncheckedSinceLastFetch = syncState === 'stopped' || syncState === 'loading';
  if (!isUncheckedSinceLastFetch || lastSuccessfulFetchAt === undefined || lastRetriableError !== undefined) {
    return nowSeconds;
  }
  return Math.min(nowSeconds, lastSuccessfulFetchAt);
};

export const isCommunityKnownOffline = (communityState: CommunityFreshnessState | undefined, nowSeconds: number): boolean => {
  if (!communityState) return false;

  const isStale = isCommunityUpdateStale(communityState.updatedAt, getCommunityFreshnessNowSeconds(communityState, nowSeconds));
  if (communityState.updatedAt !== undefined && !isStale) return false;
  if (isStale) return true;
  // a board stopped only because nothing showed it is not known yet, like one still loading
  if (isCommunitySyncLoading(communityState.syncState) || communityState.stoppedUntilUsed) return false;
  if (isCommunitySyncTerminal(communityState.syncState) || communityState.state === 'failed') return true;
  return false;
};
