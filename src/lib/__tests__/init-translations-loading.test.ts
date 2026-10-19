import { afterEach, describe, expect, it, vi } from 'vitest';
import { INTERFACE_LANGUAGE_STORAGE_KEY } from '../constants';

// The real i18next and backend, with fetch recording which translation files load.
const initTranslations = async (language: string | null) => {
  if (language) {
    localStorage.setItem(INTERFACE_LANGUAGE_STORAGE_KEY, language);
  }
  const requested: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      requested.push(url);
      return new Response(JSON.stringify({ refresh: `refresh in ${url.split('/').at(-2)}` }), { headers: { 'content-type': 'application/json' } });
    }),
  );
  vi.resetModules();
  const { default: i18next } = await import('i18next');
  await import('../init-translations');
  await new Promise<void>((resolve) => (i18next.isInitialized ? resolve() : i18next.on('initialized', () => resolve())));
  await vi.waitFor(() => expect(i18next.hasLoadedNamespace('default')).toBe(true));
  return { i18next, requested };
};

describe('init-translations loading', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('has the English strings without requesting them', async () => {
    const { i18next, requested } = await initTranslations(null);

    expect(i18next.t('refresh')).toBe('Refresh');
    expect(requested).toEqual([]);
  });

  it('requests only the chosen language, with English bundled as its fallback', async () => {
    const { i18next, requested } = await initTranslations('de');

    expect(requested).toEqual(['./translations/de/default.json']);
    expect(i18next.t('refresh')).toBe('refresh in de');
    // A key the language lacks falls back to the bundled English.
    expect(i18next.t('thread_update_connection_error')).toBe('Connection Error');
  });
});
