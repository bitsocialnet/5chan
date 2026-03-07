import useAccountsStore from '@bitsocialhq/bitsocial-react-hooks/dist/stores/accounts';
import { DirectoryCommunity } from './use-directories';

export const useAccountSubplebbitsWithMetadata = (): DirectoryCommunity[] => {
  const subplebbitsWithMetadata = useAccountsStore(
    (state) => {
      const activeAccountId = state.activeAccountId;
      const activeAccount = activeAccountId ? state.accounts[activeAccountId] : undefined;
      const accountSubplebbits = activeAccount?.subplebbits || {};
      return Object.entries(accountSubplebbits).map(([address, sub]) => ({
        address,
        title: (sub as any).title,
      }));
    },
    (prev, next) => {
      if (prev.length !== next.length) return false;
      return prev.every((item, idx) => item.address === next[idx].address && item.title === next[idx].title);
    },
  );

  return subplebbitsWithMetadata;
};
