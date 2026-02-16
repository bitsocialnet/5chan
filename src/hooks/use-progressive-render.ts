import { startTransition, useEffect, useState } from 'react';

interface UseProgressiveRenderOptions {
  batchSize?: number;
  intervalMs?: number;
  resetKey?: string;
  disabled?: boolean;
}

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_INTERVAL_MS = 100;

/**
 * Progressively reveals items in batches via startTransition to avoid blocking the UI
 * when mounting many heavy components (e.g. 500 reply components).
 * When disabled or once fully caught up, returns the full array immediately.
 */
const useProgressiveRender = <T>(items: T[], options: UseProgressiveRenderOptions = {}): T[] => {
  const { batchSize = DEFAULT_BATCH_SIZE, intervalMs = DEFAULT_INTERVAL_MS, resetKey, disabled = false } = options;

  const [progressState, setProgressState] = useState<{ key: string | undefined; visibleCount: number }>({
    key: resetKey,
    visibleCount: batchSize,
  });
  const isResetKeyChanged = progressState.key !== resetKey;
  const visibleCount = isResetKeyChanged ? batchSize : progressState.visibleCount;

  useEffect(() => {
    if (disabled || items.length <= batchSize) {
      return;
    }

    const current = visibleCount >= items.length ? items.length : visibleCount;
    if (current >= items.length) {
      return;
    }

    const next = Math.min(current + batchSize, items.length);
    const timer = window.setTimeout(() => {
      startTransition(() => {
        setProgressState({
          key: resetKey,
          visibleCount: next,
        });
      });
    }, intervalMs);

    return () => window.clearTimeout(timer);
  }, [items.length, visibleCount, batchSize, intervalMs, disabled, resetKey]);

  if (disabled || items.length <= batchSize) {
    return items;
  }

  if (visibleCount >= items.length) {
    return items;
  }

  return items.slice(0, visibleCount);
};

export default useProgressiveRender;
