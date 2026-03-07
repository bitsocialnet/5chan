import { useMemo } from 'react';
import { useAccountSubplebbits } from '@bitsocialhq/bitsocial-react-hooks';
import { DirectoryCommunity } from './use-directories';

export const useAccountSubplebbitsWithMetadata = (): DirectoryCommunity[] => {
  const { accountSubplebbits } = useAccountSubplebbits({ onlyIfCached: true });

  return useMemo(
    () =>
      Object.values(accountSubplebbits).map((sub) => ({
        address: (sub as any).address,
        title: (sub as any).title,
      })),
    [accountSubplebbits],
  );
};
