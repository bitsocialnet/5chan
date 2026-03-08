import * as React from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useIsSubplebbitOffline from '../use-is-subplebbit-offline';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const testState = vi.hoisted(() => ({
  initializeMock: vi.fn(),
  loadingTimestamps: [0] as number[],
  requestedAddresses: undefined as string[] | undefined,
  setOfflineStateMock: vi.fn(),
  subplebbitOfflineState: {} as Record<string, { initialLoad: boolean; state?: string; updatedAt?: number; updatingState?: string }>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'posts_last_synced_info') {
        return `posts_last_synced_info:${options?.time}`;
      }
      return key;
    },
  }),
}));

vi.mock('../../stores/use-subplebbit-offline-store', () => ({
  default: () => ({
    initializesubplebbitOfflineState: testState.initializeMock,
    setSubplebbitOfflineState: testState.setOfflineStateMock,
    subplebbitOfflineState: testState.subplebbitOfflineState,
  }),
}));

vi.mock('../../stores/use-subplebbits-loading-start-timestamps-store', () => ({
  default: (addresses?: string[]) => {
    testState.requestedAddresses = addresses;
    return testState.loadingTimestamps;
  },
}));

vi.mock('../../lib/utils/time-utils', () => ({
  getFormattedTimeAgo: (timestamp: number) => `ago:${timestamp}`,
}));

let latestValue: ReturnType<typeof useIsSubplebbitOffline>;
let container: HTMLDivElement;
let root: Root;

const HookHarness = ({ subplebbit }: { subplebbit?: { address?: string; state?: string; updatedAt?: number; updatingState?: string } }) => {
  latestValue = useIsSubplebbitOffline(subplebbit as never);
  return null;
};

const flushEffects = async (count = 3) => {
  for (let i = 0; i < count; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

const renderHook = async (subplebbit?: { address?: string; state?: string; updatedAt?: number; updatingState?: string }) => {
  await act(async () => {
    root.render(createElement(HookHarness, { subplebbit }));
  });
  await flushEffects();
};

describe('useIsSubplebbitOffline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:10Z'));

    latestValue = {
      isOffline: false,
      isOnlineStatusLoading: false,
      offlineIconClass: '',
      offlineTitle: '',
    };
    testState.loadingTimestamps = [1_704_067_200];
    testState.requestedAddresses = undefined;
    testState.subplebbitOfflineState = {};

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('initializes unseen boards and reports a loading state during the first sync window', async () => {
    await renderHook({ address: 'music.eth', state: 'updating', updatingState: 'fetching' });

    expect(testState.requestedAddresses).toEqual(['music.eth']);
    expect(testState.initializeMock).toHaveBeenCalledWith('music.eth');
    expect(testState.setOfflineStateMock).toHaveBeenCalledWith('music.eth', {
      state: 'updating',
      updatedAt: undefined,
      updatingState: 'fetching',
    });
    expect(latestValue).toEqual({
      isOffline: false,
      isOnlineStatusLoading: true,
      offlineIconClass: 'yellowOfflineIcon',
      offlineTitle: 'downloading board...',
    });
  });

  it('reports boards with stale updates as offline and includes the last synced time', async () => {
    const staleUpdatedAt = 1_704_052_000;
    testState.subplebbitOfflineState = {
      'music.eth': {
        initialLoad: false,
        updatedAt: staleUpdatedAt,
      },
    };
    testState.loadingTimestamps = [1_704_067_000];

    await renderHook({ address: 'music.eth', state: 'stopped', updatedAt: staleUpdatedAt });

    expect(testState.initializeMock).not.toHaveBeenCalled();
    expect(latestValue).toEqual({
      isOffline: true,
      isOnlineStatusLoading: false,
      offlineIconClass: 'redOfflineIcon',
      offlineTitle: `posts_last_synced_info:ago:${staleUpdatedAt}`,
    });
  });

  it('marks boards without an update timestamp as offline once the loading timeout has elapsed', async () => {
    testState.subplebbitOfflineState = {
      'music.eth': {
        initialLoad: false,
      },
    };
    testState.loadingTimestamps = [1_704_067_100];

    await renderHook({ address: 'music.eth' });

    expect(latestValue).toEqual({
      isOffline: true,
      isOnlineStatusLoading: false,
      offlineIconClass: 'redOfflineIcon',
      offlineTitle: 'subplebbit_offline_info',
    });
  });

  it('treats recently updated boards as online', async () => {
    const freshUpdatedAt = 1_704_067_205;
    testState.subplebbitOfflineState = {
      'music.eth': {
        initialLoad: false,
        updatedAt: freshUpdatedAt,
      },
    };

    await renderHook({ address: 'music.eth', state: 'started', updatedAt: freshUpdatedAt });

    expect(latestValue).toEqual({
      isOffline: false,
      isOnlineStatusLoading: false,
      offlineIconClass: '',
      offlineTitle: false,
    });
  });
});
