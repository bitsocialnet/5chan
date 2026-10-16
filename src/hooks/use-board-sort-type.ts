import { useMemo } from 'react';
import type { Community } from '@bitsocial/bitsocial-react-hooks';
import { communitiesStore as useCommunitiesStore } from '../lib/bitsocial-internals/stores';
import { BUMP_ORDER_SORT_TYPE, getBoardSortType, isBoardMissingSortType } from '../lib/utils/board-sort-utils';
import { getCommunityByAddress, useCommunityField } from './use-stable-community';

const NO_ADDRESSES: string[] = [];

/** The post sort a single board's feed requests; multiboard feeds pass no address and use bump order. */
export const useBoardSortType = (communityAddress: string | undefined): string => useCommunityField(communityAddress, getBoardSortType) ?? BUMP_ORDER_SORT_TYPE;

/** Boards of a multiboard feed that contribute nothing to it because they do not publish `sortType`. */
export const useBoardsMissingSortType = (communityAddresses: readonly string[], sortType: string): string[] => {
  // Joined so the selector returns a stable value while the set is unchanged.
  const missingAddressesKey = useCommunitiesStore((state) =>
    communityAddresses.filter((address) => isBoardMissingSortType(getCommunityByAddress(state.communities, address) as Community | undefined, sortType)).join('\n'),
  );
  return useMemo(() => (missingAddressesKey ? missingAddressesKey.split('\n') : NO_ADDRESSES), [missingAddressesKey]);
};
