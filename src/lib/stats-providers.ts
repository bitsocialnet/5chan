// vite.config.js reads this file to start the home page's request from index.html (see
// scripts/vite-stats-provider-prefetch.mjs), so it imports nothing.

export interface StatsProvider {
  apiUrl: string;
  id: string;
  name: string;
  siteUrl: string;
}

/**
 * Services that serve the home page's popular threads and stats in one request, so the page does
 * not have to load every board over P2P first. They are tried in order, and pure P2P loading is
 * the fallback when all of them fail.
 */
export const STATS_PROVIDERS: readonly StatsProvider[] = [
  {
    apiUrl: 'https://stats.bitsocial.net',
    id: 'stats-bitsocial-net',
    name: 'stats.bitsocial.net',
    siteUrl: 'https://stats.bitsocial.net',
  },
];

// A provider is only worth waiting for while it is faster than loading the boards over P2P.
export const STATS_PROVIDER_TIMEOUT_MS = 5_000;
export const PURE_P2P_STATS_STORAGE_KEY = '5chan-pure-p2p-stats';

export const getStatsProvider = (providerId: string): StatsProvider | undefined => STATS_PROVIDERS.find((provider) => provider.id === providerId);

export const getStatsProviderBoardsUrl = (provider: StatsProvider): string => {
  const apiBase = provider.apiUrl.endsWith('/') ? provider.apiUrl : `${provider.apiUrl}/`;
  return new URL('api/v1/5chan/boards', apiBase).href;
};
