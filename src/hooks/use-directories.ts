import { useEffect, useMemo, useState } from 'react';
import directoriesData from '../data/5chan-directories.json';

export interface DirectoriesMetadata {
  title: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

export interface DirectoryFeatures {
  pseudonymityMode?: string;
  nsfw?: boolean;
  hasFlags?: boolean;
  requirePostLink?: boolean;
  requirePostLinkIsMedia?: boolean;
  [key: string]: unknown;
}

export interface DirectoryCommunity {
  title?: string;
  address: string;
  nsfw?: boolean;
  directoryCode?: string;
  features?: DirectoryFeatures;
}

export interface DirectoriesData {
  title: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  communities: DirectoryCommunity[];
}

export interface DirectoriesState {
  communities: DirectoryCommunity[];
  loading: boolean;
  error: Error | null;
}

const GITHUB_URL = 'https://raw.githubusercontent.com/bitsocialhq/lists/master/5chan-directories.json';
const LOCALSTORAGE_KEY = '5chan-directories-cache';
const LOCALSTORAGE_TIMESTAMP_KEY = '5chan-directories-cache-timestamp';
const CACHE_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour
const FALLBACK_DIRECTORIES_DATA = directoriesData as DirectoriesData;

let cacheCommunities: DirectoryCommunity[] | null = null;
let cacheMetadata: DirectoriesMetadata | null = null;
let inFlightGitHubFetch: Promise<DirectoriesData> | null = null;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const normalizeFeatures = (value: unknown): DirectoryFeatures | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const normalizedFeatures = Object.entries(value).reduce<DirectoryFeatures>((acc, [key, featureValue]) => {
    if (typeof featureValue === 'string' || typeof featureValue === 'boolean' || typeof featureValue === 'number') {
      acc[key] = featureValue;
    }
    return acc;
  }, {});

  return Object.keys(normalizedFeatures).length > 0 ? normalizedFeatures : undefined;
};

const toCanonicalCommunity = (value: { address: unknown; title: unknown; nsfw: unknown; directoryCode?: unknown; features?: unknown }): DirectoryCommunity | null => {
  if (typeof value.address !== 'string') {
    return null;
  }

  const features = normalizeFeatures(value.features);
  const topLevelNsfw = typeof value.nsfw === 'boolean' ? value.nsfw : undefined;
  const featuresNsfw = typeof features?.nsfw === 'boolean' ? features.nsfw : undefined;

  return {
    address: value.address,
    ...(typeof value.title === 'string' ? { title: value.title } : {}),
    ...(typeof value.directoryCode === 'string' ? { directoryCode: value.directoryCode } : {}),
    ...(features ? { features } : {}),
    ...((topLevelNsfw ?? featuresNsfw) !== undefined ? { nsfw: topLevelNsfw ?? featuresNsfw } : {}),
  };
};

const dedupeCommunities = (entries: DirectoryCommunity[]): DirectoryCommunity[] => {
  const seenAddresses = new Set<string>();
  const normalizedEntries: DirectoryCommunity[] = [];

  for (const entry of entries) {
    if (seenAddresses.has(entry.address)) {
      continue;
    }
    seenAddresses.add(entry.address);
    normalizedEntries.push(entry);
  }

  return normalizedEntries;
};

const adaptV2Directories = (value: Record<string, unknown>): DirectoryCommunity[] => {
  if (!Array.isArray(value.directories)) {
    return [];
  }

  const communities = value.directories
    .map((directory) => {
      if (!isRecord(directory)) {
        return null;
      }
      const features = isRecord(directory.features) ? directory.features : null;
      return toCanonicalCommunity({
        address: directory.communityAddress,
        title: directory.title,
        nsfw: features?.nsfw,
        directoryCode: directory.directoryCode,
        features,
      });
    })
    .filter((community): community is DirectoryCommunity => community !== null);

  return dedupeCommunities(communities);
};

const adaptV1Communities = (value: Record<string, unknown>): DirectoryCommunity[] => {
  if (!Array.isArray(value.communities)) {
    return [];
  }

  const communities = value.communities
    .map((community) => {
      if (!isRecord(community)) {
        return null;
      }
      return toCanonicalCommunity({
        address: community.address,
        title: community.title,
        nsfw: community.nsfw,
        directoryCode: community.directoryCode,
        features: community.features,
      });
    })
    .filter((community): community is DirectoryCommunity => community !== null);

  return dedupeCommunities(communities);
};

const normalizeDirectoriesData = (value: unknown): DirectoriesData | null => {
  if (!isRecord(value)) {
    return null;
  }

  const adapters: Array<(raw: Record<string, unknown>) => DirectoryCommunity[]> = [adaptV2Directories, adaptV1Communities];
  const communities = adapters.map((adapter) => adapter(value)).find((normalized) => normalized.length > 0) ?? [];

  if (communities.length === 0) {
    return null;
  }

  return {
    title: typeof value.title === 'string' ? value.title : FALLBACK_DIRECTORIES_DATA.title,
    description: typeof value.description === 'string' ? value.description : FALLBACK_DIRECTORIES_DATA.description,
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : FALLBACK_DIRECTORIES_DATA.createdAt,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : FALLBACK_DIRECTORIES_DATA.updatedAt,
    communities,
  };
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
          return normalized;
        }
        console.warn('Invalid directories cache format, clearing stale cache');
        localStorage.removeItem(LOCALSTORAGE_KEY);
        localStorage.removeItem(LOCALSTORAGE_TIMESTAMP_KEY);
      }
    }
  } catch (e) {
    console.warn('Failed to read from localStorage:', e);
  }
  return null;
};

const saveToLocalStorage = (data: DirectoriesData) => {
  try {
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(data));
    localStorage.setItem(LOCALSTORAGE_TIMESTAMP_KEY, Date.now().toString());
  } catch (e) {
    console.warn('Failed to save to localStorage:', e);
  }
};

const fetchDirectoriesFromGitHub = async (): Promise<DirectoriesData> => {
  const response = await fetch(GITHUB_URL, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const data = normalizeDirectoriesData(await response.json());
  if (!data) {
    throw new Error('Invalid directories payload');
  }
  // Save successful fetch to localStorage
  saveToLocalStorage(data);
  return data;
};

const fetchDirectoriesFromGitHubDeduped = async (): Promise<DirectoriesData> => {
  if (!inFlightGitHubFetch) {
    inFlightGitHubFetch = fetchDirectoriesFromGitHub().finally(() => {
      inFlightGitHubFetch = null;
    });
  }
  return inFlightGitHubFetch;
};

export const useDirectories = () => {
  // Use vendored data as initial state to prevent theme flash on first load
  // This ensures NSFW status is known synchronously before first render
  const [state, setState] = useState<DirectoriesState>({
    communities: FALLBACK_DIRECTORIES_DATA.communities,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let isMounted = true;
    const hydrateCommunities = (data: DirectoriesData) => {
      cacheCommunities = data.communities;
      if (isMounted) {
        setState({
          communities: data.communities,
          loading: false,
          error: null,
        });
      }
    };

    (async () => {
      if (cacheCommunities) {
        setState({
          communities: cacheCommunities,
          loading: false,
          error: null,
        });
      } else {
        // Check localStorage first
        const cachedData = getFromLocalStorage();
        if (cachedData) {
          hydrateCommunities(cachedData);
        }
      }

      try {
        // Always attempt a background refresh from GitHub to pick up list updates
        const directories = await fetchDirectoriesFromGitHubDeduped();
        hydrateCommunities(directories);
      } catch (e) {
        console.warn('Failed to fetch directories from GitHub:', e);
        // Only fall back if we don't already have memory/localStorage data
        if (!cacheCommunities) {
          hydrateCommunities(FALLBACK_DIRECTORIES_DATA);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  // Always prefer cacheCommunities (module-level, stable reference) when available
  // Only use state.communities during initial load before cache is populated
  // This ensures a stable reference for memoization in consuming hooks
  return cacheCommunities || state.communities || FALLBACK_DIRECTORIES_DATA.communities;
};

export const useDirectoriesState = () => {
  // Use vendored data as fallback to prevent theme flash on first load
  const [state, setState] = useState<DirectoriesState>({
    communities: cacheCommunities || FALLBACK_DIRECTORIES_DATA.communities,
    loading: !cacheCommunities,
    error: null,
  });

  useEffect(() => {
    let isMounted = true;
    const hydrateCommunities = (data: DirectoriesData) => {
      cacheCommunities = data.communities;
      if (isMounted) {
        setState({
          communities: data.communities,
          loading: false,
          error: null,
        });
      }
    };

    (async () => {
      if (cacheCommunities) {
        setState({
          communities: cacheCommunities,
          loading: false,
          error: null,
        });
      } else {
        // Check localStorage first
        const cachedData = getFromLocalStorage();
        if (cachedData) {
          hydrateCommunities(cachedData);
        }
      }

      try {
        // Always attempt a background refresh from GitHub to pick up list updates
        const directories = await fetchDirectoriesFromGitHubDeduped();
        hydrateCommunities(directories);
      } catch (e) {
        console.warn('Failed to fetch directories from GitHub:', e);
        // Only fall back if we don't already have memory/localStorage data
        if (!cacheCommunities) {
          hydrateCommunities(FALLBACK_DIRECTORIES_DATA);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  return state;
};

export const useDirectoryAddresses = () => {
  const directories = useDirectories();
  return useMemo(() => (Array.isArray(directories) ? directories.map((community) => community.address) : []), [directories]);
};

export const useDirectoriesMetadata = () => {
  const [metadata, setMetadata] = useState<DirectoriesMetadata | null>(null);

  useEffect(() => {
    let isMounted = true;
    const hydrateMetadata = (data: DirectoriesData) => {
      const nextMetadata: DirectoriesMetadata = {
        title: data.title,
        description: data.description,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      };
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
        // Always attempt a background refresh from GitHub to pick up metadata updates
        const directories = await fetchDirectoriesFromGitHubDeduped();
        hydrateMetadata(directories);
      } catch (e) {
        console.warn('Failed to fetch directory metadata from GitHub:', e);
        // Only fall back if we don't already have memory/localStorage data
        if (!cacheMetadata) {
          hydrateMetadata(FALLBACK_DIRECTORIES_DATA);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  return cacheMetadata || metadata;
};
