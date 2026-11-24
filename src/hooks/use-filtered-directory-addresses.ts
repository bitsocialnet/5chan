import { useMemo } from 'react';
import { useDirectories } from './use-directories';
import { useBoardCategory } from './use-saved-multiboards';
import useAllFeedFilterStore from '../stores/use-all-feed-filter-store';
import { getBoardCategoryCommunities } from '../lib/utils/board-category-communities';

/**
 * The /all multiboard's board addresses: the directory boards the filter keeps, narrowed to a category, board
 * list or saved multiboard when one is given. A board outside the directories has no NSFW flag, so only the
 * NSFW-only filter leaves it out.
 */
export const useFilteredDirectoryAddresses = (categorySlug?: string) => {
  const directories = useDirectories();
  const filter = useAllFeedFilterStore((state) => state.filter);
  const category = useBoardCategory(categorySlug);

  const filteredAddresses = useMemo(() => {
    const categoryDirectories = getBoardCategoryCommunities(directories, category);
    if (filter === 'all') {
      return categoryDirectories.map((community) => community.address);
    }
    if (filter === 'nsfw') {
      return categoryDirectories.filter((community) => community.nsfw === true).map((community) => community.address);
    }
    // filter === 'sfw'
    return categoryDirectories.filter((community) => community.nsfw !== true).map((community) => community.address);
  }, [directories, filter, category]);

  return filteredAddresses;
};
