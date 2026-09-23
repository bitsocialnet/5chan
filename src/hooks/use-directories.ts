import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { vendoredDirectoryLists as directoryListsData } from '../lib/utils/vendored-directory-lists';
import {
  isRecord,
  normalizeDirectoryDefaultsData,
  normalizeDirectoryList,
  sortDirectoryLists,
  toString,
  type DirectoriesData,
  type DirectoryDefaultsData,
  type DirectoryCommunity,
  type DirectoryList,
} from '../lib/utils/directory-list-utils';
import { normalizeBoardAddress } from '../lib/utils/directory-list-lookup-utils';
import {
  findDirectoryByAddress,
  getDirectoriesMetadata,
  getFallbackDirectoriesData,
  getFallbackDirectoryDefaults,
  normalizeDirectoriesData,
  toDirectoriesMetadata,
  type DirectoriesMetadata,
} from '../lib/utils/directories';

export type { DirectoriesData, DirectoryCommunity, DirectoryDefaultsData } from '../lib/utils/directory-list-utils';
export { findDirectoryByAddress, normalizeBoardAddress };

interface DirectoriesState {
  communities: DirectoryCommunity[];
  loading: boolean;
  error: Error | null;
}

const GITHUB_URL_TEMPLATE = 'https://raw.githubusercontent.com/bitsocialnet/lists/master/5chan-directories/5chan-{code}-directory.json';
const GITHUB_DEFAULTS_URL = 'https://raw.githubusercontent.com/bitsocialnet/lists/master/5chan-directories/5chan-directories-defaults.json';
const LOCALSTORAGE_KEY = '5chan-directories-cache';
const LOCALSTORAGE_DEFAULTS_KEY = '5chan-directory-defaults-cache';
const LOCALSTORAGE_TIMESTAMP_KEY = '5chan-directories-cache-timestamp';
const CACHE_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
const FETCH_RETRY_DELAY_MS = 60 * 1000; // 1 minute
const FETCH_TIMEOUT_MS = 10 * 1000;

let cacheCommunities: DirectoryCommunity[] | null = null;
let cacheMetadata: DirectoriesMetadata | null = null;
let inFlightGitHubFetch: Promise<DirectoriesData> | null = null;
let lastSuccessfulGitHubFetchAt: number | null = null;
let lastGitHubFetchAttemptAt: number | null = null;
let cacheDefaults: DirectoryDefaultsData | null = null;
// Exposed for deterministic unit tests around module-level cache state.
export const __resetDirectoriesModuleStateForTests = () => {
  cacheCommunities = null;
  cacheMetadata = null;
  inFlightGitHubFetch = null;
  lastSuccessfulGitHubFetchAt = null;
  lastGitHubFetchAttemptAt = null;
  cacheDefaults = null;
  directoriesHydrationStarted = false;
  useDirectoriesStore.setState({ communities: getFallbackDirectoriesData().communities, loading: true, error: null });
};

const mergeDirectoryDefaults = (remote: DirectoryDefaultsData, fallback: DirectoryDefaultsData): DirectoryDefaultsData => ({
  ...fallback,
  ...remote,
  directories: {
    ...fallback.directories,
    ...remote.directories,
  },
});

const getDirectoryDefaultsFromLocalStorage = (): DirectoryDefaultsData | null => {
  try {
    const cached = localStorage.getItem(LOCALSTORAGE_DEFAULTS_KEY);
    if (!cached) {
      return null;
    }

    const normalized = normalizeDirectoryDefaultsData(JSON.parse(cached));
    if (Object.keys(normalized.directories).length > 0) {
      return normalized;
    }
    console.warn('Invalid directory defaults cache format, clearing stale cache');
    localStorage.removeItem(LOCALSTORAGE_DEFAULTS_KEY);
  } catch (e) {
    console.warn('Failed to read directory defaults from localStorage:', e);
    localStorage.removeItem(LOCALSTORAGE_DEFAULTS_KEY);
  }
  return null;
};

const getFromLocalStorage = (): DirectoriesData | null => {
  try {
    const cached = localStorage.getItem(LOCALSTORAGE_KEY);
    const timestamp = localStorage.getItem(LOCALSTORAGE_TIMESTAMP_KEY);
    if (cached && timestamp) {
      const age = Date.now() - parseInt(timestamp, 10);
      if (age < CACHE_MAX_AGE_MS) {
        const parsed = JSON.parse(cached);
        const normalized = normalizeDirectoriesData(parsed);
        if (normalized) {
          cacheDefaults ??= getDirectoryDefaultsFromLocalStorage();
          return normalized;
        }
        console.warn('Invalid directories cache format, clearing stale cache');
        localStorage.removeItem(LOCALSTORAGE_KEY);
        localStorage.removeItem(LOCALSTORAGE_DEFAULTS_KEY);
        localStorage.removeItem(LOCALSTORAGE_TIMESTAMP_KEY);
      }
    }
  } catch (e) {
    console.warn('Failed to read from localStorage:', e);
  }
  return null;
};

const saveToLocalStorage = (data: DirectoriesData, defaults?: DirectoryDefaultsData) => {
  try {
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(data));
    if (defaults) {
      localStorage.setItem(LOCALSTORAGE_DEFAULTS_KEY, JSON.stringify(defaults));
    }
    localStorage.setItem(LOCALSTORAGE_TIMESTAMP_KEY, Date.now().toString());
  } catch (e) {
    console.warn('Failed to save to localStorage:', e);
  }
};

const hydrateModuleCaches = (data: DirectoriesData) => {
  cacheCommunities = data.communities;
  cacheMetadata = toDirectoriesMetadata(data);
};

const getFallbackDirectoryLists = (defaults?: DirectoryDefaultsData): DirectoryList[] => {
  const rawData = directoryListsData as unknown;
  if (!isRecord(rawData) || !Array.isArray(rawData.directories)) {
    return [];
  }

  return rawData.directories
    .map((directory) => {
      if (!isRecord(directory)) {
        return null;
      }
      const fallbackCode = toString(directory.directoryCode);
      return fallbackCode ? normalizeDirectoryList(directory, fallbackCode, defaults) : null;
    })
    .filter((list): list is DirectoryList => list !== null);
};

const fetchWithTimeout = async (url: string): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { cache: 'no-cache', signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Timed out fetching ${url}`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const fetchJsonWithTimeout = async (url: string): Promise<unknown> => {
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
};

const fetchDirectoryDefaultsFromGitHub = async (): Promise<DirectoryDefaultsData> => {
  return normalizeDirectoryDefaultsData(await fetchJsonWithTimeout(GITHUB_DEFAULTS_URL));
};

const fetchDirectoryListFromGitHub = async (code: string, defaults: DirectoryDefaultsData): Promise<DirectoryList | null> => {
  const response = await fetchWithTimeout(GITHUB_URL_TEMPLATE.replace('{code}', code));
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const list = normalizeDirectoryList(await response.json(), code, defaults);
  if (!list) {
    throw new Error(`Invalid directory list payload for ${code}`);
  }
  return list;
};

const fetchDirectoriesFromGitHub = async (): Promise<DirectoriesData> => {
  const defaults = mergeDirectoryDefaults(await fetchDirectoryDefaultsFromGitHub(), getFallbackDirectoryDefaults());
  const fallbackLists = getFallbackDirectoryLists(defaults);
  const fallbackListsByCode = new Map(fallbackLists.map((list) => [list.directoryCode, list]));
  const codes = [...new Set([...Object.keys(defaults.directories), ...fallbackLists.map((list) => list.directoryCode)])];
  const fetchedLists = await Promise.all(
    codes.map(async (code) => {
      try {
        return (await fetchDirectoryListFromGitHub(code, defaults)) ?? fallbackListsByCode.get(code) ?? null;
      } catch (error) {
        console.warn(`Failed to fetch directory list "${code}" from GitHub, using fallback if available:`, error);
        return fallbackListsByCode.get(code) ?? null;
      }
    }),
  );
  const lists = sortDirectoryLists(fetchedLists.filter((list): list is DirectoryList => list !== null));
  const fallbackMetadata = getDirectoriesMetadata(directoryListsData as unknown);
  const timestamps = [defaults.createdAt, defaults.updatedAt, ...lists.flatMap((list) => [list.createdAt, list.updatedAt])].filter(
    (value): value is number => typeof value === 'number',
  );
  const data = normalizeDirectoriesData({
    ...fallbackMetadata,
    ...(timestamps.length > 0 ? { createdAt: Math.min(...timestamps), updatedAt: Math.max(...timestamps) } : {}),
    directories: lists,
  });
  if (!data) {
    throw new Error('Invalid directories payload');
  }
  hydrateModuleCaches(data);
  cacheDefaults = defaults;
  lastSuccessfulGitHubFetchAt = Date.now();
  saveToLocalStorage(data, defaults);
  return data;
};

const shouldRefreshFromGitHub = () => {
  const now = Date.now();
  if (lastSuccessfulGitHubFetchAt !== null && now - lastSuccessfulGitHubFetchAt < CACHE_MAX_AGE_MS) {
    return false;
  }

  if (lastGitHubFetchAttemptAt !== null && now - lastGitHubFetchAttemptAt < FETCH_RETRY_DELAY_MS) {
    return false;
  }

  return true;
};

const fetchDirectoriesFromGitHubDeduped = async (): Promise<DirectoriesData | null> => {
  if (inFlightGitHubFetch) {
    return inFlightGitHubFetch;
  }

  if (!shouldRefreshFromGitHub()) {
    return null;
  }

  lastGitHubFetchAttemptAt = Date.now();
  inFlightGitHubFetch = fetchDirectoriesFromGitHub().finally(() => {
    inFlightGitHubFetch = null;
  });
  return inFlightGitHubFetch;
};

/**
 * Directory data is global, so it lives in one store rather than in per-caller `useState`.
 * `useDirectories` has ~60 call sites, several of them inside list rows (catalog tiles, markdown
 * bodies), and the previous implementation gave every instance its own state plus its own
 * hydration effect. Hydration therefore fanned out into one `setState` per mounted instance.
 * One store means a single write that React batches, and subscribers whose slice is unchanged
 * do not rerender at all.
 */
const useDirectoriesStore = create<DirectoriesState>(() => ({
  communities: getFallbackDirectoriesData().communities,
  loading: true,
  error: null,
}));

let directoriesHydrationStarted = false;

const setDirectoriesCommunities = (data: DirectoriesData) => {
  cacheCommunities = data.communities;
  useDirectoriesStore.setState({ communities: data.communities, loading: false, error: null });
};

const hydrateDirectoriesOnce = () => {
  if (directoriesHydrationStarted) {
    return;
  }
  directoriesHydrationStarted = true;

  void (async () => {
    if (cacheCommunities) {
      useDirectoriesStore.setState({ communities: cacheCommunities, loading: false, error: null });
    } else {
      // Check localStorage first
      const cachedData = getFromLocalStorage();
      if (cachedData) {
        setDirectoriesCommunities(cachedData);
      }
    }

    try {
      // Refresh from GitHub when the session cache is stale, without refetching for every hook mount.
      const directories = await fetchDirectoriesFromGitHubDeduped();
      if (directories) {
        setDirectoriesCommunities(directories);
      } else if (!cacheCommunities) {
        setDirectoriesCommunities(getFallbackDirectoriesData());
      }
    } catch (e) {
      console.warn('Failed to fetch directories from GitHub:', e);
      if (cacheCommunities) {
        useDirectoriesStore.setState({ communities: cacheCommunities, loading: false, error: null });
      } else {
        setDirectoriesCommunities(getFallbackDirectoriesData());
      }
    }
  })();
};

export const useDirectories = () => {
  const communities = useDirectoriesStore((state) => state.communities);

  // oxlint-disable-next-line react-hooks/exhaustive-deps -- the analyzer walks into the module-level function and reports its locals
  useEffect(hydrateDirectoriesOnce, []);

  // Prefer the module-level cache so consuming hooks keep a stable reference for memoization.
  return cacheCommunities || communities || getFallbackDirectoriesData().communities;
};

export const useDirectoryDefaults = (): DirectoryDefaultsData => {
  // Subscribe to the shared directory refresh so defaults update only when the matching directory payload commits.
  useDirectories();
  return cacheDefaults ?? getFallbackDirectoryDefaults();
};

export const useDirectoriesState = (): DirectoriesState => {
  // Field-level selectors rather than a whole-store subscription, so consumers only rerender
  // when the field they actually read changes.
  const communities = useDirectoriesStore((state) => state.communities);
  const loading = useDirectoriesStore((state) => state.loading);
  const error = useDirectoriesStore((state) => state.error);

  // oxlint-disable-next-line react-hooks/exhaustive-deps -- the analyzer walks into the module-level function and reports its locals
  useEffect(hydrateDirectoriesOnce, []);

  return useMemo(() => ({ communities, loading, error }), [communities, loading, error]);
};

export const useDirectoryAddresses = () => {
  const directories = useDirectories();
  const directoryAddresses = useMemo(() => (Array.isArray(directories) ? directories.map((community) => community.address) : []), [directories]);

  return directoryAddresses;
};

export const useDirectoryByAddress = (address: string | undefined) => {
  const directories = useDirectories();
  return useMemo(() => findDirectoryByAddress(directories, address), [directories, address]);
};

export const useDirectoriesMetadata = () => {
  const [metadata, setMetadata] = useState<DirectoriesMetadata | null>(null);

  useEffect(() => {
    let isMounted = true;
    const hydrateMetadata = (data: DirectoriesData) => {
      const nextMetadata = toDirectoriesMetadata(data);
      cacheMetadata = nextMetadata;
      if (isMounted) {
        setMetadata(nextMetadata);
      }
    };

    (async () => {
      if (cacheMetadata) {
        setMetadata(cacheMetadata);
      } else {
        // Check localStorage first
        const cachedData = getFromLocalStorage();
        if (cachedData) {
          hydrateMetadata(cachedData);
        }
      }

      try {
        // Refresh from GitHub when the session cache is stale, without refetching for every hook mount.
        const directories = await fetchDirectoriesFromGitHubDeduped();
        if (directories) {
          hydrateMetadata(directories);
        } else if (!cacheMetadata) {
          hydrateMetadata(getFallbackDirectoriesData());
        }
      } catch (e) {
        console.warn('Failed to fetch directory metadata from GitHub:', e);
        // Keep each hook instance in sync even if a sibling hook populated the module cache first.
        if (cacheMetadata) {
          if (isMounted) {
            setMetadata(cacheMetadata);
          }
        } else {
          hydrateMetadata(getFallbackDirectoriesData());
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  return cacheMetadata || metadata;
};
