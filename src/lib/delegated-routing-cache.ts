/**
 * @helia/delegated-routing-v1-http-api-client (started by pkc-js) stores every routing GET in this
 * Cache API cache with a five-minute TTL, but it evicts an entry only when the same URL is looked up
 * again and clears the cache only when the node stops, which a closed tab never does. The cache
 * therefore keeps every lookup the app ever made: 10,000+ records after a few days of use.
 *
 * After Safari starts, the origin's first Cache API operation waits while WebKit reads every record
 * file the origin stores (about 0.3 ms per record on a Mac, more on a phone), and every operation
 * issued meanwhile, reads included, queues behind it. The service worker answers every file of the
 * page through that queue, so with a 10,000-record routing cache the home logo and the load event
 * waited 4 s on the iPhone simulator. The app therefore drops the cache before the node reopens it
 * whenever the previous session ended long enough ago for all of its entries to have expired, and
 * prunes the expired entries of a running session so the cache stays small. A deleted cache stays
 * usable through handles the node already holds (Cache API spec; verified on WebKit).
 */
export const DELEGATED_ROUTING_CACHE_NAME = 'delegated-routing-v1-cache';
/** The client's default cacheTTL; each entry carries its expiry in an x-cache-expires header. */
export const DELEGATED_ROUTING_CACHE_TTL_MS = 5 * 60 * 1000;
const LAST_ACTIVE_STORAGE_KEY = 'fivechanDelegatedRoutingCacheActiveAt';

interface ClearExpiredDelegatedRoutingCacheOptions {
  now?: () => number;
  storage?: Pick<Storage, 'getItem' | 'setItem'> | undefined;
  cacheStorage?: Pick<CacheStorage, 'delete'> | undefined;
  target?: Pick<Window, 'addEventListener'> | undefined;
}

const readLastActive = (storage: ClearExpiredDelegatedRoutingCacheOptions['storage']): number => {
  try {
    return Number(storage?.getItem(LAST_ACTIVE_STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
};

const writeLastActive = (storage: ClearExpiredDelegatedRoutingCacheOptions['storage'], now: () => number): void => {
  try {
    storage?.setItem(LAST_ACTIVE_STORAGE_KEY, String(now()));
  } catch {
    // Storage unavailable: the next start clears the cache.
  }
};

/**
 * Deletes the routing cache when the app was last active more than its TTL ago, and records app
 * activity (start, page hide) so a quick reload keeps the still-valid entries. Resolves to whether the
 * cache was deleted.
 */
export const clearExpiredDelegatedRoutingCache = async ({
  now = Date.now,
  storage = globalThis.localStorage,
  cacheStorage = globalThis.caches,
  target = globalThis,
}: ClearExpiredDelegatedRoutingCacheOptions = {}): Promise<boolean> => {
  const lastActive = readLastActive(storage);
  writeLastActive(storage, now);
  target?.addEventListener('pagehide', () => writeLastActive(storage, now));
  if (!cacheStorage || (lastActive && now() - lastActive < DELEGATED_ROUTING_CACHE_TTL_MS)) {
    return false;
  }
  try {
    return await cacheStorage.delete(DELEGATED_ROUTING_CACHE_NAME);
  } catch {
    return false;
  }
};

interface PruneExpiredDelegatedRoutingCacheOptions {
  now?: () => number;
  cacheStorage?: Pick<CacheStorage, 'has' | 'open'> | undefined;
  batchSize?: number;
}

/**
 * Deletes the entries whose expiry passed, a batch at a time so the node's own cache operations
 * interleave (a missing entry is an ordinary cache miss to the client). Resolves to the number deleted.
 */
export const pruneExpiredDelegatedRoutingCache = async ({
  now = Date.now,
  cacheStorage = globalThis.caches,
  batchSize = 50,
}: PruneExpiredDelegatedRoutingCacheOptions = {}): Promise<number> => {
  try {
    if (!cacheStorage || !(await cacheStorage.has(DELEGATED_ROUTING_CACHE_NAME))) {
      return 0;
    }
    const cache = await cacheStorage.open(DELEGATED_ROUTING_CACHE_NAME);
    const requests = await cache.keys();
    let deleted = 0;
    for (let index = 0; index < requests.length; index += batchSize) {
      const results = await Promise.all(
        requests.slice(index, index + batchSize).map(async (request) => {
          const response = await cache.match(request);
          if (response && Number(response.headers.get('x-cache-expires')) > now()) {
            return false;
          }
          return cache.delete(request);
        }),
      );
      deleted += results.filter(Boolean).length;
    }
    return deleted;
  } catch {
    return 0;
  }
};
