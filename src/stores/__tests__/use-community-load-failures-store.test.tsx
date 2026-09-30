import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { CommunityIdentifier, CommunitySyncState } from '@bitsocial/bitsocial-react-hooks';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { communitiesStore } from '../../lib/bitsocial-internals/stores';
import useCommunityLoadFailuresStore, { useHasCommunityLoadFailed } from '../use-community-load-failures-store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const setSyncState = (communityKey: string, syncState: CommunitySyncState) =>
  communitiesStore.setState((state) => ({ syncStatuses: { ...state.syncStatuses, [communityKey]: { syncState } } }));

const isFailed = (communityKey: string) => Boolean(useCommunityLoadFailuresStore.getState().failedCommunityKeys[communityKey]);

let container: HTMLDivElement;
let root: Root;
let latestValue: boolean | undefined;

const Harness = ({ communityIdentifier }: { communityIdentifier?: CommunityIdentifier }) => {
  latestValue = useHasCommunityLoadFailed(communityIdentifier);
  return null;
};

describe('useCommunityLoadFailuresStore', () => {
  beforeEach(() => {
    communitiesStore.setState({ communities: {}, syncStatuses: {} });
    useCommunityLoadFailuresStore.setState({ failedCommunityKeys: {} });
    latestValue = undefined;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('keeps a failed load attempt through later retries until the community loads', () => {
    setSyncState('offline-board', 'loading');
    expect(isFailed('offline-board')).toBe(false);

    setSyncState('offline-board', 'retrying');
    expect(isFailed('offline-board')).toBe(true);

    // pkc-js goes back to 'fetching-ipns' for the next attempt, which is 'loading' again
    setSyncState('offline-board', 'loading');
    expect(isFailed('offline-board')).toBe(true);

    setSyncState('offline-board', 'succeeded');
    expect(isFailed('offline-board')).toBe(false);
  });

  it('ignores loaded communities waiting between polls', () => {
    communitiesStore.setState({ communities: { 'loaded-board': { address: 'loaded-board', updatedAt: 1781773422 } } });

    setSyncState('loaded-board', 'retrying');
    expect(isFailed('loaded-board')).toBe(false);
  });

  it('forgets the failure when the community sync status is removed', () => {
    setSyncState('deleted-board', 'retrying');
    expect(isFailed('deleted-board')).toBe(true);

    communitiesStore.setState({ syncStatuses: {} });
    expect(isFailed('deleted-board')).toBe(false);
  });

  it('reads the failure with the same key the hooks use for sync statuses', () => {
    setSyncState('12D3KooWPublicKey', 'retrying');

    act(() => root.render(createElement(Harness, { communityIdentifier: { name: 'board.bso', publicKey: '12D3KooWPublicKey' } })));
    expect(latestValue).toBe(true);

    act(() => root.render(createElement(Harness, { communityIdentifier: { name: 'board.bso' } })));
    expect(latestValue).toBe(false);

    setSyncState('board.bso', 'retrying');
    act(() => root.render(createElement(Harness, { communityIdentifier: { name: 'board.bso' } })));
    expect(latestValue).toBe(true);

    act(() => root.render(createElement(Harness, {})));
    expect(latestValue).toBe(false);
  });
});
