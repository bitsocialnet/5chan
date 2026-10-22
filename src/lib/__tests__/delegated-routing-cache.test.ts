import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DELEGATED_ROUTING_CACHE_NAME,
  clearExpiredDelegatedRoutingCache,
  pruneExpiredDelegatedRoutingCache,
  scheduleDelegatedRoutingCacheMaintenance,
} from '../delegated-routing-cache';

const KEY = 'fivechanDelegatedRoutingCacheActiveAt';
const FIVE_MINUTES = 5 * 60 * 1000;

const fakeStorage = (lastActive?: number) => {
  const values = new Map<string, string>();
  if (lastActive !== undefined) {
    values.set(KEY, String(lastActive));
  }
  return {
    values,
    storage: {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => void values.set(key, value)),
    },
  };
};

const setup = ({ lastActive, now = 1_000_000_000 }: { lastActive?: number; now?: number } = {}) => {
  const { values, storage } = fakeStorage(lastActive);
  const cacheStorage = { delete: vi.fn().mockResolvedValue(true) };
  const listeners: Record<string, () => void> = {};
  const target = { addEventListener: vi.fn((type: string, listener: () => void) => void (listeners[type] = listener)) };
  const clock = { now };
  return {
    storage,
    cacheStorage,
    target,
    listeners,
    values,
    clock,
    run: () => clearExpiredDelegatedRoutingCache({ now: () => clock.now, storage, cacheStorage, target }),
  };
};

describe('clearExpiredDelegatedRoutingCache', () => {
  it('deletes the cache on the first start and records the start time', async () => {
    const { run, cacheStorage, values, clock } = setup();
    await expect(run()).resolves.toBe(true);
    expect(cacheStorage.delete).toHaveBeenCalledWith(DELEGATED_ROUTING_CACHE_NAME);
    expect(values.get(KEY)).toBe(String(clock.now));
  });

  it('keeps the cache when the app was active less than the TTL ago', async () => {
    const now = 1_000_000_000;
    const { run, cacheStorage, values } = setup({ lastActive: now - FIVE_MINUTES + 1, now });
    await expect(run()).resolves.toBe(false);
    expect(cacheStorage.delete).not.toHaveBeenCalled();
    expect(values.get(KEY)).toBe(String(now));
  });

  it('deletes the cache when the app was last active a TTL or more ago', async () => {
    const now = 1_000_000_000;
    const { run, cacheStorage } = setup({ lastActive: now - FIVE_MINUTES, now });
    await expect(run()).resolves.toBe(true);
    expect(cacheStorage.delete).toHaveBeenCalledTimes(1);
  });

  it('records activity again when the page hides', async () => {
    const { run, listeners, values, clock } = setup();
    await run();
    clock.now += 60_000;
    listeners.pagehide();
    expect(values.get(KEY)).toBe(String(clock.now));
  });

  it('does nothing without the Cache API and survives storage or delete failures', async () => {
    await expect(clearExpiredDelegatedRoutingCache({ storage: undefined, cacheStorage: undefined, target: undefined })).resolves.toBe(false);

    const throwingStorage = {
      getItem: vi.fn(() => {
        throw new Error('blocked');
      }),
      setItem: vi.fn(() => {
        throw new Error('blocked');
      }),
    };
    const cacheStorage = { delete: vi.fn().mockRejectedValue(new Error('SecurityError')) };
    await expect(clearExpiredDelegatedRoutingCache({ storage: throwingStorage, cacheStorage, target: undefined })).resolves.toBe(false);
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
      const cacheStorage = { delete: vi.fn().mockResolvedValue(true) };
      await expect(clearExpiredDelegatedRoutingCache({ cacheStorage, target: undefined })).resolves.toBe(true);
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
  const now = 1_000_000_000;
  const entry = (url: string, expires: number) => ({
    request: { url } as unknown as Request,
    response: { headers: new Headers({ 'x-cache-expires': String(expires) }) } as unknown as Response,
  });
  const fakeCache = (entries: ReturnType<typeof entry>[]) => {
    const byUrl = new Map(entries.map(({ request, response }) => [request.url, response]));
    return {
      keys: vi.fn().mockResolvedValue(entries.map(({ request }) => request)),
      match: vi.fn(async (request: Request) => byUrl.get(request.url)),
      delete: vi.fn().mockResolvedValue(true),
    };
  };

  it('deletes expired entries in batches and keeps live ones', async () => {
    const live = entry('https://router/live', now + 1);
    const expired = [entry('https://router/a', now), entry('https://router/b', now - 1), entry('https://router/c', 0)];
    const cache = fakeCache([live, ...expired]);
    const cacheStorage = { has: vi.fn().mockResolvedValue(true), open: vi.fn().mockResolvedValue(cache) };
    await expect(pruneExpiredDelegatedRoutingCache({ now: () => now, cacheStorage, batchSize: 2 })).resolves.toBe(3);
    expect(cache.delete.mock.calls.map(([request]) => request.url)).toEqual(expired.map(({ request }) => request.url));
    expect(cacheStorage.open).toHaveBeenCalledWith(DELEGATED_ROUTING_CACHE_NAME);
  });

  it('does not create the cache when the node has not opened it', async () => {
    const cacheStorage = { has: vi.fn().mockResolvedValue(false), open: vi.fn() };
    await expect(pruneExpiredDelegatedRoutingCache({ now: () => now, cacheStorage })).resolves.toBe(0);
    expect(cacheStorage.open).not.toHaveBeenCalled();
    await expect(pruneExpiredDelegatedRoutingCache({ now: () => now, cacheStorage: undefined })).resolves.toBe(0);
  });

  it('returns 0 when the Cache API fails', async () => {
    const cacheStorage = { has: vi.fn().mockRejectedValue(new Error('SecurityError')), open: vi.fn() };
    await expect(pruneExpiredDelegatedRoutingCache({ now: () => now, cacheStorage })).resolves.toBe(0);
  });
});

describe('scheduleDelegatedRoutingCacheMaintenance', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const fakeCacheStorage = () => {
    const cache = { keys: vi.fn().mockResolvedValue([]), match: vi.fn(), delete: vi.fn() };
    return {
      delete: vi.fn().mockResolvedValue(true),
      has: vi.fn().mockResolvedValue(true),
      open: vi.fn().mockResolvedValue(cache),
    };
  };

  it('clears a stale cache at start, prunes after the first delay, then refreshes the stamp and prunes every tick', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000_000);
    const { values, storage } = fakeStorage(1_000_000_000 - FIVE_MINUTES);
    const cacheStorage = fakeCacheStorage();
    const stop = scheduleDelegatedRoutingCacheMaintenance({ storage, cacheStorage, target: undefined, firstPruneDelayMs: 1_000, tickMs: 2_000 });

    await vi.advanceTimersByTimeAsync(0);
    expect(cacheStorage.delete).toHaveBeenCalledWith(DELEGATED_ROUTING_CACHE_NAME);
    expect(cacheStorage.open).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(cacheStorage.open).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(cacheStorage.open).toHaveBeenCalledTimes(2);
    expect(values.get(KEY)).toBe(String(1_000_000_000 + 2_000));

    stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(cacheStorage.open).toHaveBeenCalledTimes(2);
    expect(cacheStorage.delete).toHaveBeenCalledTimes(1);
  });

  it('keeps the cache of a tab that is still running: its ticks keep the stamp within a TTL', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000_000);
    const { storage } = fakeStorage();
    const firstTab = fakeCacheStorage();
    const stopFirstTab = scheduleDelegatedRoutingCacheMaintenance({ storage, cacheStorage: firstTab, target: undefined });
    await vi.advanceTimersByTimeAsync(0);
    expect(firstTab.delete).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3 * FIVE_MINUTES);
    const secondTab = fakeCacheStorage();
    const stopSecondTab = scheduleDelegatedRoutingCacheMaintenance({ storage, cacheStorage: secondTab, target: undefined });
    await vi.advanceTimersByTimeAsync(0);
    expect(secondTab.delete).not.toHaveBeenCalled();

    stopFirstTab();
    stopSecondTab();
  });
});
