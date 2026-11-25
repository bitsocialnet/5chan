import { type BoardCategory, filterByBoardCategory } from './board-category-utils';
import type { DirectoryCommunity } from './directory-list-utils';
import { getDirectoryCode } from './route-utils';

/**
 * The boards a category reads: its directory boards in the category's order, then the boards it names by
 * address. A board outside the directories has no title, so it takes its address as one, which is what the
 * post form's board select lists.
 */
export const getBoardCategoryCommunities = (directories: DirectoryCommunity[], category: BoardCategory | undefined): DirectoryCommunity[] => {
  if (!category) return directories;
  const directoryBoards = filterByBoardCategory(directories, category, getDirectoryCode);
  // An address may name a board listed by code too (its address, name or public key), so resolve, then keep each board once.
  const seenAddresses = new Set(directoryBoards.map((board) => board.address));
  const addressedBoards: DirectoryCommunity[] = [];
  for (const address of category.addresses ?? []) {
    const board = directories.find((directory) => directory.address === address || directory.name === address || directory.publicKey === address) ?? {
      address,
      title: address,
    };
    if (seenAddresses.has(board.address)) continue;
    seenAddresses.add(board.address);
    addressedBoards.push(board);
  }
  return [...directoryBoards, ...addressedBoards];
};
