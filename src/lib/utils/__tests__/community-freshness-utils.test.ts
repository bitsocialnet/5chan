import { describe, expect, it } from 'vitest';
import type { CommunitySyncState } from '@bitsocial/bitsocial-react-hooks';
import { getCommunityFreshnessNowSeconds, isCommunityKnownOffline } from '../community-freshness-utils';

const NOW_SECONDS = 1_704_067_210;

describe('isCommunityKnownOffline', () => {
  it.each<CommunitySyncState>(['succeeded', 'failed', 'stopped'])('treats terminal %s synchronization without cached data as offline', (syncState) => {
    expect(isCommunityKnownOffline({ syncState }, NOW_SECONDS)).toBe(true);
  });

  it.each<CommunitySyncState>(['initializing', 'loading', 'retrying'])('does not treat active %s synchronization without cached data as offline', (syncState) => {
    expect(isCommunityKnownOffline({ syncState }, NOW_SECONDS)).toBe(false);
  });

  it('keeps fresh cached data online after a terminal failure', () => {
    expect(
      isCommunityKnownOffline(
        {
          syncState: 'failed',
          updatedAt: NOW_SECONDS - 60,
        },
        NOW_SECONDS,
      ),
    ).toBe(false);
  });

  it('keeps stale cached data offline while synchronization retries', () => {
    expect(
      isCommunityKnownOffline(
        {
          syncState: 'retrying',
          updatedAt: NOW_SECONDS - 31 * 60,
        },
        NOW_SECONDS,
      ),
    ).toBe(true);
  });
});

describe('getCommunityFreshnessNowSeconds', () => {
  const lastSuccessfulFetchAt = NOW_SECONDS - 2 * 60 * 60;

  it.each<CommunitySyncState>(['stopped', 'loading'])('measures a %s board that last fetched successfully at that fetch', (syncState) => {
    expect(getCommunityFreshnessNowSeconds({ syncState, lastSuccessfulFetchAt }, NOW_SECONDS)).toBe(lastSuccessfulFetchAt);
  });

  it.each<CommunitySyncState>(['succeeded', 'retrying', 'failed', 'initializing'])('measures a %s board now', (syncState) => {
    expect(getCommunityFreshnessNowSeconds({ syncState, lastSuccessfulFetchAt }, NOW_SECONDS)).toBe(NOW_SECONDS);
  });

  it('measures a board whose last fetch failed now', () => {
    expect(getCommunityFreshnessNowSeconds({ syncState: 'loading', lastSuccessfulFetchAt, lastRetriableError: new Error('ipns timeout') }, NOW_SECONDS)).toBe(
      NOW_SECONDS,
    );
  });

  it('measures a board that never fetched now', () => {
    expect(getCommunityFreshnessNowSeconds({ syncState: 'stopped' }, NOW_SECONDS)).toBe(NOW_SECONDS);
  });
});

describe('isCommunityKnownOffline after the hooks stopped updating a board', () => {
  const lastSuccessfulFetchAt = NOW_SECONDS - 2 * 60 * 60;

  it.each<CommunitySyncState>(['stopped', 'loading'])('keeps a %s board that was fresh at its last fetch online', (syncState) => {
    expect(
      isCommunityKnownOffline({ syncState, updatedAt: lastSuccessfulFetchAt - 60, lastSuccessfulFetchAt, stoppedUntilUsed: syncState === 'stopped' }, NOW_SECONDS),
    ).toBe(false);
  });

  it('keeps a board that was already stale at its last fetch offline', () => {
    expect(
      isCommunityKnownOffline({ syncState: 'stopped', updatedAt: lastSuccessfulFetchAt - 31 * 60, lastSuccessfulFetchAt, stoppedUntilUsed: true }, NOW_SECONDS),
    ).toBe(true);
  });

  it('does not treat a stopped board without a record as known offline', () => {
    expect(isCommunityKnownOffline({ syncState: 'stopped', stoppedUntilUsed: true }, NOW_SECONDS)).toBe(false);
  });

  it('marks the board offline once its restarted fetch fails', () => {
    expect(
      isCommunityKnownOffline(
        { syncState: 'retrying', updatedAt: lastSuccessfulFetchAt - 60, lastSuccessfulFetchAt, lastRetriableError: new Error('ipns timeout') },
        NOW_SECONDS,
      ),
    ).toBe(true);
  });
});
