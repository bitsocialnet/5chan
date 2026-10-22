import { describe, expect, it, vi } from 'vitest';
import { DELEGATED_ROUTING_CACHE_NAME, clearExpiredDelegatedRoutingCache, pruneExpiredDelegatedRoutingCache } from '../delegated-routing-cache';

const KEY = 'fivechanDelegatedRoutingCacheActiveAt';
const FIVE_MINUTES = 5 * 60 * 1000;

const setup = ({ lastActive, now = 1_000_000_000 }: { lastActive?: number; now?: number } = {}) => {
  const values = new Map<string, string>();
  if (lastActive !== undefined) {
    values.set(KEY, String(lastActive));
  }
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void values.set(key, value)),
  };
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
