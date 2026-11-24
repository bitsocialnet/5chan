import { setAccount, type Account } from '@bitsocial/bitsocial-react-hooks';
import { accountsStore } from '../bitsocial-internals/stores';
import { getSavedMultiboards, type SavedMultiboard } from './board-category-utils';

// Saving, changing and deleting the multiboards in the account (account.multiboards), so they travel with
// an account export like subscriptions do. Only the lazily loaded multiboard modal and settings section
// import these; reading the list (getSavedMultiboards) lives with the type in board-category-utils.

export const MAX_MULTIBOARD_NAME_LENGTH = 40;

// An id from the name for a readable link (#/all?c=@tech), unique among the account's multiboards.
const createMultiboardId = (name: string, takenIds: Set<string>): string => {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 24)
      .replace(/^-+|-+$/g, '') || 'multiboard';
  let id = base;
  for (let suffix = 2; takenIds.has(id); suffix += 1) id = `${base}-${suffix}`;
  return id;
};

// setAccount writes the whole account, so each change reads the account only after the previous change has
// been written: two quick toggles in the add-to list would otherwise overwrite each other.
let pendingUpdate: Promise<unknown> = Promise.resolve();

const updateSavedMultiboards = <T>(update: (multiboards: SavedMultiboard[]) => { multiboards: SavedMultiboard[]; result: T }): Promise<T> => {
  const run = async () => {
    const { accounts, activeAccountId } = accountsStore.getState();
    const account: Account | undefined = activeAccountId ? accounts?.[activeAccountId] : undefined;
    if (!account) throw new Error('No active account to save the multiboard in.');
    const { multiboards, result } = update(getSavedMultiboards(account.multiboards));
    await setAccount({ ...account, multiboards });
    return result;
  };
  const next = pendingUpdate.then(run, run);
  pendingUpdate = next.catch(() => undefined);
  return next;
};

/** Saves a new multiboard and returns its id. */
export const createMultiboard = (name: string, boards: string[]): Promise<string> =>
  updateSavedMultiboards((multiboards) => {
    const id = createMultiboardId(name, new Set(multiboards.map((multiboard) => multiboard.id)));
    return { multiboards: [...multiboards, { id, name, boards }], result: id };
  });

export const updateMultiboard = (id: string, changes: Partial<Pick<SavedMultiboard, 'name' | 'boards'>>): Promise<void> =>
  updateSavedMultiboards((multiboards) => ({
    multiboards: multiboards.map((multiboard) => (multiboard.id === id ? { ...multiboard, ...changes } : multiboard)),
    result: undefined,
  }));

export const deleteMultiboard = (id: string): Promise<void> =>
  updateSavedMultiboards((multiboards) => ({ multiboards: multiboards.filter((multiboard) => multiboard.id !== id), result: undefined }));

/** Adds a board to a saved multiboard, or removes it. */
export const setMultiboardHasBoard = (id: string, board: string, hasBoard: boolean): Promise<void> =>
  updateSavedMultiboards((multiboards) => ({
    multiboards: multiboards.map((multiboard) => {
      if (multiboard.id !== id) return multiboard;
      const boards = multiboard.boards.filter((entry) => entry !== board);
      return { ...multiboard, boards: hasBoard ? [...boards, board] : boards };
    }),
    result: undefined,
  }));
