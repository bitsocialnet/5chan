import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MD5_FILTER_SECTION_ID } from '../../../lib/utils/image-filter-utils';
import useImageFiltersStore from '../../../stores/use-image-filters-store';
import styles from './interface-settings.module.css';

// 4chan X's "Image MD5" filter list. Edits apply as they are typed, like 4chan X saving on change.
const Md5FilterSetting = () => {
  const { t } = useTranslation();
  const imageFilters = useImageFiltersStore((state) => state.imageFilters);
  const setImageFilters = useImageFiltersStore((state) => state.setImageFilters);
  const { hash, search } = useLocation();
  // The settings modal opens a section from ?section= or from a legacy #hash, so both scroll here.
  const isLinkedSection = new URLSearchParams(search).get('section') === MD5_FILTER_SECTION_ID || hash.slice(1) === MD5_FILTER_SECTION_ID;
  const settingRef = useRef<HTMLDivElement>(null);

  // The list is the last interface setting, so a link to it would otherwise open below the fold.
  useEffect(() => {
    if (isLinkedSection) {
      settingRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [isLinkedSection]);

  return (
    <div ref={settingRef} className={`${styles.setting} ${styles.md5Filter}`}>
      <label htmlFor='md5-filter-list' className={styles.md5FilterLabel}>
        {t('md5_filter')}:
      </label>
      <div className={styles.md5FilterTip}>{t('md5_filter_help')}</div>
      <textarea
        id='md5-filter-list'
        className={styles.md5FilterList}
        value={imageFilters}
        onChange={(e) => setImageFilters(e.target.value)}
        rows={8}
        wrap='off'
        spellCheck={false}
        autoCapitalize='off'
        autoComplete='off'
        autoCorrect='off'
      />
    </div>
  );
};

export default Md5FilterSetting;
