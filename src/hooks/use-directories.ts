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

const fetchDirectoriesData = async (): Promise<DirectoriesData> => {
  try {
    const response = await fetch(GITHUB_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    // Save successful fetch to localStorage
    saveToLocalStorage(data);
    return data;
  } catch (e) {
    console.warn('Failed to fetch directories from GitHub, using vendored fallback:', e);
    // Fall back to vendored file
    return directoriesData as DirectoriesData;
  }
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
    if (cacheCommunities) {
      setState({
        communities: cacheCommunities,
        loading: false,
        error: null,
      });
      return;
    }

    let isMounted = true;

    (async () => {
      try {
        // Check localStorage first
        const cachedData = getFromLocalStorage();
        if (cachedData) {
          cacheCommunities = cachedData.communities;
          if (isMounted) {
            setState({
              communities: cachedData.communities,
              loading: false,
              error: null,
            });
          }
          // Still try to fetch fresh data in background (don't await)
          fetchDirectoriesData()
            .then((data) => {
              if (isMounted) {
                cacheCommunities = data.communities;
                setState({
                  communities: data.communities,
                  loading: false,
                  error: null,
                });
              }
            })
            .catch((e) => {
              console.warn('Background fetch failed:', e);
            });
          return;
        }

        // No cache, fetch fresh data
        const directories = await fetchDirectoriesData();
        if (isMounted) {
          cacheCommunities = directories.communities;
          setState({
            communities: directories.communities,
            loading: false,
            error: null,
          });
        }
      } catch (e) {
        console.warn('Failed to load directories:', e);
        // Fallback to vendored data
        const fallbackData = directoriesData as DirectoriesData;
        if (isMounted) {
          cacheCommunities = fallbackData.communities;
          setState({
            communities: fallbackData.communities,
            loading: false,
            error: null,
          });
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
    if (cacheCommunities) {
      setState({
        communities: cacheCommunities,
        loading: false,
        error: null,
      });
      return;
    }

    let isMounted = true;

    (async () => {
      try {
        // Check localStorage first
        const cachedData = getFromLocalStorage();
        if (cachedData) {
          cacheCommunities = cachedData.communities;
          if (isMounted) {
            setState({
              communities: cachedData.communities,
              loading: false,
              error: null,
            });
          }
          // Still try to fetch fresh data in background (don't await)
          fetchDirectoriesData()
            .then((data) => {
              if (isMounted) {
                cacheCommunities = data.communities;
                setState({
                  communities: data.communities,
                  loading: false,
                  error: null,
                });
              }
            })
            .catch((e) => {
              console.warn('Background fetch failed:', e);
            });
          return;
        }

        // No cache, fetch fresh data
        const directories = await fetchDirectoriesData();
        if (isMounted) {
          cacheCommunities = directories.communities;
          setState({
            communities: directories.communities,
            loading: false,
            error: null,
          });
        }
      } catch (e) {
        console.warn('Failed to load directories:', e);
        // Fallback to vendored data
        const fallbackData = directoriesData as DirectoriesData;
        if (isMounted) {
          cacheCommunities = fallbackData.communities;
          setState({
            communities: fallbackData.communities,
            loading: false,
            error: null,
          });
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
    if (cacheMetadata) {
      return;
    }

    let isMounted = true;

    (async () => {
      try {
        // Check localStorage first
        const cachedData = getFromLocalStorage();
        if (cachedData) {
          const metadata: DirectoriesMetadata = {
            title: cachedData.title,
            description: cachedData.description,
            createdAt: cachedData.createdAt,
            updatedAt: cachedData.updatedAt,
          };
          cacheMetadata = metadata;
          if (isMounted) {
            setMetadata(metadata);
          }
          // Still try to fetch fresh data in background (don't await)
          fetchDirectoriesData()
            .then((data) => {
              if (isMounted) {
                const freshMetadata: DirectoriesMetadata = {
                  title: data.title,
                  description: data.description,
                  createdAt: data.createdAt,
                  updatedAt: data.updatedAt,
                };
                cacheMetadata = freshMetadata;
                setMetadata(freshMetadata);
              }
            })
            .catch((e) => {
              console.warn('Background metadata fetch failed:', e);
            });
          return;
        }

        // No cache, fetch fresh data
        const directories = await fetchDirectoriesData();
        if (isMounted) {
          const metadata: DirectoriesMetadata = {
            title: directories.title,
            description: directories.description,
            createdAt: directories.createdAt,
            updatedAt: directories.updatedAt,
          };
          cacheMetadata = metadata;
          setMetadata(metadata);
        }
      } catch (e) {
        console.warn('Failed to load metadata, using vendored fallback:', e);
        // Fallback to vendored data
        const fallbackData = directoriesData as DirectoriesData;
        if (isMounted) {
          const metadata: DirectoriesMetadata = {
            title: fallbackData.title,
            description: fallbackData.description,
            createdAt: fallbackData.createdAt,
            updatedAt: fallbackData.updatedAt,
          };
          cacheMetadata = metadata;
          setMetadata(metadata);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  return cacheMetadata || metadata;
};
