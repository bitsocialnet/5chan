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
  const listedAddresses = new Set(directoryBoards.map((board) => board.address));
  const addressedBoards = (category.addresses ?? [])
    .filter((address) => !listedAddresses.has(address))
    .map(
      (address) =>
        directories.find((directory) => directory.address === address || directory.name === address || directory.publicKey === address) ?? { address, title: address },
    );
  return [...directoryBoards, ...addressedBoards];
};
