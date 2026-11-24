import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { useSavedMultiboards } from '../../../hooks/use-saved-multiboards';
import { getBoardListEntryLabel, getSavedMultiboardSlug, getSearchWithBoardCategory, type SavedMultiboard } from '../../../lib/utils/board-category-utils';
import { deleteMultiboard } from '../../../lib/utils/saved-multiboards';
// The subscriptions section's list layout, so the two sections share one stylesheet.
import styles from './subscriptions-setting.module.css';

const MultiboardRow = ({ multiboard, onError }: { multiboard: SavedMultiboard; onError: (message: string | undefined) => void }) => {
  const { t } = useTranslation();
  const remove = () => {
    if (!window.confirm(t('delete_multiboard_confirm', { name: multiboard.name }))) return;
    onError(undefined);
    deleteMultiboard(multiboard.id).catch((error: unknown) => onError(t('multiboard_delete_failed', { error: error instanceof Error ? error.message : String(error) })));
  };

  return (
    <li className={styles.subscription}>
      <Link to={{ pathname: '/all', search: getSearchWithBoardCategory('', getSavedMultiboardSlug(multiboard.id)) }}>{multiboard.name}</Link> [
      {multiboard.boards.map((board) => getBoardListEntryLabel(board).replace(/^\/|\/$/g, '')).join(' / ')}]
      <span className={styles.subscriptionButton}>
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
        <ul className={styles.subscriptions}>
          {savedMultiboards.map((multiboard) => (
            <MultiboardRow key={multiboard.id} multiboard={multiboard} onError={setError} />
          ))}
        </ul>
      ) : (
        <div className={styles.notSubscribed}>
          <Trans i18nKey='no_saved_multiboards' components={{ 1: <Link to='/all' /> }} />
        </div>
      )}
      {error && <div className={`red ${styles.notSubscribed}`}>{error}</div>}
    </div>
  );
};

export default memo(MultiboardsSetting);
