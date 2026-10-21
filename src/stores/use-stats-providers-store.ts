import { create } from 'zustand';
import { PURE_P2P_STATS_STORAGE_KEY } from '../lib/stats-providers';

interface StatsProvidersStore {
  /** Skips every stats provider and loads the home page's popular threads and stats over P2P. */
  usePureP2PStats: boolean;
  setUsePureP2PStats: (value: boolean) => void;
}

const useStatsProvidersStore = create<StatsProvidersStore>((set) => ({
  usePureP2PStats: localStorage.getItem(PURE_P2P_STATS_STORAGE_KEY) === 'true',
  setUsePureP2PStats: (value) => {
    if (value) {
      localStorage.setItem(PURE_P2P_STATS_STORAGE_KEY, 'true');
    } else {
      localStorage.removeItem(PURE_P2P_STATS_STORAGE_KEY);
    }
    set({ usePureP2PStats: value });
  },
}));

export default useStatsProvidersStore;
