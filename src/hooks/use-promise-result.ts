import { useCallback, useSyncExternalStore } from 'react';

const results = new WeakMap<Promise<unknown>, { value: unknown }>();

/**
 * What `promise` resolved to, or undefined while it is pending; the promise must not reject. Unlike
 * `use()`, a pending promise renders the caller's own loading state rather than a Suspense fallback:
 * React holds back content that replaces a fallback until 300 ms after the last fallback appeared,
 * so a box whose data was ready still waited.
 */
export const usePromiseResult = <T>(promise: Promise<T> | undefined): { value: T } | undefined => {
  const subscribe = useCallback(
    (onResult: () => void) => {
      let subscribed = true;
      void promise?.then((value) => {
        if (!results.has(promise)) results.set(promise, { value });
        if (subscribed) onResult();
      });
      return () => {
        subscribed = false;
      };
    },
    [promise],
  );
  const getResult = useCallback(() => (promise ? (results.get(promise) as { value: T } | undefined) : undefined), [promise]);

  return useSyncExternalStore(subscribe, getResult, getResult);
};
