/** A promise with the fields React reads when it is passed to `use()`. */
type TrackedPromise<T> = Promise<T> & {
  reason?: unknown;
  status?: 'fulfilled' | 'rejected';
  value?: T;
};

/**
 * Caches a dynamic import and tags its promise with the state `use()` reads, so a component whose
 * chunk is already loaded renders in the same commit as the update that shows it. `lazy()` cannot
 * do that: it only resolves its payload the first time the component renders, and React schedules
 * that resolution as a separate task, so the component suspends once even when its chunk is cached.
 */
export const createTrackedImport = <T>(load: () => Promise<T>): (() => Promise<T>) => {
  let tracked: TrackedPromise<T> | undefined;

  return () => {
    if (!tracked) {
      const pending: TrackedPromise<T> = load();
      pending.then(
        (value) => {
          pending.status = 'fulfilled';
          pending.value = value;
        },
        (reason) => {
          pending.status = 'rejected';
          pending.reason = reason;
        },
      );
      tracked = pending;
    }

    return tracked;
  };
};
