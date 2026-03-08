import * as React from 'react';
import { createElement } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetDirectoriesModuleStateForTests,
  findDirectoryByAddress,
  normalizeBoardAddress,
  useDirectories,
  useDirectoriesMetadata,
  useDirectoriesState,
  useDirectoryAddresses,
  useDirectoryByAddress,
  type DirectoriesData,
} from '../use-directories';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const act = (React as { act?: (cb: () => void | Promise<void>) => void | Promise<void> }).act as (cb: () => void | Promise<void>) => void | Promise<void>;

const LOCALSTORAGE_KEY = '5chan-directories-cache';
const LOCALSTORAGE_TIMESTAMP_KEY = '5chan-directories-cache-timestamp';

type Snapshot = {
  directories: ReturnType<typeof useDirectories>;
  state: ReturnType<typeof useDirectoriesState>;
  addresses: ReturnType<typeof useDirectoryAddresses>;
  directory: ReturnType<typeof useDirectoryByAddress>;
  metadata: ReturnType<typeof useDirectoriesMetadata>;
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

type ConsoleWarnCall = Parameters<typeof console.warn>;

let latestSnapshot: Snapshot | null = null;
let root: Root;
let container: HTMLDivElement;
let fetchMock: ReturnType<typeof vi.fn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

const HookHarness = ({ address = 'music-posting.eth' }: { address?: string }) => {
  const directories = useDirectories();
  const state = useDirectoriesState();
  const addresses = useDirectoryAddresses();
  const directory = useDirectoryByAddress(address);
  const metadata = useDirectoriesMetadata();

  React.useLayoutEffect(() => {
    latestSnapshot = {
      directories,
      state,
      addresses,
      directory,
      metadata,
    };
  }, [addresses, directory, directories, metadata, state]);

  return null;
};

const createDeferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
};

const createFetchResponse = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: vi.fn().mockResolvedValue(body),
});

const flushEffects = async (count = 4) => {
  for (let i = 0; i < count; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

const renderHarness = (address?: string) => {
  act(() => {
    root.render(createElement(HookHarness, { address }));
  });
};

describe('use-directories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    latestSnapshot = null;
    __resetDirectoriesModuleStateForTests();
    localStorage.clear();
    fetchMock = vi.fn();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', fetchMock);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    warnSpy.mockRestore();
    vi.unstubAllGlobals();
    __resetDirectoriesModuleStateForTests();
  });

  it('normalizes aliases and finds matching directories by exact or alias address', () => {
    const communities = [
      { address: 'music-posting.bso', title: '/mu/ - Music' },
      { address: 'business.eth', title: '/biz/ - Business & Finance' },
    ];

    expect(normalizeBoardAddress('music-posting.eth')).toBe('music-posting');
    expect(normalizeBoardAddress('business.bso')).toBe('business');
    expect(normalizeBoardAddress('business.xyz')).toBe('business.xyz');

    expect(findDirectoryByAddress(communities, 'music-posting.bso')?.address).toBe('music-posting.bso');
    expect(findDirectoryByAddress(communities, 'music-posting.eth')?.address).toBe('music-posting.bso');
    expect(findDirectoryByAddress(communities, undefined)).toBeUndefined();
  });

  it('hydrates from localStorage first, then refreshes from GitHub with normalized and deduped data', async () => {
    const cachedData: DirectoriesData = {
      title: 'Cached directories',
      description: 'cached description',
      createdAt: 1,
      updatedAt: 2,
      communities: [
        { address: 'music-posting.bso', title: '/mu/ - Cached Music', nsfw: false },
        { address: 'flash.bso', title: '/f/ - Flash', nsfw: true },
      ],
    };

    const remotePayload = {
      title: 'Fresh directories',
      description: 'fresh description',
      createdAt: 3,
      updatedAt: 4,
      directories: [
        {
          communityAddress: 'music-posting.bso',
          title: '/mu/ - Music',
          directoryCode: 'mu',
          features: { safeForWork: true, postsPerPage: 25, nested: { ignore: true } },
        },
        {
          communityAddress: 'flash.bso',
          title: '/f/ - Flash',
          directoryCode: 'f',
          features: { nsfw: true, postsPerPage: 10 },
        },
        {
          communityAddress: 'flash.bso',
          title: '/f/ - Duplicate Flash',
          directoryCode: 'f',
        },
      ],
    };

    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(cachedData));
    localStorage.setItem(LOCALSTORAGE_TIMESTAMP_KEY, String(Date.now()));

    const pendingFetch = createDeferred<ReturnType<typeof createFetchResponse>>();
    fetchMock.mockReturnValueOnce(pendingFetch.promise);

    renderHarness();
    await flushEffects();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(latestSnapshot?.state.loading).toBe(false);
    expect(latestSnapshot?.state.communities.map((community) => community.address)).toEqual(['music-posting.bso', 'flash.bso']);
    expect(latestSnapshot?.addresses).toEqual(['music-posting.bso', 'flash.bso']);
    expect(latestSnapshot?.directory?.address).toBe('music-posting.bso');
    expect(latestSnapshot?.metadata).toEqual({
      title: 'Cached directories',
      description: 'cached description',
      createdAt: 1,
      updatedAt: 2,
    });

    pendingFetch.resolve(createFetchResponse(remotePayload));
    await flushEffects();

    expect(latestSnapshot?.state.loading).toBe(false);
    expect(latestSnapshot?.directories).toEqual([
      {
        address: 'music-posting.bso',
        title: '/mu/ - Music',
        directoryCode: 'mu',
        features: { safeForWork: true, postsPerPage: 25 },
        nsfw: false,
      },
      {
        address: 'flash.bso',
        title: '/f/ - Flash',
        directoryCode: 'f',
        features: { nsfw: true, postsPerPage: 10 },
        nsfw: true,
      },
    ]);
    expect(latestSnapshot?.addresses).toEqual(['music-posting.bso', 'flash.bso']);
    expect(latestSnapshot?.directory?.address).toBe('music-posting.bso');
    expect(latestSnapshot?.metadata).toEqual({
      title: 'Fresh directories',
      description: 'fresh description',
      createdAt: 3,
      updatedAt: 4,
    });

    const persisted = JSON.parse(localStorage.getItem(LOCALSTORAGE_KEY) ?? '{}');
    expect(persisted.title).toBe('Fresh directories');
    expect(persisted.communities).toHaveLength(2);
  });

  it('clears invalid recent cache entries and falls back to vendored data when GitHub refresh fails', async () => {
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify({ title: 'broken cache' }));
    localStorage.setItem(LOCALSTORAGE_TIMESTAMP_KEY, String(Date.now()));
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    renderHarness('unknown.eth');
    await flushEffects(8);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(LOCALSTORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LOCALSTORAGE_TIMESTAMP_KEY)).toBeNull();
    expect(warnSpy.mock.calls.some((call: ConsoleWarnCall) => String(call[0]).includes('Invalid directories cache format'))).toBe(true);
    expect(warnSpy.mock.calls.some((call: ConsoleWarnCall) => String(call[0]).includes('Failed to fetch directories'))).toBe(true);
    expect(latestSnapshot?.state.loading).toBe(false);
    expect(latestSnapshot?.directories.length).toBeGreaterThan(0);
    expect(latestSnapshot?.addresses.length).toBeGreaterThan(0);
    expect(latestSnapshot?.directory).toBeUndefined();
    expect(latestSnapshot?.metadata).not.toBeNull();
  });
});
