import { Suspense, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { lazyImport } from '../../lib/import-failures';
import ImportErrorBoundary from '../import-error-boundary';
import styles from './catalog-filters.module.css';

// The filters table, its help and its color picker only show once the button is clicked, so they
// download then instead of with the board.
const FiltersModal = lazyImport(() => import('./filters-modal'));

const CatalogFilters = () => {
  const { t } = useTranslation();
  const [showModal, setShowModal] = useState(false);

  const closeModal = useCallback(() => {
    setShowModal(false);
  }, []);

  return (
    <>
      <button
        type='button'
        className={`${styles.filtersButton} button`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setShowModal(true);
          }
        }}
        onClick={() => setShowModal(true)}
      >
        {t('filters')}
      </button>
      {showModal && (
        <ImportErrorBoundary floating>
          <Suspense fallback={null}>
            <FiltersModal closeModal={closeModal} />
          </Suspense>
        </ImportErrorBoundary>
      )}
    </>
  );
};

export default CatalogFilters;
