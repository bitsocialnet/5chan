import { type ComponentType, lazy } from 'react';

// A module whose download failed stays failed. Browsers (WebKit and Chromium) fail every later import
// of it in the page without fetching it again, and WebKit can serve the failure again after a reload,
// seconds later, without fetching it either. So a failed import renders a reload
// (components/import-error-boundary), which first fetches the failed files with the cache bypassed: starting
// that fetch replaces WebKit's entry.

const importFailures = new WeakSet<object>();
const failedDownloads = new Set<string>();

const REFETCH_WAIT_MS = 3000;

/** Wraps a dynamic import so that its rejection counts as an import failure (see isImportFailure). */
export const markImportFailures =
  <T>(load: () => Promise<T>): (() => Promise<T>) =>
  () =>
    load().catch((error: unknown) => {
      if (typeof error === 'object' && error !== null) {
        importFailures.add(error);
      }
      throw error;
    });

/** lazy() for a dynamic import whose rejection counts as an import failure. */
export const lazyImport = <T extends ComponentType<any>>(load: () => Promise<{ default: T }>) => lazy(markImportFailures(load));

/** Whether `error` rejected an import wrapped by markImportFailures (a failed download, usually). */
export const isImportFailure = (error: unknown): boolean => typeof error === 'object' && error !== null && importFailures.has(error);

/**
 * Records the stylesheets and modules that fail to download, which reloadAfterImportFailure fetches
 * again. Vite's preload helper fetches each lazy chunk and its dependencies through a link it adds.
 */
export const recordFailedDownloads = () => {
  window.addEventListener(
    'error',
    (event) => {
      if (event.target instanceof HTMLLinkElement && event.target.href) {
        failedDownloads.add(event.target.href);
      }
    },
    true,
  );
};

/**
 * Reloads the page to retry failed imports, after fetching their files with the cache bypassed, but
 * no longer than a stalled connection allows. Those include index.html's board route preloads
 * (ROUTE_PRELOAD_SCRIPT in scripts/vite-app-preload.mjs), which can fail before the app records it.
 */
export const reloadAfterImportFailure = async () => {
  const routePreloads = [...document.querySelectorAll<HTMLLinkElement>('link[data-fivechan-route-preload]')].map((link) => link.href);
  const files = new Set([...failedDownloads, ...routePreloads]);
  await Promise.race([Promise.allSettled([...files].map((file) => fetch(file, { cache: 'reload' }))), new Promise((resolve) => setTimeout(resolve, REFETCH_WAIT_MS))]);
  window.location.reload();
};
