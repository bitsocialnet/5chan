import type { MediaHostingRuntime, ProviderId } from './types';

interface ProviderDefinition {
  id: ProviderId;
  label: string;
  homepageUrl: string;
  /** Runtimes where automated upload is supported (non-web = no interactive fallback) */
  supportedRuntimes: readonly MediaHostingRuntime[];
}

/** All media hosting providers with metadata */
export const MEDIA_HOSTING_PROVIDERS: readonly ProviderDefinition[] = [
  {
    id: 'catbox',
    label: 'Catbox',
    homepageUrl: 'https://catbox.moe',
    supportedRuntimes: ['web', 'electron', 'android'],
  },
  {
    id: 'imgur',
    label: 'Imgur',
    homepageUrl: 'https://imgur.com',
    supportedRuntimes: ['electron', 'android'],
  },
] as const;
