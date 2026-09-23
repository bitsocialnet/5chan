import type { Account } from '@bitsocial/bitsocial-react-hooks';
import { accountsStore as useAccountsStore } from '../lib/bitsocial-internals/stores';

// Select raw stored fields only. Calculated properties such as karma and
// notifications still require the protocol's useAccount hook.
export const useActiveAccountField = <T>(selector: (account: Account | undefined) => T): T =>
  useAccountsStore((state) => selector(state.accounts[state.activeAccountId || '']));
