import { useMemo } from 'react';
import { useAccountSubplebbits } from '@bitsocialnet/bitsocial-react-hooks';

export const useAccountSubplebbitAddresses = (): string[] => {
  const { accountSubplebbits } = useAccountSubplebbits({ onlyIfCached: true });

  return useMemo(() => Object.keys(accountSubplebbits), [accountSubplebbits]);
};
