import { useMemo } from 'react';
import type { Comment } from '@bitsocial/bitsocial-react-hooks';
import CatalogRow from '../../components/catalog-row';
import { SEARCH_HIGHLIGHT_REGION_ATTRIBUTE } from '../../hooks/use-search-match-highlight';
import useCatalogStyleStore from '../../stores/use-catalog-style-store';
import useWindowWidth from '../../hooks/use-window-width';

const getRows = (threads: Comment[], columnCount: number): Comment[][] => {
  const rows: Comment[][] = [];
  for (let index = 0; index < threads.length; index += columnCount) {
    rows.push(threads.slice(index, index + columnCount));
  }
  return rows;
};

/** Catalog view of the threads a search matched, laid out like the board catalog. */
const SearchCatalog = ({ threads }: { threads: Comment[] }) => {
  const imageSize = useCatalogStyleStore((state) => state.imageSize);
  const windowWidth = useWindowWidth();
  const columnWidth = imageSize === 'Large' ? 270 : 180;
  const columnCount = Math.max(1, Math.floor(windowWidth / columnWidth));
  const rows = useMemo(() => getRows(threads, columnCount), [threads, columnCount]);

  return (
    <div {...{ [SEARCH_HIGHLIGHT_REGION_ATTRIBUTE]: '' }}>
      {rows.map((row, index) => (
        <CatalogRow key={row.map((thread) => thread?.cid ?? '').join('\0') || `row-${index}`} index={index} row={row} />
      ))}
    </div>
  );
};

export default SearchCatalog;
