import { useEffect } from 'react';
import { useSubplebbitStats } from '@bitsocialhq/bitsocial-react-hooks';
import { create } from 'zustand';

type SubplebbitsStatsState = {
  subplebbitsStats: { [subplebbitAddress: string]: any };
  setSubplebbitStats: (subplebbitAddress: string, stats: any) => void;
};

export const useSubplebbitsStatsStore = create<SubplebbitsStatsState>((set) => ({
  subplebbitsStats: {},
  setSubplebbitStats: (subplebbitAddress: string, subplebbitStats: any) =>
    set((state) => ({
      subplebbitsStats: { ...state.subplebbitsStats, [subplebbitAddress]: subplebbitStats },
    })),
}));

/**
 * Component that fetches stats for a single subplebbit and stores them.
 * Render one of these for each subplebbit you want to track stats for.
 */
export const SubplebbitStatsCollector = ({ subplebbitAddress }: { subplebbitAddress: string }) => {
  const stats = useSubplebbitStats({ subplebbitAddress });
  const setSubplebbitStats = useSubplebbitsStatsStore((state) => state.setSubplebbitStats);

  useEffect(() => {
    // Only update store when we have actual stats (not just loading state)
    if (stats && stats.allPostCount !== undefined) {
      setSubplebbitStats(subplebbitAddress, stats);
    }
  }, [stats, subplebbitAddress, setSubplebbitStats]);

  return null; // This is a data-fetching component, renders nothing
};
