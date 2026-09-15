import { useMemo } from 'react';
import { useActiveAccountField } from './use-active-account-field';
import { SPECIAL_BOARDS } from '../lib/special-boards';
import { searchBoards, type BoardSearchResult } from '../lib/utils/board-search-utils';
import { getVendoredDirectoryLists } from '../lib/utils/directory-list-lookup-utils';
import { getBoardPath } from '../lib/utils/route-utils';
import { useDirectories } from './use-directories';
import { useIndexedBoards } from './use-indexed-boards';

export interface BoardSearchMatch extends BoardSearchResult {
  /** Where the row links: the directory code for the board serving one, otherwise the address. */
  boardPath: string;
}

export interface BoardSearchState {
  boards: BoardSearchMatch[];
  /** The indexer's list is still in flight, so more matches may still appear. */
  loading: boolean;
}

const EMPTY_SUBSCRIPTIONS: string[] = [];

/**
 * The board half of /search/. Matches come from 5chan's directories and their candidate boards,
 * the account's subscriptions and the indexer's list, merged and deduped, so a board is findable
 * whether 5chan lists it, the account follows it, or only the archive has crawled it.
 */
export const useBoardSearch = (query: string, selectedProviderId: string | null): BoardSearchState => {
  const directories = useDirectories();
  const subscriptions = useActiveAccountField((account) => account?.subscriptions ?? EMPTY_SUBSCRIPTIONS);
  const { boards: indexed, loading } = useIndexedBoards(selectedProviderId);

  const boards = useMemo(
    () =>
      searchBoards({ candidates: getVendoredDirectoryLists(), directories, indexed, specialBoards: SPECIAL_BOARDS, subscriptions }, query).map((board) => ({
        ...board,
        boardPath: getBoardPath(board.address, directories),
      })),
    [directories, indexed, query, subscriptions],
  );

  return { boards, loading };
};
