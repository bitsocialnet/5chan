import { useMemo } from 'react';
import useSubplebbitsStore from '@bitsocialhq/bitsocial-react-hooks/dist/stores/subplebbits';
import { normalizeBoardAddress, useDirectoryByAddress } from '../../hooks/use-directories';
import useIsSubplebbitOffline from '../../hooks/use-is-subplebbit-offline';
import { useResolvedSubplebbitAddress } from '../../hooks/use-resolved-subplebbit-address';

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
  subplebbitAddress?: string;
}

const BoardOfflineAlert = ({ className, hidden = false, subplebbitAddress }: BoardOfflineAlertProps) => {
  const resolvedSubplebbitAddress = useResolvedSubplebbitAddress();
  const directoryEntry = useDirectoryByAddress(resolvedSubplebbitAddress || subplebbitAddress);
  const addressCandidates = useMemo(
    () => getBoardAddressCandidates([resolvedSubplebbitAddress, directoryEntry?.address, subplebbitAddress]),
    [directoryEntry?.address, resolvedSubplebbitAddress, subplebbitAddress],
  );

  // Probe common aliases first so loading/offline state stays consistent across route and post payload address formats.
  const subplebbit = useSubplebbitsStore((state) => {
    for (const candidate of addressCandidates) {
      const matchedSubplebbit = state.subplebbits[candidate];
      if (matchedSubplebbit) {
        return matchedSubplebbit;
      }
    }

    return undefined;
  });
  const { isOffline, isOnlineStatusLoading, offlineTitle } = useIsSubplebbitOffline(subplebbit);

  if (hidden || (!isOffline && !isOnlineStatusLoading)) {
    return null;
  }

  return <div className={className}>{offlineTitle}</div>;
};

export default BoardOfflineAlert;
