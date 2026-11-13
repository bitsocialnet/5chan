import { useMemo } from 'react';
import { useDirectories } from './use-directories';
import useAllFeedFilterStore from '../stores/use-all-feed-filter-store';
import { filterByBoardCategory, getBoardCategory } from '../lib/utils/board-category-utils';
import { getDirectoryCode } from '../lib/utils/route-utils';

/** The /all multiboard's board addresses: the directory boards the filter keeps, narrowed to a category when one is given. */
export const useFilteredDirectoryAddresses = (categorySlug?: string) => {
  const directories = useDirectories();
  const filter = useAllFeedFilterStore((state) => state.filter);

  const filteredAddresses = useMemo(() => {
    const categoryDirectories = filterByBoardCategory(directories, getBoardCategory(categorySlug), getDirectoryCode);
    if (filter === 'all') {
      return categoryDirectories.map((community) => community.address);
    }
    if (filter === 'nsfw') {
      return categoryDirectories.filter((community) => community.nsfw === true).map((community) => community.address);
    }
    // filter === 'sfw'
    return categoryDirectories.filter((community) => community.nsfw !== true).map((community) => community.address);
  }, [directories, filter, categorySlug]);

  return filteredAddresses;
};
