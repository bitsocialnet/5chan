import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ImportFailures = typeof import('../import-failures');

// A fresh module per test, so failures recorded in one test do not leak into the next.
const importModule = async (): Promise<ImportFailures> => {
  vi.resetModules();
  return import('../import-failures');
};

const addLink = (href: string, routePreload = false) => {
  const link = document.createElement('link');
  link.rel = 'modulepreload';
  link.href = href;
  if (routePreload) {
    link.setAttribute('data-fivechan-route-preload', '');
  }
  document.head.appendChild(link);
  return link;
};

describe('import failures', () => {
  it('counts only the rejections of marked imports', async () => {
    const { isImportFailure, markImportFailures } = await importModule();
    const error = new TypeError('Importing a module script failed.');

    await expect(markImportFailures(() => Promise.reject(error))()).rejects.toBe(error);

    expect(isImportFailure(error)).toBe(true);
    expect(isImportFailure(new TypeError('Importing a module script failed.'))).toBe(false);
    expect(isImportFailure('failed')).toBe(false);
  });

  it('counts failed downloads, not errors a module throws while evaluating', async () => {
    const { isImportFailure, markImportFailures } = await importModule();
    const rejectWith = async (error: Error) => {
      await markImportFailures(() => Promise.reject(error))().catch(() => {});
      return isImportFailure(error);
    };

    // WebKit, Chromium, Firefox, and Vite's preload helper for a stylesheet.
    expect(await rejectWith(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(await rejectWith(new TypeError('Failed to fetch dynamically imported module: https://5chan.app/assets/faq.js'))).toBe(true);
    expect(await rejectWith(new TypeError('error loading dynamically imported module: https://5chan.app/assets/faq.js'))).toBe(true);
    expect(await rejectWith(new Error('Unable to preload CSS for https://5chan.app/assets/faq.css'))).toBe(true);
    expect(await rejectWith(new Error('wrapped', { cause: new TypeError('Importing a module script failed.') }))).toBe(true);
    expect(await rejectWith(new ReferenceError('board is not defined'))).toBe(false);
    expect(await rejectWith(new TypeError("Cannot read properties of undefined (reading 'title')"))).toBe(false);
  });

  describe('reloadAfterImportFailure', () => {
    const originalLocation = window.location;
    let calls: string[];
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      calls = [];
      Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, reload: vi.fn(() => calls.push('reload')) } });
      fetchMock = vi.fn(async (file: string, init?: RequestInit) => {
        calls.push(`fetch ${file} ${init?.cache}`);
        return new Response();
      });
      vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      document.head.querySelectorAll('link').forEach((link) => link.remove());
      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    });

    it('fetches the failed downloads and the route preloads with the cache bypassed, then reloads', async () => {
      const { recordFailedDownloads, reloadAfterImportFailure } = await importModule();
      recordFailedDownloads();
      const failed = addLink('/assets/faq.js');
      failed.dispatchEvent(new Event('error'));
      addLink('/assets/home.js');
      const routePreload = addLink('/assets/board-routes.js', true);

      await reloadAfterImportFailure();

      expect(calls).toEqual([`fetch ${failed.href} reload`, `fetch ${routePreload.href} reload`, 'reload']);
    });

    it('reloads after 3 s when a fetch stalls', async () => {
      const { recordFailedDownloads, reloadAfterImportFailure } = await importModule();
      recordFailedDownloads();
      addLink('/assets/faq.js').dispatchEvent(new Event('error'));
      fetchMock.mockImplementation(() => new Promise(() => {}));
      vi.useFakeTimers();

      void reloadAfterImportFailure();
      await vi.advanceTimersByTimeAsync(2999);
      expect(calls).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      expect(calls).toEqual(['reload']);
    });
  });
});
