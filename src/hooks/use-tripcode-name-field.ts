import { useCallback } from 'react';
import { setAccount, type useAccount } from '@bitsocial/bitsocial-react-hooks';
import useTripcodeStore from '../stores/use-tripcode-store';
import { parseTripcodeInput, type TripcodeSecret } from '../lib/utils/tripcode-utils';

/**
 * The name field with 4chan's tripcode syntax. The field shows the name and the tripcode part as typed,
 * as 4chan's does, but only the name, trimmed, is saved to the account's author: the account attaches its
 * author to every vote and edit it publishes, so the password is kept in the tripcode store instead.
 */
const useTripcodeNameField = (account: ReturnType<typeof useAccount>) => {
  const accountId = account?.id;
  const tripcodeInput = useTripcodeStore((state) => (accountId ? state.inputs[accountId] : undefined));
  // A name saved before 5chan read tripcodes can still hold one.
  const savedName = parseTripcodeInput(account?.author?.displayName);
  const nameFieldValue = `${savedName.name}${tripcodeInput ?? savedName.tripcodeInput ?? ''}` || undefined;

  /** Saves a typed name field value and returns the name to publish. */
  const saveNameField = useCallback(
    (value: string): string | undefined => {
      const { name, tripcodeInput: nextTripcodeInput } = parseTripcodeInput(value);
      const displayName = name || undefined;
      if (account) {
        setAccount({ ...account, author: { ...account.author, displayName } });
        if (account.id) useTripcodeStore.getState().setTripcodeInput(account.id, nextTripcodeInput);
      }
      return displayName;
    },
    [account],
  );

  /** The name and tripcode password a submitted name field value publishes with. */
  const readNameField = useCallback(
    (value: string | undefined): { displayName: string | undefined; tripcodeSecret: TripcodeSecret | undefined } => {
      const { name, secret } = parseTripcodeInput(value);
      // Moves a password saved in the account's name before tripcodes into the tripcode store.
      if (account?.author?.displayName?.includes('#')) saveNameField(value ?? '');
      return { displayName: name || undefined, tripcodeSecret: secret };
    },
    [account, saveNameField],
  );

  return { nameFieldValue, saveNameField, readNameField };
};

export default useTripcodeNameField;
