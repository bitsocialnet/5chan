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
// Long enough after start for the node's first lookups, which share the origin's cache queue, and
// short enough that a session shorter than a TTL still prunes what earlier sessions left.
const FIRST_PRUNE_DELAY_MS = 30 * 1000;
const LAST_ACTIVE_STORAGE_KEY = 'fivechanDelegatedRoutingCacheActiveAt';

type ActivityStorage = Pick<Storage, 'getItem' | 'setItem'> | undefined;

// The localStorage getter itself throws when the browser blocks storage.
const defaultStorage = (): ActivityStorage => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

interface ClearExpiredDelegatedRoutingCacheOptions {
  now?: () => number;
  storage?: ActivityStorage;
  cacheStorage?: Pick<CacheStorage, 'delete'> | undefined;
  target?: Pick<Window, 'addEventListener'> | undefined;
}

const readLastActive = (storage: ActivityStorage): number => {
  try {
    return Number(storage?.getItem(LAST_ACTIVE_STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
};

const writeLastActive = (storage: ActivityStorage, now: () => number): void => {
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
  storage = defaultStorage(),
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

interface ScheduleDelegatedRoutingCacheMaintenanceOptions {
  now?: () => number;
  storage?: ActivityStorage;
  cacheStorage?: Pick<CacheStorage, 'delete' | 'has' | 'open'> | undefined;
  target?: Pick<Window, 'addEventListener'> | undefined;
  timers?: Pick<typeof globalThis, 'setTimeout' | 'clearTimeout' | 'setInterval' | 'clearInterval'>;
  firstPruneDelayMs?: number;
  tickMs?: number;
}

/**
 * Runs the maintenance of one app session: clears the cache when the previous session is stale,
 * prunes expired entries shortly after start and then every half TTL, and refreshes the activity
 * stamp on each tick, so a tab opened while another tab is still running sees a live session and
 * never deletes the cache that tab still uses. Returns a function that stops the timers.
 */
export const scheduleDelegatedRoutingCacheMaintenance = ({
  now = Date.now,
  storage = defaultStorage(),
  cacheStorage = globalThis.caches,
  target = globalThis,
  timers = globalThis,
  firstPruneDelayMs = FIRST_PRUNE_DELAY_MS,
  tickMs = DELEGATED_ROUTING_CACHE_TTL_MS / 2,
}: ScheduleDelegatedRoutingCacheMaintenanceOptions = {}): (() => void) => {
  void clearExpiredDelegatedRoutingCache({ now, storage, cacheStorage, target });
  const prune = () => void pruneExpiredDelegatedRoutingCache({ now, cacheStorage });
  const firstPrune = timers.setTimeout(prune, firstPruneDelayMs);
  const tick = timers.setInterval(() => {
    writeLastActive(storage, now);
    prune();
  }, tickMs);
  return () => {
    timers.clearTimeout(firstPrune);
    timers.clearInterval(tick);
  };
};
