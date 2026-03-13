import { useEffect } from 'react';
import { create } from 'zustand';
import { useCommunityStats } from '@bitsocialnet/bitsocial-react-hooks';

type CommunityStatsState = {
  communityStats: { [communityAddress: string]: any };
  setCommunityStats: (communityAddress: string, stats: any) => void;
};

export const useCommunitiesStatsStore = create<CommunityStatsState>((set) => ({
  communityStats: {},
  setCommunityStats: (communityAddress, stats) =>
    set((state) => ({
      communityStats: { ...state.communityStats, [communityAddress]: stats },
    })),
}));

export const CommunityStatsCollector = ({ communityAddress }: { communityAddress: string }) => {
  const stats = useCommunityStats({ communityAddress });
  const setCommunityStats = useCommunitiesStatsStore((state) => state.setCommunityStats);

  useEffect(() => {
    if (stats && stats.allPostCount !== undefined) {
      setCommunityStats(communityAddress, stats);
    }
  }, [stats, communityAddress, setCommunityStats]);

  return null;
};

/**
 * Back-compat exports for old naming.
 */
export const useSubplebbitsStatsStore = useCommunitiesStatsStore;
export const SubplebbitStatsCollector = CommunityStatsCollector;
