import useCommunityOfflineStore from './use-community-offline-store';

type LegacySubplebbitOfflineState = {
  initialLoad: boolean;
  state?: string;
  updatedAt?: number;
  updatingState?: string;
};

type LegacySubplebbitOfflineStore = {
  subplebbitOfflineState: Record<string, LegacySubplebbitOfflineState>;
  setSubplebbitOfflineState: (address: string, state: Partial<LegacySubplebbitOfflineState>) => void;
  initializesubplebbitOfflineState: (address: string) => void;
};

type CommunityOfflineStoreState = {
  communityOfflineState: Record<string, LegacySubplebbitOfflineState>;
  setCommunityOfflineState: (address: string, state: Partial<LegacySubplebbitOfflineState>) => void;
  initializeCommunityOfflineState: (address: string) => void;
};

const toLegacyState = (state: CommunityOfflineStoreState) => ({
  subplebbitOfflineState: state.communityOfflineState,
  setSubplebbitOfflineState: state.setCommunityOfflineState,
  initializesubplebbitOfflineState: state.initializeCommunityOfflineState,
});

const useSubplebbitOfflineStore = (): LegacySubplebbitOfflineStore => {
  const state = useCommunityOfflineStore();
  return toLegacyState(state);
};

const useSubplebbitOfflineStoreWithState = useSubplebbitOfflineStore as typeof useSubplebbitOfflineStore & {
  getState: () => LegacySubplebbitOfflineStore;
};
useSubplebbitOfflineStoreWithState.getState = () => toLegacyState(useCommunityOfflineStore.getState());

export { useSubplebbitOfflineStore };
export default useSubplebbitOfflineStoreWithState;
