import { useMemo } from 'react';
import { BOARD_CATEGORY_QUERY_PARAM, getBoardCategory, getSavedMultiboards, type BoardCategory, type SavedMultiboard } from '../lib/utils/board-category-utils';
import { useActiveAccountField } from './use-active-account-field';

const NO_MULTIBOARDS: SavedMultiboard[] = [];

// Undefined until the active account has loaded, so a saved multiboard's link is not taken for a missing one.
const useLoadedSavedMultiboards = (): SavedMultiboard[] | undefined => {
  const multiboards = useActiveAccountField((account) => (account ? (account.multiboards ?? null) : undefined));
  return useMemo(() => (multiboards === undefined ? undefined : getSavedMultiboards(multiboards)), [multiboards]);
};

/** The active account's saved multiboards, none while the account loads. */
export const useSavedMultiboards = (): SavedMultiboard[] => useLoadedSavedMultiboards() ?? NO_MULTIBOARDS;

/** A category, custom board list, or saved multiboard by its ?c= slug. */
export const useBoardCategory = (slug: string | null | undefined): BoardCategory | undefined => {
  const savedMultiboards = useLoadedSavedMultiboards();
  return useMemo(() => getBoardCategory(slug, savedMultiboards), [slug, savedMultiboards]);
};

export const useBoardCategoryFromSearch = (search: string): BoardCategory | undefined => useBoardCategory(new URLSearchParams(search).get(BOARD_CATEGORY_QUERY_PARAM));
