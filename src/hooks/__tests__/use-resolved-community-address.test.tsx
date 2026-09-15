import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommunitySyncState } from '@bitsocial/bitsocial-react-hooks';
import { useResolvedCommunityAddress, useResolvedDirectoryBoardPath } from '../use-resolved-community-address';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  boardIdentifier: 'biz',
  boardIdentifierOverride: undefined as string | undefined,
  directories: [
    {
      address: 'business-and-finance.bso',
      directoryCode: 'biz',
      title: '/biz/ - Business & Finance',
    },
  ],
  list: {
    directoryCode: 'biz',
    boards: [
      { address: 'business-and-finance.bso', publicKey: '12D3KooWBusiness', score: 100 },
      { address: 'bizraelis.bso', score: 10 },
    ],
  },
  offlineStates: {} as Record<string, { updatedAt?: number; state?: string }>,
  communities: {} as Record<string, { address?: string; name?: string; publicKey?: string; state?: string; updatedAt?: number }>,
  syncStatuses: {} as Record<string, { syncState: CommunitySyncState }>,
  candidatePublicKeys: {} as Record<string, string | undefined>,
  communityStoreListeners: [] as Array<() => void>,
  offlineStoreListeners: [] as Array<() => void>,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ boardIdentifier: testState.boardIdentifier }),
  };
});

vi.mock('../use-directories', () => ({
  useDirectories: () => testState.directories,
  normalizeBoardAddress: (address: string) => address.replace(/\.(bso|eth)$/, ''),
}));

vi.mock('../use-directory-list', async () => {
  const actual = await vi.importActual<typeof import('../use-directory-list')>('../use-directory-list');
  return {
    ...actual,
    useDirectoryList: () => ({ list: testState.list, loading: false, error: null }),
  };
});

vi.mock('../../stores/use-community-offline-store', () => {
  const getState = () => ({ communityOfflineState: testState.offlineStates });
  const store = Object.assign(<T,>(selector: (state: ReturnType<typeof getState>) => T) => selector(getState()), {
    getState,
    subscribe: (listener: () => void) => {
      testState.offlineStoreListeners.push(listener);
      return () => {
        testState.offlineStoreListeners = testState.offlineStoreListeners.filter((candidate) => candidate !== listener);
      };
    },
  });
  return { default: store };
});

vi.mock('../../lib/bitsocial-internals/stores', () => {
  const getState = () => ({
    communities: testState.communities,
    syncStatuses: testState.syncStatuses,
  });
  const communitiesStore = Object.assign(<T,>(selector: (state: ReturnType<typeof getState>) => T) => selector(getState()), {
    getState,
    subscribe: (listener: () => void) => {
      testState.communityStoreListeners.push(listener);
      return () => {
        testState.communityStoreListeners = testState.communityStoreListeners.filter((candidate) => candidate !== listener);
      };
    },
  });
  return {
    communitiesStore,
  };
});

vi.mock('../../lib/utils/directory-list-lookup-utils', async () => {
  const actual = await vi.importActual<typeof import('../../lib/utils/directory-list-lookup-utils')>('../../lib/utils/directory-list-lookup-utils');
  return {
    ...actual,
    getDirectoryCandidateBoardByAddress: (address: string) => {
      const publicKey = testState.candidatePublicKeys[address];
      return publicKey ? { address, publicKey } : undefined;
    },
  };
});

let latestValue: string | undefined;
let latestDirectoryBoardPath: { boardPath: string | undefined; isDirectoryCandidate: boolean };
let container: HTMLDivElement;
let root: Root;
let hookRenderCount: number;
let hookCommitCount: number;

const HookHarness = () => {
  hookRenderCount += 1;
  latestValue = useResolvedCommunityAddress(testState.boardIdentifierOverride);
  latestDirectoryBoardPath = useResolvedDirectoryBoardPath(testState.boardIdentifier);
  return null;
};

const renderHook = async (readers = 1) => {
  await act(async () => {
    root.render(
      createElement(
        React.Profiler,
        { id: 'directory-resolver', onRender: () => hookCommitCount++ },
        Array.from({ length: readers }, (_, index) => createElement(HookHarness, { key: index })),
      ),
    );
  });
};

describe('useResolvedCommunityAddress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:10Z'));
    latestValue = undefined;
    latestDirectoryBoardPath = { boardPath: undefined, isDirectoryCandidate: false };
    testState.boardIdentifier = 'biz';
    testState.boardIdentifierOverride = undefined;
    testState.list.boards = [
      { address: 'business-and-finance.bso', publicKey: '12D3KooWBusiness', score: 100 },
      { address: 'bizraelis.bso', score: 10 },
    ];
    testState.offlineStates = {};
    testState.communities = {};
    testState.syncStatuses = {};
    testState.candidatePublicKeys = {};
    testState.communityStoreListeners = [];
    testState.offlineStoreListeners = [];
    hookRenderCount = 0;
    hookCommitCount = 0;

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    expect(testState.communityStoreListeners).toHaveLength(0);
    expect(testState.offlineStoreListeners).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it('skips a higher-ranked directory board when its last update is 30 minutes stale', async () => {
    testState.offlineStates = {
      'business-and-finance.bso': {
        updatedAt: 1_704_067_210 - 31 * 60,
      },
    };

    await renderHook();

    expect(latestValue).toBe('bizraelis.bso');
  });

  it('keeps a higher-ranked directory board when its last update is newer than 30 minutes', async () => {
    testState.offlineStates = {
      'business-and-finance.bso': {
        updatedAt: 1_704_067_210 - 29 * 60,
      },
    };

    await renderHook();

    expect(latestValue).toBe('business-and-finance.bso');
  });

  it('skips a stale higher-ranked directory board while its synchronization retries', async () => {
    testState.offlineStates = {
      'business-and-finance.bso': {
        updatedAt: 1_704_067_210 - 31 * 60,
      },
    };
    testState.syncStatuses = {
      '12D3KooWBusiness': {
        syncState: 'loading',
      },
    };

    await renderHook();

    expect(latestValue).toBe('bizraelis.bso');
  });

  it('skips a higher-ranked directory board when its first synchronization fails by public key', async () => {
    testState.syncStatuses = {
      '12D3KooWBusiness': {
        syncState: 'failed',
      },
    };

    await renderHook();

    expect(latestValue).toBe('bizraelis.bso');
  });

  it('keeps a fresh cached winner when a later synchronization fails', async () => {
    testState.communities = {
      '12D3KooWBusiness': {
        address: '12D3KooWBusiness',
        name: 'business-and-finance.bso',
        publicKey: '12D3KooWBusiness',
        state: 'succeeded',
        updatedAt: 1_704_067_210 - 60,
      },
    };
    testState.syncStatuses = {
      '12D3KooWBusiness': {
        syncState: 'failed',
      },
    };

    await renderHook();

    expect(latestValue).toBe('business-and-finance.bso');
  });

  it('uses the freshest timestamp across matching cached aliases and the offline mirror', async () => {
    testState.offlineStates = {
      'business-and-finance.bso': {
        updatedAt: 1_704_067_210 - 31 * 60,
      },
    };
    testState.communities = {
      'business-and-finance.bso': {
        address: 'business-and-finance.bso',
        name: 'business-and-finance.bso',
        publicKey: '12D3KooWBusiness',
        updatedAt: 1_704_067_210 - 31 * 60,
      },
      '12D3KooWBusiness': {
        address: '12D3KooWBusiness',
        name: 'business-and-finance.bso',
        publicKey: '12D3KooWBusiness',
        updatedAt: 1_704_067_210 - 60,
      },
    };
    testState.syncStatuses = {
      '12D3KooWBusiness': {
        syncState: 'failed',
      },
    };

    await renderHook();

    expect(latestValue).toBe('business-and-finance.bso');
  });

  it('preserves direct public-key sync precedence over address and cached alias statuses', async () => {
    testState.communities = {
      'business-and-finance.eth': {
        name: 'business-and-finance.eth',
        publicKey: 'cached-alias-key',
      },
    };
    testState.syncStatuses = {
      '12D3KooWBusiness': { syncState: 'loading' },
      'business-and-finance.bso': { syncState: 'failed' },
      'cached-alias-key': { syncState: 'failed' },
    };

    await renderHook();

    expect(latestValue).toBe('business-and-finance.bso');

    testState.syncStatuses = {
      'business-and-finance.bso': { syncState: 'failed' },
      'cached-alias-key': { syncState: 'loading' },
    };
    await act(async () => {
      testState.communityStoreListeners.forEach((listener) => listener());
    });

    expect(latestValue).toBe('bizraelis.bso');
  });

  it('matches normalized aliases and preserves their first matching sync status', async () => {
    testState.list.boards = [
      { address: 'business-and-finance.bso', score: 100 },
      { address: 'bizraelis.bso', score: 10 },
    ];
    testState.communities = {
      'business-and-finance.eth': { name: 'business-and-finance.eth', publicKey: 'first-key' },
      'second-key': { name: 'business-and-finance.bso', publicKey: 'second-key' },
    };
    testState.syncStatuses = {
      'first-key': { syncState: 'loading' },
      'second-key': { syncState: 'failed' },
    };

    await renderHook();

    expect(latestValue).toBe('business-and-finance.bso');

    testState.syncStatuses = {
      'first-key': { syncState: 'failed' },
      'second-key': { syncState: 'loading' },
    };
    await act(async () => {
      testState.communityStoreListeners.forEach((listener) => listener());
    });

    expect(latestValue).toBe('bizraelis.bso');
  });

  it('treats a zero cached timestamp as stale while synchronization retries', async () => {
    testState.communities = {
      '12D3KooWBusiness': {
        address: '12D3KooWBusiness',
        name: 'business-and-finance.bso',
        publicKey: '12D3KooWBusiness',
        updatedAt: 0,
      },
    };
    testState.syncStatuses = {
      '12D3KooWBusiness': {
        syncState: 'retrying',
      },
    };

    await renderHook();

    expect(latestValue).toBe('bizraelis.bso');
  });

  it('uses a cached community public key when the directory list only has its address', async () => {
    testState.list.boards = [
      { address: 'business-and-finance.bso', score: 100 },
      { address: 'bizraelis.bso', score: 10 },
    ];
    testState.communities = {
      'business-and-finance.bso': {
        address: 'business-and-finance.bso',
        name: 'business-and-finance.bso',
        publicKey: '12D3KooWBusiness',
      },
    };
    testState.syncStatuses = {
      '12D3KooWBusiness': {
        syncState: 'failed',
      },
    };

    await renderHook();

    expect(latestValue).toBe('bizraelis.bso');
  });

  it('uses the vendored candidate public key when the fetched directory list only has its address', async () => {
    testState.list.boards = [
      { address: 'business-and-finance.bso', score: 100 },
      { address: 'bizraelis.bso', score: 10 },
    ];
    testState.candidatePublicKeys = {
      'business-and-finance.bso': '12D3KooWBusiness',
    };
    testState.syncStatuses = {
      '12D3KooWBusiness': {
        syncState: 'failed',
      },
    };

    await renderHook();

    expect(latestValue).toBe('bizraelis.bso');
  });

  it('does not subscribe to offline state on non-directory board routes', async () => {
    testState.boardIdentifier = 'custom-board.bso';
    testState.offlineStates = {
      unrelated: {
        updatedAt: 1,
      },
    };

    await renderHook();

    expect(latestValue).toBe('custom-board.bso');
    expect(testState.communityStoreListeners).toHaveLength(0);
    expect(testState.offlineStoreListeners).toHaveLength(0);
  });

  it('does not rerender when an unrelated community publishes lifecycle progress', async () => {
    await renderHook();
    const rendersBeforeUnrelatedUpdate = hookRenderCount;
    const commitsBeforeUnrelatedUpdate = hookCommitCount;

    testState.communities = {
      unrelated: {
        address: 'unrelated.bso',
        state: 'updating',
        updatedAt: 1_704_067_210,
      },
    };
    await act(async () => {
      testState.communityStoreListeners.forEach((listener) => listener());
    });

    expect(latestValue).toBe('business-and-finance.bso');
    expect(hookRenderCount).toBe(rendersBeforeUnrelatedUpdate);
    expect(hookCommitCount).toBe(commitsBeforeUnrelatedUpdate);
  });

  it.each(['biz', 'business-and-finance.bso'])('does not commit unchanged freshness ticks or offline updates on %s', async (boardIdentifier) => {
    testState.boardIdentifier = boardIdentifier;
    testState.offlineStates = { 'business-and-finance.bso': { updatedAt: Date.now() / 1000 } };
    await renderHook();
    const rendersBeforeUpdates = hookRenderCount;
    const commitsBeforeUpdates = hookCommitCount;

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    testState.offlineStates = { ...testState.offlineStates, unrelated: { state: 'failed' } };
    await act(async () => {
      testState.offlineStoreListeners.forEach((listener) => listener());
    });

    expect(latestValue).toBe('business-and-finance.bso');
    expect(hookRenderCount).toBe(rendersBeforeUpdates);
    expect(hookCommitCount).toBe(commitsBeforeUpdates);
  });

  it('shares the source subscriptions and clock, then refreshes immediately after all readers re-enable', async () => {
    testState.offlineStates = { 'business-and-finance.bso': { updatedAt: Date.now() / 1000 } };
    await renderHook(3);

    expect(testState.communityStoreListeners).toHaveLength(1);
    expect(testState.offlineStoreListeners).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(1);

    await renderHook();

    expect(testState.communityStoreListeners).toHaveLength(1);
    expect(testState.offlineStoreListeners).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(1);

    testState.boardIdentifier = 'custom-board.bso';
    await renderHook();

    expect(testState.communityStoreListeners).toHaveLength(0);
    expect(testState.offlineStoreListeners).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);

    await act(async () => {
      vi.advanceTimersByTime(31 * 60_000);
    });
    testState.boardIdentifier = 'biz';
    await renderHook();

    expect(latestValue).toBe('bizraelis.bso');
    expect(testState.communityStoreListeners).toHaveLength(1);
    expect(testState.offlineStoreListeners).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('shares alias scans across directory readers and invalidates them when lifecycle maps change', async () => {
    const readAddress = vi.fn(() => 'business-and-finance.bso');
    testState.communities = {
      '12D3KooWBusiness': {
        get address() {
          return readAddress();
        },
      },
    };
    await renderHook(3);

    expect(readAddress).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(readAddress).toHaveBeenCalledTimes(1);

    testState.syncStatuses = { '12D3KooWBusiness': { syncState: 'loading' } };
    await act(async () => {
      testState.communityStoreListeners.forEach((listener) => listener());
    });
    expect(readAddress).toHaveBeenCalledTimes(2);

    testState.communities = {
      '12D3KooWBusiness': { address: 'business-and-finance.bso', updatedAt: 0 },
    };
    await act(async () => {
      testState.communityStoreListeners.forEach((listener) => listener());
    });

    expect(latestValue).toBe('bizraelis.bso');
  });

  it('rerenders when lifecycle progress changes the directory winner', async () => {
    await renderHook();
    const rendersBeforeWinnerChange = hookRenderCount;

    testState.syncStatuses = {
      '12D3KooWBusiness': {
        syncState: 'failed',
      },
    };
    await act(async () => {
      testState.communityStoreListeners.forEach((listener) => listener());
    });

    expect(latestValue).toBe('bizraelis.bso');
    expect(hookRenderCount).toBeGreaterThan(rendersBeforeWinnerChange);
  });

  it('switches away from a directory board when it crosses the offline threshold while mounted', async () => {
    testState.offlineStates = {
      'business-and-finance.bso': {
        updatedAt: 1_704_067_210 - 29 * 60,
      },
    };

    await renderHook();

    expect(latestValue).toBe('business-and-finance.bso');

    await act(async () => {
      vi.advanceTimersByTime(2 * 60 * 1000);
    });

    expect(latestValue).toBe('bizraelis.bso');
  });

  it('removes the canonical directory path when its winner becomes stale while mounted', async () => {
    testState.boardIdentifier = 'business-and-finance.bso';
    testState.offlineStates = { 'business-and-finance.bso': { updatedAt: Date.now() / 1000 - 29 * 60 } };
    await renderHook();

    expect(latestDirectoryBoardPath).toEqual({ boardPath: 'biz', isDirectoryCandidate: true });

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    expect(latestDirectoryBoardPath).toEqual({ boardPath: undefined, isDirectoryCandidate: true });
  });

  it('falls back to the highest-ranked candidate when every directory board is offline', async () => {
    testState.offlineStates = {
      'business-and-finance.bso': { updatedAt: 0 },
      'bizraelis.bso': { state: 'failed' },
    };

    await renderHook();

    expect(latestValue).toBe('business-and-finance.bso');
  });

  it('uses an explicit directory identifier for cached board feeds', async () => {
    testState.boardIdentifier = 'all';
    testState.boardIdentifierOverride = 'biz';
    testState.offlineStates = {
      'business-and-finance.bso': {
        updatedAt: 1_704_067_210 - 31 * 60,
      },
    };

    await renderHook();

    expect(latestValue).toBe('bizraelis.bso');
  });

  it('canonicalizes the direct address for the current directory winner', async () => {
    testState.boardIdentifier = 'bizraelis.bso';
    testState.offlineStates = {
      'business-and-finance.bso': {
        updatedAt: 1_704_067_210 - 31 * 60,
      },
    };

    await renderHook();

    expect(latestDirectoryBoardPath).toEqual({
      boardPath: 'biz',
      isDirectoryCandidate: true,
    });
  });

  it('does not canonicalize a directory candidate address when it is not the current winner', async () => {
    testState.boardIdentifier = 'business-and-finance.bso';
    testState.offlineStates = {
      'business-and-finance.bso': {
        updatedAt: 1_704_067_210 - 31 * 60,
      },
    };

    await renderHook();

    expect(latestDirectoryBoardPath).toEqual({
      boardPath: undefined,
      isDirectoryCandidate: true,
    });
  });
});
