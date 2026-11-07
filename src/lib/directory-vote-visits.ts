const STORAGE_KEY = '5chan-directory-vote-visits';

// Keeps visits for this session when storage is blocked, as the votes themselves are kept in memory then.
let memoryVisits: Record<string, number> = {};

const getLocalStorage = (): Storage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

const readStoredVisits = (): Record<string, number> => {
  try {
    const value: unknown = JSON.parse(getLocalStorage()?.getItem(STORAGE_KEY) ?? '{}');
    if (!value || typeof value !== 'object') return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => Number.isFinite(entry[1])));
  } catch {
    return {};
  }
};

/**
 * When the user was last on each directory's board, its directory page, or a board they voted for
 * there (ms, by directory code). Read from storage on every call, so a refresh in one tab sees visits
 * made in another.
 */
export const getDirectoryVoteVisits = (): Record<string, number> => {
  const visits = readStoredVisits();
  for (const [code, at] of Object.entries(memoryVisits)) visits[code] = Math.max(visits[code] ?? 0, at);
  return visits;
};

/**
 * Kept out of the persisted votes store: 5chan does not sync stores across tabs, so writing that store
 * on every navigation would let a stale tab overwrite votes cast in another. Merging into what is
 * stored here can only lose a visit made in the same instant by another tab.
 */
export const recordDirectoryVoteVisits = (directoryCodes: readonly string[], at = Date.now()): void => {
  if (directoryCodes.length === 0) return;
  const visits = getDirectoryVoteVisits();
  for (const code of directoryCodes) visits[code] = Math.max(visits[code] ?? 0, at);
  memoryVisits = visits;
  try {
    getLocalStorage()?.setItem(STORAGE_KEY, JSON.stringify(visits));
  } catch {}
};

export const __resetDirectoryVoteVisitsForTests = () => {
  memoryVisits = {};
  try {
    getLocalStorage()?.removeItem(STORAGE_KEY);
  } catch {}
};
