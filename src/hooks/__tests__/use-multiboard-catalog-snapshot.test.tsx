import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Comment, CommunityIdentifier } from '@bitsocial/bitsocial-react-hooks';
import type { CatalogSortType } from '../../lib/utils/catalog-sort';
import useMultiboardCatalogSnapshot, { MULTIBOARD_CATALOG_SNAPSHOT_TIMEOUT_MS } from '../use-multiboard-catalog-snapshot';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  communitiesState: { communities: {} as Record<string, unknown>, errors: {} as Record<string, unknown[]> },
}));

vi.mock('../../lib/bitsocial-internals/stores', () => ({
  communitiesStore: (selector: (state: typeof testState.communitiesState) => unknown) => selector(testState.communitiesState),
}));

const communityAddresses = ['music-posting.eth', 'sports-posting.bso'];
const communities: CommunityIdentifier[] = [{ name: 'music-posting.eth' }, { name: 'sports-posting.bso', publicKey: 'sports-public-key' }];

type SnapshotResult = ReturnType<typeof useMultiboardCatalogSnapshot>;
let latest: SnapshotResult;

const Probe = (props: { enabled?: boolean; feed: Comment[]; communityKeysWithMore: string[]; sortType?: CatalogSortType; snapshotKey?: string }) => {
  latest = useMultiboardCatalogSnapshot({
    enabled: props.enabled ?? true,
    feed: props.feed,
    communityKeysWithMore: props.communityKeysWithMore,
    communityAddresses,
    communities,
    sortType: props.sortType ?? 'replyCount',
    snapshotKey: props.snapshotKey ?? 'key-1',
  });
  return null;
};

const quiet = { cid: 'quiet', replyCount: 1, timestamp: 300 } as Comment;
const busy = { cid: 'busy', replyCount: 9, timestamp: 100 } as Comment;
const middle = { cid: 'middle', replyCount: 5, timestamp: 200 } as Comment;
const cids = (threads: Comment[]) => threads.map((thread) => thread.cid);

let container: HTMLDivElement;
let root: Root;
const render = async (props: Parameters<typeof Probe>[0]) => {
  await act(async () => {
    root.render(createElement(Probe, props));
  });
};

describe('useMultiboardCatalogSnapshot', () => {
  beforeEach(() => {
    testState.communitiesState = { communities: {}, errors: {} };
    container = document.createElement('div');
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
  });

  it('waits for every board, then keeps the sorted order while the threads update', async () => {
    await render({ feed: [quiet], communityKeysWithMore: ['sports-public-key'] });
    expect(latest.isLoading).toBe(true);
    expect(latest.loadedBoardCount).toBe(1);
    expect(latest.boardCount).toBe(2);
    expect(latest.threads).toEqual([]);

    await render({ feed: [quiet, busy, middle], communityKeysWithMore: [] });
    expect(latest.isLoading).toBe(false);
    expect(cids(latest.threads)).toEqual(['busy', 'middle', 'quiet']);
    expect(latest.missingBoardAddresses).toEqual([]);

    // a new reply count shows but does not move the thread; hidden threads leave, late threads wait for a refresh
    const busierQuiet = { ...quiet, replyCount: 50 } as Comment;
    const late = { cid: 'late', replyCount: 99, timestamp: 400 } as Comment;
    await render({ feed: [busierQuiet, middle, late], communityKeysWithMore: [] });
    expect(cids(latest.threads)).toEqual(['middle', 'quiet']);
    expect(latest.threads[1]).toBe(busierQuiet);

    // another local order re-sorts the same threads
    await render({ feed: [busierQuiet, middle, late], communityKeysWithMore: [], sortType: 'new' });
    expect(cids(latest.threads)).toEqual(['quiet', 'middle']);
  });

  it('does not wait for a board that failed to load and names it', async () => {
    testState.communitiesState = { communities: {}, errors: { 'sports-public-key': [new Error('offline')] } };
    await render({ feed: [quiet], communityKeysWithMore: ['sports-public-key'] });
    expect(latest.isLoading).toBe(false);
    expect(cids(latest.threads)).toEqual(['quiet']);
    expect(latest.missingBoardAddresses).toEqual(['sports-posting.bso']);
  });

  it('keeps waiting for a loaded board that had failed attempts before', async () => {
    testState.communitiesState = {
      communities: { 'sports-public-key': { updatedAt: 1, fetchedAt: Math.floor(Date.now() / 1000) } },
      errors: { 'sports-public-key': [new Error('earlier attempt')] },
    };
    await render({ feed: [quiet], communityKeysWithMore: ['sports-public-key'] });
    expect(latest.isLoading).toBe(true);
  });

  it('shows the threads loaded so far once a board takes too long, and names it', async () => {
    vi.useFakeTimers();
    await render({ feed: [quiet, busy], communityKeysWithMore: ['music-posting.eth'] });
    expect(latest.isLoading).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(MULTIBOARD_CATALOG_SNAPSHOT_TIMEOUT_MS);
    });
    expect(latest.isLoading).toBe(false);
    expect(cids(latest.threads)).toEqual(['busy', 'quiet']);
    expect(latest.missingBoardAddresses).toEqual(['music-posting.eth']);
  });

  it('takes the threads again for a new snapshot key and stays off when disabled', async () => {
    await render({ feed: [quiet], communityKeysWithMore: [] });
    expect(cids(latest.threads)).toEqual(['quiet']);

    await render({ feed: [quiet], communityKeysWithMore: ['music-posting.eth'], snapshotKey: 'key-2' });
    expect(latest.isLoading).toBe(true);
    expect(latest.threads).toEqual([]);

    await render({ enabled: false, feed: [quiet], communityKeysWithMore: ['music-posting.eth'], snapshotKey: 'key-2' });
    expect(latest.isLoading).toBe(false);
    expect(latest.missingBoardAddresses).toEqual([]);
  });
});
