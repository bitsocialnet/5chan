import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useDirectories } from './use-directories';
import { getCommunityAddress, getBoardPath } from '../lib/utils/route-utils';

/**
 * Resolve a board identifier from URL params to canonical community address.
 * Supports both current route params (`boardIdentifier`) and legacy
 * compatibility params (`subplebbitAddress`).
 */
export const useResolvedCommunityAddress = (): string | undefined => {
  const params = useParams<{ boardIdentifier?: string; subplebbitAddress?: string }>();
  const directories = useDirectories();

  const boardIdentifier = params.boardIdentifier || params.subplebbitAddress;

  return useMemo(() => {
    if (!boardIdentifier) {
      return undefined;
    }

    return getCommunityAddress(boardIdentifier, directories);
  }, [boardIdentifier, directories]);
};

/**
 * Back-compat export kept for callers still importing the legacy hook name.
 */
export const useResolvedSubplebbitAddress = useResolvedCommunityAddress;

/**
 * Resolve a community address to board path (directory code or address) for links.
 */
export const useBoardPath = (communityAddress: string | undefined): string | undefined => {
  const directories = useDirectories();

  return useMemo(() => {
    if (!communityAddress) {
      return undefined;
    }

    return getBoardPath(communityAddress, directories);
  }, [communityAddress, directories]);
};
