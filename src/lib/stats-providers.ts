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

export const getStatsProvider = (providerId: string): StatsProvider | undefined => STATS_PROVIDERS.find((provider) => provider.id === providerId);
