import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MD5_FILTER_SECTION_ID } from '../../lib/utils/image-filter-utils';
import { getSettingsSectionPath } from '../../lib/utils/route-utils';
import useImageFiltersStore from '../../stores/use-image-filters-store';
import styles from './image-filter-notice.module.css';

// 4chan X's quick filter notice: it stays on its page until closed, counts every quick filter made
// while it is open, links to the filter list and undoes them all.
const ImageFilterNotice = () => {
  const { t } = useTranslation();
  const notice = useImageFiltersStore((state) => state.quickFilterNotice);
  const undoQuickFilters = useImageFiltersStore((state) => state.undoQuickFilters);
  const closeNotice = useImageFiltersStore((state) => state.closeQuickFilterNotice);
  const { pathname, search } = useLocation();
  const navigate = useNavigate();

  // Only on its own page, which keeps it off the settings modal; that page has post menus, so it takes /settings.
  if (!notice || notice.pathname !== pathname) {
    return null;
  }

  const showFilters = () => {
    closeNotice();
    navigate(getSettingsSectionPath(`${pathname.replace(/\/$/, '')}/settings`, MD5_FILTER_SECTION_ID, search));
  };

  return (
    <output className={styles.notice} aria-live='polite'>
      {notice.keys.length === 1 ? t('md5_filtered') : t('x_md5s_filtered', { count: notice.keys.length })} [
      <button type='button' className={styles.action} onClick={showFilters}>
        {t('show')}
      </button>
      ] [
      <button type='button' className={styles.action} onClick={undoQuickFilters}>
        {t('undo')}
      </button>
      ]
      <button type='button' className={styles.closeButton} title={t('close')} aria-label={t('close')} onClick={closeNotice} />
    </output>
  );
};

export default ImageFilterNotice;
