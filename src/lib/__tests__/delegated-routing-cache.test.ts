import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DELEGATED_ROUTING_CACHE_NAME,
  clearStaleDelegatedRoutingCache,
  pruneExpiredDelegatedRoutingCache,
  scheduleDelegatedRoutingCacheMaintenance,
} from '../delegated-routing-cache';

const KEY = 'fivechanDelegatedRoutingCacheMaintainedAt';
const FIVE_MINUTES = 5 * 60 * 1000;
const NOW = 1_000_000_000;

const fakeStorage = (lastMaintained?: number) => {
  const values = new Map<string, string>();
  if (lastMaintained !== undefined) {
    values.set(KEY, String(lastMaintained));
  }
  return {
    values,
    storage: {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => void values.set(key, value)),
    },
  };
};

const entry = (url: string, expires: number) => ({
  request: { url } as unknown as Request,
  response: { headers: new Headers({ 'x-cache-expires': String(expires) }) } as unknown as Response,
});

const fakeCacheStorage = (entries: ReturnType<typeof entry>[] = [], exists = true) => {
  const byUrl = new Map(entries.map(({ request, response }) => [request.url, response]));
  const cache = {
    keys: vi.fn().mockResolvedValue(entries.map(({ request }) => request)),
    match: vi.fn(async (request: Request) => byUrl.get(request.url)),
    delete: vi.fn().mockResolvedValue(true),
  };
  return {
    cache,
    cacheStorage: {
      delete: vi.fn().mockResolvedValue(true),
      has: vi.fn().mockResolvedValue(exists),
      open: vi.fn().mockResolvedValue(cache),
    },
  };
};

describe('clearStaleDelegatedRoutingCache', () => {
  it('deletes the cache on the first start and records the maintenance', async () => {
    const { values, storage } = fakeStorage();
    const { cacheStorage } = fakeCacheStorage();
    await expect(clearStaleDelegatedRoutingCache({ now: () => NOW, storage, cacheStorage })).resolves.toBe(true);
    expect(cacheStorage.delete).toHaveBeenCalledWith(DELEGATED_ROUTING_CACHE_NAME);
    expect(values.get(KEY)).toBe(String(NOW));
  });

  it('keeps the cache when it was maintained less than a TTL ago', async () => {
    const { values, storage } = fakeStorage(NOW - FIVE_MINUTES + 1);
    const { cacheStorage } = fakeCacheStorage();
    await expect(clearStaleDelegatedRoutingCache({ now: () => NOW, storage, cacheStorage })).resolves.toBe(false);
    expect(cacheStorage.delete).not.toHaveBeenCalled();
    expect(values.get(KEY)).toBe(String(NOW - FIVE_MINUTES + 1));
  });

  it('deletes the cache when it was maintained a TTL or more ago', async () => {
    const { storage } = fakeStorage(NOW - FIVE_MINUTES);
    const { cacheStorage } = fakeCacheStorage();
    await expect(clearStaleDelegatedRoutingCache({ now: () => NOW, storage, cacheStorage })).resolves.toBe(true);
    expect(cacheStorage.delete).toHaveBeenCalledTimes(1);
  });

  it('does nothing without the Cache API and survives storage or delete failures', async () => {
    await expect(clearStaleDelegatedRoutingCache({ storage: undefined, cacheStorage: undefined })).resolves.toBe(false);

    const throwingStorage = {
      getItem: vi.fn(() => {
        throw new Error('blocked');
      }),
      setItem: vi.fn(() => {
        throw new Error('blocked');
      }),
    };
    const cacheStorage = { delete: vi.fn().mockRejectedValue(new Error('SecurityError')) };
    await expect(clearStaleDelegatedRoutingCache({ storage: throwingStorage, cacheStorage })).resolves.toBe(false);
    expect(cacheStorage.delete).toHaveBeenCalledWith(DELEGATED_ROUTING_CACHE_NAME);
  });

  it('still runs when reading localStorage itself throws', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError: storage is blocked');
      },
    });
    try {
      const { cacheStorage } = fakeCacheStorage();
      await expect(clearStaleDelegatedRoutingCache({ cacheStorage })).resolves.toBe(true);
    } finally {
      if (descriptor) {
        Object.defineProperty(globalThis, 'localStorage', descriptor);
      } else {
        delete (globalThis as { localStorage?: unknown }).localStorage;
      }
    }
  });
});

describe('pruneExpiredDelegatedRoutingCache', () => {
  it('deletes expired entries in batches, keeps live ones, and records the maintenance', async () => {
    const live = entry('https://router/live', NOW + 1);
    const expired = [entry('https://router/a', NOW), entry('https://router/b', NOW - 1), entry('https://router/c', 0)];
    const { cache, cacheStorage } = fakeCacheStorage([live, ...expired]);
    const { values, storage } = fakeStorage();
    await expect(pruneExpiredDelegatedRoutingCache({ now: () => NOW, storage, cacheStorage, batchSize: 2 })).resolves.toBe(3);
    expect(cache.delete.mock.calls.map(([request]) => request.url)).toEqual(expired.map(({ request }) => request.url));
    expect(cacheStorage.open).toHaveBeenCalledWith(DELEGATED_ROUTING_CACHE_NAME);
    expect(values.get(KEY)).toBe(String(NOW));
  });

  it('does not create the cache when the node has not opened it, but still counts as maintenance', async () => {
    const { cacheStorage } = fakeCacheStorage([], false);
    const { values, storage } = fakeStorage();
    await expect(pruneExpiredDelegatedRoutingCache({ now: () => NOW, storage, cacheStorage })).resolves.toBe(0);
    expect(cacheStorage.open).not.toHaveBeenCalled();
    expect(values.get(KEY)).toBe(String(NOW));
    await expect(pruneExpiredDelegatedRoutingCache({ now: () => NOW, storage, cacheStorage: undefined })).resolves.toBe(0);
  });

  it('returns 0 and records nothing when the Cache API fails', async () => {
    const cacheStorage = { has: vi.fn().mockRejectedValue(new Error('SecurityError')), open: vi.fn() };
    const { values, storage } = fakeStorage();
    await expect(pruneExpiredDelegatedRoutingCache({ now: () => NOW, storage, cacheStorage })).resolves.toBe(0);
    expect(values.has(KEY)).toBe(false);
  });
});

describe('scheduleDelegatedRoutingCacheMaintenance', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears a stale cache at start, prunes after the first delay, then every tick, until stopped', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { values, storage } = fakeStorage(NOW - FIVE_MINUTES);
    const { cacheStorage } = fakeCacheStorage();
    const stop = scheduleDelegatedRoutingCacheMaintenance({ storage, cacheStorage, firstPruneDelayMs: 1_000, tickMs: 2_000 });

    await vi.advanceTimersByTimeAsync(0);
    expect(cacheStorage.delete).toHaveBeenCalledWith(DELEGATED_ROUTING_CACHE_NAME);
    expect(cacheStorage.open).not.toHaveBeenCalled();
    expect(values.get(KEY)).toBe(String(NOW));

    await vi.advanceTimersByTimeAsync(1_000);
    expect(cacheStorage.open).toHaveBeenCalledTimes(1);
    expect(values.get(KEY)).toBe(String(NOW + 1_000));

    await vi.advanceTimersByTimeAsync(1_000);
    expect(cacheStorage.open).toHaveBeenCalledTimes(2);
    expect(values.get(KEY)).toBe(String(NOW + 2_000));

    stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(cacheStorage.open).toHaveBeenCalledTimes(2);
    expect(cacheStorage.delete).toHaveBeenCalledTimes(1);
  });

  it('keeps the cache of a tab that is still running: its prunes keep the maintenance within a TTL', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { storage } = fakeStorage();
    const firstTab = fakeCacheStorage().cacheStorage;
    const stopFirstTab = scheduleDelegatedRoutingCacheMaintenance({ storage, cacheStorage: firstTab });
    await vi.advanceTimersByTimeAsync(0);
    expect(firstTab.delete).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3 * FIVE_MINUTES);
    const secondTab = fakeCacheStorage().cacheStorage;
    const stopSecondTab = scheduleDelegatedRoutingCacheMaintenance({ storage, cacheStorage: secondTab });
    await vi.advanceTimersByTimeAsync(0);
    expect(secondTab.delete).not.toHaveBeenCalled();

    stopFirstTab();
    stopSecondTab();
  });

  it('drops the cache left by sessions too short to prune once a TTL passed since the last maintenance', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { storage } = fakeStorage(NOW - 4 * 60 * 1000);

    const shortSession = fakeCacheStorage().cacheStorage;
    const stopShortSession = scheduleDelegatedRoutingCacheMaintenance({ storage, cacheStorage: shortSession });
    await vi.advanceTimersByTimeAsync(10_000);
    stopShortSession();
    expect(shortSession.delete).not.toHaveBeenCalled();
    expect(shortSession.open).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    const nextSession = fakeCacheStorage().cacheStorage;
    const stopNextSession = scheduleDelegatedRoutingCacheMaintenance({ storage, cacheStorage: nextSession });
    await vi.advanceTimersByTimeAsync(0);
    expect(nextSession.delete).toHaveBeenCalledTimes(1);
    stopNextSession();
  });
});
