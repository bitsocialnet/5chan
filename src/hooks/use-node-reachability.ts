import { useEffect, useState } from 'react';

export type NodeReachability = 'public' | 'private' | 'unknown';

// The node's AutoNAT verdict takes a few minutes after startup and changes with the network, so keep asking.
const POLL_INTERVAL_MS = 60_000;

/** Whether the desktop app's own node can be reached from the internet. Always 'unknown' outside the desktop app. */
export const useNodeReachability = (enabled: boolean): NodeReachability => {
  const [reachability, setReachability] = useState<NodeReachability>('unknown');

  useEffect(() => {
    const getNodeReachability = window.electronApi?.getNodeReachability;
    if (!enabled || !getNodeReachability) {
      return;
    }
    let isCancelled = false;
    const check = () =>
      getNodeReachability()
        .then((nextReachability) => {
          if (!isCancelled) setReachability(nextReachability);
        })
        .catch(() => {});
    check();
    const interval = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [enabled]);

  return enabled ? reachability : 'unknown';
};
