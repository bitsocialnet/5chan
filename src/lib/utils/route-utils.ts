import { DirectoryCommunity } from '../../hooks/use-directories';

/**
 * Extract directory short code from title (e.g., "/biz/ - Business & Finance" -> "biz")
 */
export const extractDirectoryFromTitle = (title: string): string | null => {
  const match = title.match(/^\/([^/]+)\//);
  return match ? match[1] : null;
};

// Cache for directory-to-address map
let cachedCommunitiesForDirectory: DirectoryCommunity[] | null = null;
let cachedDirectoryToAddressMap: Map<string, string> | null = null;

// Cache for address-to-directory map
let cachedCommunitiesForAddress: DirectoryCommunity[] | null = null;
let cachedAddressToDirectoryMap: Map<string, string> | null = null;

/**
 * Create a map from directory codes to community addresses
 * Uses caching to avoid recreating the map when communities array hasn't changed
 */
export const getDirectoryToAddressMap = (communities: DirectoryCommunity[]): Map<string, string> => {
  // Check if we can use cached map (same array reference)
  if (cachedDirectoryToAddressMap && cachedCommunitiesForDirectory === communities) {
    return cachedDirectoryToAddressMap;
  }

  const map = new Map<string, string>();
  for (const community of communities) {
    if (community.title) {
      const directory = extractDirectoryFromTitle(community.title);
      if (directory && community.address) {
        map.set(directory, community.address);
      }
    }
  }

  // Cache the map and array reference
  cachedDirectoryToAddressMap = map;
  cachedCommunitiesForDirectory = communities;
  return map;
};

/**
 * Create a map from community addresses to directory codes
 * Uses caching to avoid recreating the map when communities array hasn't changed
 */
export const getAddressToDirectoryMap = (communities: DirectoryCommunity[]): Map<string, string> => {
  // Check if we can use cached map (same array reference)
  if (cachedAddressToDirectoryMap && cachedCommunitiesForAddress === communities) {
    return cachedAddressToDirectoryMap;
  }

  const map = new Map<string, string>();
  for (const community of communities) {
    if (community.title && community.address) {
      const directory = extractDirectoryFromTitle(community.title);
      if (directory) {
        map.set(community.address, directory);
      }
    }
  }

  // Cache the map and array reference
  cachedAddressToDirectoryMap = map;
  cachedCommunitiesForAddress = communities;
  return map;
};

/**
 * Convert community address to URL path (directory code if available, otherwise full address)
 */
export const getBoardPath = (communityAddress: string, communities: DirectoryCommunity[]): string => {
  const addressToDirectory = getAddressToDirectoryMap(communities);
  const directory = addressToDirectory.get(communityAddress);
  return directory || communityAddress;
};

/**
 * Convert URL path (directory code or address) to community address
 */
export const getSubplebbitAddress = (boardIdentifier: string, communities: DirectoryCommunity[]): string => {
  const directoryToAddress = getDirectoryToAddressMap(communities);

  // Check if it's a directory code
  const address = directoryToAddress.get(boardIdentifier);
  if (address) {
    return address;
  }

  // Otherwise, assume it's already an address
  return boardIdentifier;
};

/**
 * Check if an identifier is a directory short code
 */
export const isDirectoryBoard = (identifier: string, communities: DirectoryCommunity[]): boolean => {
  const directoryToAddress = getDirectoryToAddressMap(communities);
  return directoryToAddress.has(identifier);
};

export const isFeedRoute = (pathname: string): boolean => {
  const normalizedPath = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

  if (normalizedPath.includes('/thread/')) return false;
  if (normalizedPath.startsWith('/pending/')) return false;
  if (normalizedPath.includes('/modqueue')) return false;

  const pathWithoutSettings = normalizedPath.replace(/\/settings$/, '');

  if (pathWithoutSettings.startsWith('/all')) return true;
  if (pathWithoutSettings.startsWith('/subs')) return true;
  if (pathWithoutSettings.startsWith('/mod')) return true;

  const segments = pathWithoutSettings.split('/').filter(Boolean);
  if (segments.length >= 1) {
    if (segments.length === 1) return true;
    if (segments.length === 2 && segments[1] === 'catalog') return true;
    if (segments.length === 2 && (/^(?:\d+(?:h|d|w|m|y)|all)$/.test(segments[1]) || /^([1-9]|10)$/.test(segments[1]))) return true;
    if (segments.length === 3 && segments[1] === 'catalog' && /^(?:\d+(?:h|d|w|m|y)|all)$/.test(segments[2])) return true;
    if (segments.length === 3 && /^(?:\d+(?:h|d|w|m|y)|all)$/.test(segments[1]) && /^([1-9]|10)$/.test(segments[2])) return true;
    if (segments.length === 2 && segments[0] !== 'all' && segments[0] !== 'subs' && segments[0] !== 'mod' && /^([1-9]|10)$/.test(segments[1])) return true;
  }

  return false;
};

export const isPostRoute = (pathname: string): boolean => {
  const normalizedPath = pathname.replace(/\/settings$/, '');

  if (normalizedPath.includes('/thread/')) return true;

  return false;
};

export const isPendingPostRoute = (pathname: string): boolean => {
  const normalizedPath = pathname.replace(/\/settings$/, '');
  return normalizedPath.startsWith('/pending/');
};

export const isModQueueRoute = (pathname: string): boolean => {
  const normalizedPath = pathname.replace(/\/settings$/, '');
  return normalizedPath.includes('/modqueue');
};

/** Page numbers 1–10 for board feed pagination */
export const BOARD_PAGE_REGEX = /^([1-9]|10)$/;

export const isBoardFeedPageNumber = (segment: string): boolean => BOARD_PAGE_REGEX.test(segment);

/** Strip trailing page number (1–10) from path for feed cache key */
export const stripPageFromFeedPath = (path: string): string => {
  const segments = path.split('/').filter(Boolean);
  if (segments.length > 1 && isBoardFeedPageNumber(segments[segments.length - 1])) {
    return '/' + segments.slice(0, -1).join('/');
  }
  return path;
};

/** Parse current page number (1–10) from feed pathname; returns 1 if none */
export const getPageFromFeedPath = (pathname: string): number => {
  const normalized = pathname.replace(/\/settings$/, '').replace(/\/$/, '');
  const segments = normalized.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  if (last && isBoardFeedPageNumber(last)) {
    const n = parseInt(last, 10);
    return Math.min(10, Math.max(1, n));
  }
  return 1;
};

export const getFeedCacheKey = (pathname: string): string | null => {
  let normalizedPath = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  normalizedPath = normalizedPath.replace(/\/settings$/, '');

  if (normalizedPath.includes('/thread/')) {
    const parts = normalizedPath.split('/thread/');
    return parts[0] || null;
  }

  if (normalizedPath.startsWith('/pending/')) {
    return null;
  }

  if (normalizedPath.includes('/modqueue')) {
    return null;
  }

  if (isFeedRoute(pathname)) {
    return stripPageFromFeedPath(normalizedPath);
  }

  return null;
};

export const getFeedType = (pathname: string): 'board' | 'catalog' | null => {
  const normalizedPath = pathname.replace(/\/settings$/, '');

  if (normalizedPath.includes('/catalog')) {
    return 'catalog';
  }

  if (isFeedRoute(pathname)) {
    return 'board';
  }

  if (isPostRoute(pathname)) {
    return 'board';
  }

  return null;
};
