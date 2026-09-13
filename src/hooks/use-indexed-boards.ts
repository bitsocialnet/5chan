import { useCallback, useSyncExternalStore } from 'react';
import { fetchIndexedBoardsFromChain, type IndexedBoard } from '../lib/search-indexer';
import { getSearchProviderChain } from '../lib/search-providers';

const REVALIDATE_INTERVAL_MS = 60 * 60 * 1000;
const FETCH_RETRY_DELAY_MS = 60 * 1000;

export interface IndexedBoardsState {
  boards: IndexedBoard[];
  /** The list is still in flight, so more matches may still appear. */
  loading: boolean;
}

/**
 * One list per provider chain, so pinning another indexer from /search/directory reads that
 * indexer's boards. There is no error state: an unreachable chain yields an empty list, and the
 * local board lists answer on their own.
 */
interface IndexedBoardsStore {
  snapshot: IndexedBoardsState;
  listeners: Set<() => void>;
  inFlight: Promise<void> | null;
  lastSuccessAt: number;
  lastAttemptAt: number;
}

const EMPTY_SNAPSHOT: IndexedBoardsState = { boards: [], loading: false };
const stores = new Map<string, IndexedBoardsStore>();

const getStoreKey = (selectedProviderId: string | null): string => selectedProviderId ?? '';

const getStore = (key: string): IndexedBoardsStore => {
  let store = stores.get(key);
  if (!store) {
    store = { snapshot: EMPTY_SNAPSHOT, listeners: new Set(), inFlight: null, lastSuccessAt: 0, lastAttemptAt: 0 };
    stores.set(key, store);
  }
  return store;
};

const setSnapshot = (store: IndexedBoardsStore, snapshot: IndexedBoardsState) => {
  store.snapshot = snapshot;
  store.listeners.forEach((listener) => listener());
};

const shouldRevalidate = (store: IndexedBoardsStore): boolean => {
  const now = Date.now();
  if (store.lastSuccessAt > 0 && now - store.lastSuccessAt < REVALIDATE_INTERVAL_MS) return false;
  return store.lastAttemptAt === 0 || now - store.lastAttemptAt >= FETCH_RETRY_DELAY_MS;
};

const revalidate = (selectedProviderId: string | null): Promise<void> | null => {
  const store = getStore(getStoreKey(selectedProviderId));
  if (store.inFlight) return store.inFlight;
  if (!shouldRevalidate(store)) return null;

  store.lastAttemptAt = Date.now();
  setSnapshot(store, { ...store.snapshot, loading: true });

  const request = fetchIndexedBoardsFromChain(getSearchProviderChain(selectedProviderId))
    .then((boards) => {
      // Nobody answered: keep what we have and try again after the retry delay.
      if (boards === null) {
        setSnapshot(store, { ...store.snapshot, loading: false });
        return;
      }
      store.lastSuccessAt = Date.now();
      setSnapshot(store, { boards, loading: false });
    })
    .finally(() => {
      store.inFlight = null;
    });

  store.inFlight = request;
  return request;
};

/** The refresh button reruns the search, so a board list that never arrived is asked for again too. */
export const retryIndexedBoards = (selectedProviderId: string | null): void => {
  const store = getStore(getStoreKey(selectedProviderId));
  if (store.lastSuccessAt > 0) return;
  store.lastAttemptAt = 0;
  void revalidate(selectedProviderId);
};

// Exposed for deterministic unit tests around module-level cache state.
export const __resetIndexedBoardsForTests = () => {
  stores.clear();
};

const getEmptySnapshot = (): IndexedBoardsState => EMPTY_SNAPSHOT;

export const useIndexedBoards = (selectedProviderId: string | null): IndexedBoardsState => {
  const key = getStoreKey(selectedProviderId);
  const subscribe = useCallback(
    (listener: () => void) => {
      const store = getStore(key);
      store.listeners.add(listener);
      void revalidate(key || null);
      return () => {
        store.listeners.delete(listener);
      };
    },
    [key],
  );
  const getSnapshot = useCallback(() => getStore(key).snapshot, [key]);

  return useSyncExternalStore(subscribe, getSnapshot, getEmptySnapshot);
};
