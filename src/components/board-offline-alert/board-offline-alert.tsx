import { useMemo } from 'react';
import useCommunitiesStore from '@bitsocialnet/bitsocial-react-hooks/dist/stores/communities';
import { normalizeBoardAddress, useDirectoryByAddress } from '../../hooks/use-directories';
import useIsCommunityOffline from '../../hooks/use-is-community-offline';
import { useResolvedCommunityAddress } from '../../hooks/use-resolved-community-address';

const BOARD_ALIAS_SUFFIXES = ['.bso', '.eth'] as const;

const getBoardAddressCandidates = (addresses: Array<string | undefined>) => {
  const uniqueCandidates = new Set<string>();

  const addCandidate = (candidate: string | undefined) => {
    if (candidate) {
      uniqueCandidates.add(candidate);
    }
  };

  addresses.forEach((address) => {
    if (!address) {
      return;
    }

    addCandidate(address);

    const normalizedAddress = normalizeBoardAddress(address);
    addCandidate(normalizedAddress);
    BOARD_ALIAS_SUFFIXES.forEach((suffix) => addCandidate(`${normalizedAddress}${suffix}`));
  });

  return Array.from(uniqueCandidates);
};

interface BoardOfflineAlertProps {
  className: string;
  hidden?: boolean;
  communityAddress?: string;
}

const BoardOfflineAlert = ({ className, hidden = false, communityAddress }: BoardOfflineAlertProps) => {
  const resolvedCommunityAddress = useResolvedCommunityAddress();
  const directoryEntry = useDirectoryByAddress(resolvedCommunityAddress || communityAddress);
  const addressCandidates = useMemo(
    () => getBoardAddressCandidates([resolvedCommunityAddress, directoryEntry?.address, communityAddress]),
    [directoryEntry?.address, resolvedCommunityAddress, communityAddress],
  );

  // Probe common aliases first so loading/offline state stays consistent across route and post payload address formats.
  const community = useCommunitiesStore((state) => {
    for (const candidate of addressCandidates) {
      const matchedCommunity = state.communities[candidate];
      if (matchedCommunity) {
        return matchedCommunity;
      }
    }

    return undefined;
  });
  const { isOffline, isOnlineStatusLoading, offlineTitle } = useIsCommunityOffline(community);

  if (hidden || (!isOffline && !isOnlineStatusLoading)) {
    return null;
  }

  return <div className={className}>{offlineTitle}</div>;
};

export default BoardOfflineAlert;
