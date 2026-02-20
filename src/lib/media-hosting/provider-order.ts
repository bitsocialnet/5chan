import type { MediaHostingRuntime, ProviderId, UploadMode } from './types';
import { MEDIA_HOSTING_PROVIDERS } from './providers';

/** Returns [preferredProvider] for preferred mode */
export function getPreferredOrder(preferredProvider: ProviderId): ProviderId[] {
  return [preferredProvider];
}

/** Fisher-Yates shuffle. Returns a new shuffled copy. */
export function getRandomOrder(providers: readonly ProviderId[], rng: () => number = Math.random): ProviderId[] {
  const result = [...providers];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Filter providers to those supported on the given runtime */
function getSupportedProviders(runtime: MediaHostingRuntime): ProviderId[] {
  return MEDIA_HOSTING_PROVIDERS.filter((p) => p.supportedRuntimes.includes(runtime)).map((p) => p.id);
}

/** Get ordered provider list for an upload attempt */
export function getProviderOrder(options: { mode: UploadMode; preferredProvider: ProviderId; runtime: MediaHostingRuntime }): ProviderId[] {
  const { mode, preferredProvider, runtime } = options;
  const supported = getSupportedProviders(runtime);

  if (mode === 'none') return [];
  if (mode === 'preferred') {
    return supported.includes(preferredProvider) ? [preferredProvider] : [];
  }
  if (mode === 'random') {
    return getRandomOrder(supported);
  }
  return [];
}
