import { useEffect, useMemo, useState } from 'react';
import directoriesData from '../data/5chan-directories.json';

export interface DirectoriesMetadata {
  title: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

export interface DirectoryCommunity {
  title?: string;
  address: string;
  nsfw?: boolean;
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

let cacheCommunities: DirectoryCommunity[] | null = null;
let cacheMetadata: DirectoriesMetadata | null = null;
let inFlightGitHubFetch: Promise<DirectoriesData> | null = null;

const getFromLocalStorage = (): DirectoriesData | null => {
  try {
    const cached = localStorage.getItem(LOCALSTORAGE_KEY);
    const timestamp = localStorage.getItem(LOCALSTORAGE_TIMESTAMP_KEY);
    if (cached && timestamp) {
      const age = Date.now() - parseInt(timestamp, 10);
      if (age < CACHE_MAX_AGE_MS) {
        return JSON.parse(cached);
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
  const data = await response.json();
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
    communities: (directoriesData as DirectoriesData).communities,
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
          hydrateCommunities(directoriesData as DirectoriesData);
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
  return cacheCommunities || state.communities;
};

export const useDirectoriesState = () => {
  // Use vendored data as fallback to prevent theme flash on first load
  const [state, setState] = useState<DirectoriesState>({
    communities: cacheCommunities || (directoriesData as DirectoriesData).communities,
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
          hydrateCommunities(directoriesData as DirectoriesData);
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
  return useMemo(() => directories.map((community) => community.address), [directories]);
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
          hydrateMetadata(directoriesData as DirectoriesData);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  return cacheMetadata || metadata;
};
