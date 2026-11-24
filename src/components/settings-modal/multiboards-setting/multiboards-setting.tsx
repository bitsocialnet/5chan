import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSavedMultiboards } from '../../../hooks/use-saved-multiboards';
import { getSavedMultiboardSlug, getSearchWithBoardCategory, type SavedMultiboard } from '../../../lib/utils/board-category-utils';
import { deleteMultiboard } from '../../../lib/utils/saved-multiboards';
import styles from './multiboards-setting.module.css';

const MultiboardRow = ({ multiboard, onError }: { multiboard: SavedMultiboard; onError: (message: string) => void }) => {
  const { t } = useTranslation();
  const remove = () => {
    if (!window.confirm(`Delete the multiboard "${multiboard.name}"?`)) return;
    deleteMultiboard(multiboard.id).catch((error: unknown) => onError(`Could not delete the multiboard: ${error instanceof Error ? error.message : String(error)}`));
  };

  return (
    <li className={styles.multiboard}>
      <Link to={{ pathname: '/all', search: getSearchWithBoardCategory('', getSavedMultiboardSlug(multiboard.id)) }}>{multiboard.name}</Link> ({multiboard.boards.length}{' '}
      {multiboard.boards.length === 1 ? 'board' : 'boards'})
      <span className={styles.action}>
        [
        <button type='button' className={styles.button} onClick={remove}>
          {t('delete')}
        </button>
        ]
      </span>
    </li>
  );
};

// Saved multiboards are made and edited on /all (its category menu, and [Edit] under a multiboard's title) and
// from [Add to Multiboard] on a board; this section lists them and deletes them.
const MultiboardsSetting = () => {
  const savedMultiboards = useSavedMultiboards();
  const [error, setError] = useState<string>();

  return (
    <div className={styles.setting}>
      {savedMultiboards.length > 0 ? (
        <ul className={styles.multiboards}>
          {savedMultiboards.map((multiboard) => (
            <MultiboardRow key={multiboard.id} multiboard={multiboard} onError={setError} />
          ))}
        </ul>
      ) : (
        <div className={styles.empty}>No saved multiboards. Make one with Custom… in the category menu on /all, or with [Add to Multiboard] on a board.</div>
      )}
      {error && <div className={`red ${styles.empty}`}>{error}</div>}
    </div>
  );
};

export default memo(MultiboardsSetting);
