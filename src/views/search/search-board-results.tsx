import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LoadingEllipsis from '../../components/loading-ellipsis/loading-ellipsis';
import type { BoardSearchMatch } from '../../hooks/use-board-search';
import { SEARCH_HIGHLIGHT_REGION_ATTRIBUTE } from '../../hooks/use-search-match-highlight';
import getShortAddress from '../../lib/get-short-address';
import directoryStyles from '../directory/directory.module.css';
import styles from './search.module.css';

/** How many boards show before "[N more]" reveals the rest, so a broad term does not push the posts down. */
const INITIAL_BOARD_ROWS = 5;
const TITLE_UNAVAILABLE_MARKER = '—';

/** The board column reads like the post label: the code for a directory board, the address otherwise. */
const getBoardLabel = (board: BoardSearchMatch): string => {
  if (board.boardPath !== board.address) return `/${board.boardPath}/`;
  return board.address.includes('.') ? board.address : getShortAddress(board.address) || board.address;
};

interface SearchBoardResultsProps {
  boards: BoardSearchMatch[];
  /** The indexer's list is still in flight, so the table may still grow. */
  loading: boolean;
}

/** The boards a search matched, listed above the posts the way a board directory lists its candidates. */
const SearchBoardResults = ({ boards, loading }: SearchBoardResultsProps) => {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? boards : boards.slice(0, INITIAL_BOARD_ROWS);
  const hiddenCount = boards.length - shown.length;

  if (boards.length === 0) return null;

  return (
    <div className={styles.boardResults} {...{ [SEARCH_HIGHLIGHT_REGION_ATTRIBUTE]: '' }}>
      <table className={directoryStyles.flashListing}>
        <thead>
          <tr>
            <th className={directoryStyles.postblock} scope='col'>
              No.
            </th>
            <th className={directoryStyles.postblock} scope='col'>
              {t('directory_board')}
            </th>
            <th className={directoryStyles.postblock} scope='col'>
              {t('search_board_title')}
            </th>
            <th className={directoryStyles.postblock} scope='col'>
              {t('search_board_address')}
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((board, index) => (
            <tr key={board.address} className={`${directoryStyles.dirRow} ${index % 2 === 0 ? directoryStyles.rowOdd : ''}`}>
              <td className={directoryStyles.numberCell}>{index + 1}</td>
              <td className={directoryStyles.boardCol}>
                <Link to={`/${board.boardPath}`} className={directoryStyles.viewLink}>
                  {getBoardLabel(board)}
                </Link>
              </td>
              <td className={styles.boardTitleCell}>
                {board.title ?? TITLE_UNAVAILABLE_MARKER}
                {board.nsfw && (
                  <span className={styles.boardNsfw} title='Not Safe For Work'>
                    {' '}
                    (NSFW)
                  </span>
                )}
              </td>
              <td className={styles.boardAddressCell}>{board.address}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(hiddenCount > 0 || loading) && (
        <div className={styles.boardResultsFooter}>
          {hiddenCount > 0 && (
            <span>
              [
              <button type='button' className={directoryStyles.actionButton} onClick={() => setShowAll(true)}>
                {t('search_more_boards', { count: hiddenCount })}
              </button>
              ]
            </span>
          )}
          {loading && <LoadingEllipsis string={t('loading')} />}
        </div>
      )}
    </div>
  );
};

export default SearchBoardResults;
