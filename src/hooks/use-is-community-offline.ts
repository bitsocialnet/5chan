import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import { Community } from '@bitsocialnet/bitsocial-react-hooks';
import { getFormattedTimeAgo } from '../lib/utils/time-utils';
import useCommunityOfflineStore from '../stores/use-community-offline-store';
import useCommunitiesLoadingStartTimestamps from '../stores/use-communities-loading-start-timestamps-store';

const useIsCommunityOffline = (community?: Community | undefined) => {
  const { t } = useTranslation();
  const { address, state, updatedAt, updatingState } = community || {};
  const { communityOfflineState, setCommunityOfflineState, initializeCommunityOfflineState } = useCommunityOfflineStore();
  const communitiesLoadingStartTimestamps = useCommunitiesLoadingStartTimestamps([address]);

  useEffect(() => {
    if (address && !communityOfflineState[address]) {
      initializeCommunityOfflineState(address);
    }
  }, [address, communityOfflineState, initializeCommunityOfflineState]);

  useEffect(() => {
    if (address) {
      setCommunityOfflineState(address, { state, updatedAt, updatingState });
    }
  }, [address, state, updatedAt, updatingState, setCommunityOfflineState]);

  const offlineState = communityOfflineState[address] || { initialLoad: true };
  const loadingStartTimestamp = communitiesLoadingStartTimestamps[0] || 0;
  const isLoading = offlineState.initialLoad && (!updatedAt || Date.now() / 1000 - updatedAt >= 120 * 120) && Date.now() / 1000 - loadingStartTimestamp < 30;
  const isOffline = !isLoading && ((updatedAt && updatedAt < Date.now() / 1000 - 120 * 120) || (!updatedAt && Date.now() / 1000 - loadingStartTimestamp >= 30));

  const isOnline = updatedAt && Date.now() / 1000 - updatedAt < 120 * 120;
  const offlineIconClass = isLoading ? 'yellowOfflineIcon' : isOffline ? 'redOfflineIcon' : '';

  const offlineTitle = isLoading
    ? 'downloading board...'
    : updatedAt
      ? isOffline && t('posts_last_synced_info', { time: getFormattedTimeAgo(updatedAt), interpolation: { escapeValue: false } })
      : t('subplebbit_offline_info');

  return { isOffline: !isOnline && isOffline, isOnlineStatusLoading: !isOnline && isLoading, offlineIconClass, offlineTitle };
};

export const useIsSubplebbitOffline = useIsCommunityOffline;

export default useIsCommunityOffline;
