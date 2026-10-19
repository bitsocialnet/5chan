import type { ReactPromise } from 'react';
import { markImportFailures } from './import-failures';

/** A promise with the fields React reads when it is passed to `use()`. */
type TrackedPromise<T> = Promise<T> & ReactPromise<T>;

/**
 * Caches a dynamic import and tags its promise with the state `use()` reads, so a component whose
 * chunk is already loaded renders in the same commit as the update that shows it. `lazy()` cannot
 * do that: it only resolves its payload the first time the component renders, and React schedules
 * that resolution as a separate task, so the component suspends once even when its chunk is cached.
 *
 * A failed import stays failed, and counts as an import failure (see lib/import-failures).
 */
export const createTrackedImport = <T>(load: () => Promise<T>): (() => TrackedPromise<T>) => {
  let tracked: TrackedPromise<T> | undefined;

  return () => {
    if (!tracked) {
      const pending: TrackedPromise<T> = markImportFailures(load)();
      pending.then(
        (value) => {
          Object.assign(pending, { status: 'fulfilled', value });
        },
        (reason) => {
          Object.assign(pending, { status: 'rejected', reason });
        },
      );
      tracked = pending;
    }

    return tracked;
  };
};
