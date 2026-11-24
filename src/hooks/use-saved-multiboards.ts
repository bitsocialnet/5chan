import { useMemo } from 'react';
import { BOARD_CATEGORY_QUERY_PARAM, getBoardCategory, getSavedMultiboards, type BoardCategory, type SavedMultiboard } from '../lib/utils/board-category-utils';
import { useActiveAccountField } from './use-active-account-field';

/** The active account's saved multiboards. */
export const useSavedMultiboards = (): SavedMultiboard[] => {
  const multiboards = useActiveAccountField((account) => account?.multiboards);
  return useMemo(() => getSavedMultiboards(multiboards), [multiboards]);
};

/** A category, custom board list, or saved multiboard by its ?c= slug. */
export const useBoardCategory = (slug: string | null | undefined): BoardCategory | undefined => {
  const savedMultiboards = useSavedMultiboards();
  return useMemo(() => getBoardCategory(slug, savedMultiboards), [slug, savedMultiboards]);
};

export const useBoardCategoryFromSearch = (search: string): BoardCategory | undefined => useBoardCategory(new URLSearchParams(search).get(BOARD_CATEGORY_QUERY_PARAM));
