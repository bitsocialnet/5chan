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
 * waited 4 s on the iPhone simulator. The app therefore prunes the expired entries of a running
 * session and, at start, drops the whole cache when no session has maintained it for a TTL (every
 * entry older than that has expired). A deleted cache stays usable through handles the node already
 * holds (Cache API spec; verified on WebKit).
 */
export const DELEGATED_ROUTING_CACHE_NAME = 'delegated-routing-v1-cache';
/** The client's default cacheTTL; each entry carries its expiry in an x-cache-expires header. */
export const DELEGATED_ROUTING_CACHE_TTL_MS = 5 * 60 * 1000;
// Long enough after start for the node's first lookups, which share the origin's cache queue, and
// short enough that most sessions prune at least once.
const FIRST_PRUNE_DELAY_MS = 30 * 1000;
// When a completed clear or prune last left the cache free of expired entries. A running tab
// refreshes it with every prune, so a tab opened meanwhile never deletes the cache that tab still
// uses; sessions too short to prune leave it alone, so the next start after a TTL deletes.
const LAST_MAINTAINED_STORAGE_KEY = 'fivechanDelegatedRoutingCacheMaintainedAt';

type MaintenanceStorage = Pick<Storage, 'getItem' | 'setItem'> | undefined;

// The localStorage getter itself throws when the browser blocks storage.
const defaultStorage = (): MaintenanceStorage => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

const readLastMaintained = (storage: MaintenanceStorage): number => {
  try {
    return Number(storage?.getItem(LAST_MAINTAINED_STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
};

const writeLastMaintained = (storage: MaintenanceStorage, now: () => number): void => {
  try {
    storage?.setItem(LAST_MAINTAINED_STORAGE_KEY, String(now()));
  } catch {
    // Storage unavailable: the next start clears the cache.
  }
};

interface ClearStaleDelegatedRoutingCacheOptions {
  now?: () => number;
  storage?: MaintenanceStorage;
  cacheStorage?: Pick<CacheStorage, 'delete'> | undefined;
}

/**
 * Deletes the routing cache when nothing has maintained it for a TTL or more, so a quick reload
 * keeps the still-valid entries. Resolves to whether the cache was deleted.
 */
export const clearStaleDelegatedRoutingCache = async ({
  now = Date.now,
  storage = defaultStorage(),
  cacheStorage = globalThis.caches,
}: ClearStaleDelegatedRoutingCacheOptions = {}): Promise<boolean> => {
  const lastMaintained = readLastMaintained(storage);
  if (!cacheStorage || (lastMaintained && now() - lastMaintained < DELEGATED_ROUTING_CACHE_TTL_MS)) {
    return false;
  }
  try {
    const deleted = await cacheStorage.delete(DELEGATED_ROUTING_CACHE_NAME);
    writeLastMaintained(storage, now);
    return deleted;
  } catch {
    return false;
  }
};

interface PruneExpiredDelegatedRoutingCacheOptions {
  now?: () => number;
  storage?: MaintenanceStorage;
  cacheStorage?: Pick<CacheStorage, 'has' | 'open'> | undefined;
  batchSize?: number;
}

/**
 * Deletes the entries whose expiry passed, a batch at a time so the node's own cache operations
 * interleave (a missing entry is an ordinary cache miss to the client), and records the maintenance.
 * Resolves to the number deleted.
 */
export const pruneExpiredDelegatedRoutingCache = async ({
  now = Date.now,
  storage = defaultStorage(),
  cacheStorage = globalThis.caches,
  batchSize = 50,
}: PruneExpiredDelegatedRoutingCacheOptions = {}): Promise<number> => {
  try {
    if (!cacheStorage) {
      return 0;
    }
    let deleted = 0;
    if (await cacheStorage.has(DELEGATED_ROUTING_CACHE_NAME)) {
      const cache = await cacheStorage.open(DELEGATED_ROUTING_CACHE_NAME);
      const requests = await cache.keys();
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
    }
    writeLastMaintained(storage, now);
    return deleted;
  } catch {
    return 0;
  }
};

interface ScheduleDelegatedRoutingCacheMaintenanceOptions {
  now?: () => number;
  storage?: MaintenanceStorage;
  cacheStorage?: Pick<CacheStorage, 'delete' | 'has' | 'open'> | undefined;
  timers?: Pick<typeof globalThis, 'setTimeout' | 'clearTimeout' | 'setInterval' | 'clearInterval'>;
  firstPruneDelayMs?: number;
  tickMs?: number;
}

/**
 * Runs the maintenance of one app session: clears the cache when nothing maintained it for a TTL,
 * then prunes expired entries shortly after start and every half TTL. Returns a function that
 * stops the timers.
 */
export const scheduleDelegatedRoutingCacheMaintenance = ({
  now = Date.now,
  storage = defaultStorage(),
  cacheStorage = globalThis.caches,
  timers = globalThis,
  firstPruneDelayMs = FIRST_PRUNE_DELAY_MS,
  tickMs = DELEGATED_ROUTING_CACHE_TTL_MS / 2,
}: ScheduleDelegatedRoutingCacheMaintenanceOptions = {}): (() => void) => {
  void clearStaleDelegatedRoutingCache({ now, storage, cacheStorage });
  const prune = () => void pruneExpiredDelegatedRoutingCache({ now, storage, cacheStorage });
  const firstPrune = timers.setTimeout(prune, firstPruneDelayMs);
  const tick = timers.setInterval(prune, tickMs);
  return () => {
    timers.clearTimeout(firstPrune);
    timers.clearInterval(tick);
  };
};
