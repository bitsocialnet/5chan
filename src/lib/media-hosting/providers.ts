import { FORGE_IMAGES_API_ORIGIN, FORGE_IMAGES_MEDIA_ORIGIN } from '../forge-images-config';
import type { MediaHostingRuntime, ProviderId } from './types';

interface ProviderDefinition {
  id: ProviderId;
  label: string;
  homepageUrl: string;
  /** Image URLs used to detect whether this provider is reachable from the user's network. */
  availabilityProbeUrls: readonly string[];
  /** Runtimes where automated upload is supported (non-web = no interactive fallback) */
  supportedRuntimes: readonly MediaHostingRuntime[];
}

/** All media hosting providers with metadata. Array order is the settings display order. */
export const MEDIA_HOSTING_PROVIDERS: readonly ProviderDefinition[] = [
  {
    id: 'forge',
    label: 'Forge Images',
    // The media host has no landing page, so link the Forge Images site.
    homepageUrl: 'https://images.bitsocialforge.com',
    // Both serve the same frozen 1x1 PNG: the pinned blob proves the media serve path,
    // health.png proves the upload API is healthy (it answers a non-image 503 otherwise).
    availabilityProbeUrls: [`${FORGE_IMAGES_MEDIA_ORIGIN}/2aa4fa20701cdd6d8d56046069001186b5267e3ee7d0ef618ad2f4a683723e11.png`, `${FORGE_IMAGES_API_ORIGIN}/health.png`],
    // A direct upload everywhere. Electron gets its Turnstile token from a main-process
    // window (electron/forge-turnstile.js); Android uploads from the WebView, not the plugin.
    supportedRuntimes: ['web', 'electron', 'android'],
  },
  {
    id: 'catbox',
    label: 'Catbox',
    homepageUrl: 'https://catbox.moe',
    availabilityProbeUrls: ['https://catbox.moe/pictures/logo.png', 'https://files.catbox.moe/8ten4y.png'],
    // Not web: catbox's API sends no CORS headers, so a browser fetch always fails.
    supportedRuntimes: ['electron', 'android'],
  },
  {
    id: 'imgur',
    label: 'Imgur',
    homepageUrl: 'https://imgur.com',
    availabilityProbeUrls: ['https://s.imgur.com/images/favicon-32x32.png', 'https://i.imgur.com/YpB7qfa.jpg'],
    supportedRuntimes: ['electron', 'android'],
  },
  {
    id: 'imgbb',
    label: 'ImgBB',
    homepageUrl: 'https://imgbb.com',
    availabilityProbeUrls: ['https://simgbb.com/images/logo.png', 'https://i.ibb.co/7Jsq00V5/spoiler.png'],
    supportedRuntimes: ['electron', 'android'],
  },
] as const;

/** Providers with automated upload support on the given runtime, in settings display order. */
export function getRuntimeProviders(runtime: MediaHostingRuntime): readonly ProviderDefinition[] {
  return MEDIA_HOSTING_PROVIDERS.filter((provider) => provider.supportedRuntimes.includes(runtime));
}
