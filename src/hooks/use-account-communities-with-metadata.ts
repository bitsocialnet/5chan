import { useMemo } from 'react';
import { useAccountCommunities } from '@bitsocialnet/bitsocial-react-hooks';
import type { DirectoryCommunity } from './use-directories';

export const useAccountCommunitiesWithMetadata = (): DirectoryCommunity[] => {
  const { accountCommunities } = useAccountCommunities({ onlyIfCached: true });

  return useMemo(
    () =>
      Object.values(accountCommunities).map((community) => ({
        address: (community as any).address,
        title: (community as any).title,
      })),
    [accountCommunities],
  );
};
