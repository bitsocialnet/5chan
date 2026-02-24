import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import StyleSelector from '../style-selector/style-selector';
import footerStyles from '../footer/footer.module.css';
import styles from './board-pagination.module.css';

export interface BoardPaginationProps {
  basePath: string;
  currentPage: number;
  totalPages: number;
  /** When true, renders pagelist: [All] [1] [2] ... [10] Catalog Archive + Style select */
  footerStyle?: boolean;
}

const BoardPagination = ({ basePath, currentPage, totalPages, footerStyle = false }: BoardPaginationProps) => {
  const { t } = useTranslation();

  const pageHref = (page: number) => (page === 1 ? basePath : `${basePath}/${page}`);
  const prevHref = currentPage > 1 ? pageHref(currentPage - 1) : undefined;
  const nextHref = currentPage < totalPages ? pageHref(currentPage + 1) : undefined;
  const catalogHref = `${basePath}/catalog`;

  if (totalPages <= 1 && !footerStyle) {
    return null;
  }

  if (footerStyle) {
    const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);
    const archiveHref = `${basePath}/archive`;

    return (
      <div className={footerStyles.footerRow}>
        <div className={styles.pagelist}>
          {currentPage > 1 && (
            <Link to={pageHref(currentPage - 1)} className={styles.footerNavPlain}>
              {t('previous')}
            </Link>
          )}
          <Link to={basePath} className={styles.footerPageLink}>
            [{t('all')}]
          </Link>
          {pageNumbers.map((page) =>
            page === currentPage ? (
              <span key={page} className={styles.footerPageCurrent}>
                [{page}]
              </span>
            ) : (
              <Link key={page} to={pageHref(page)} className={styles.footerPageLink}>
                [{page}]
              </Link>
            ),
          )}
          {currentPage < totalPages ? (
            <Link to={pageHref(currentPage + 1)} className={styles.footerNavPlain}>
              {t('next')}
            </Link>
          ) : (
            <span className={styles.footerNavPlainDisabled}>{t('next')}</span>
          )}
          <Link to={catalogHref} className={styles.footerPageLink}>
            {t('catalog')}
          </Link>
          <Link to={archiveHref} className={styles.footerPageLink}>
            {t('archive')}
          </Link>
        </div>
        <div className={footerStyles.footerRight}>
          <span className={footerStyles.styleLabel}>{t('style')}:</span>
          <StyleSelector />
        </div>
      </div>
    );
  }

  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div className={styles.pagination}>
      {prevHref ? (
        <Link to={prevHref} className={styles.paginationButton} aria-label={t('previous')}>
          {t('previous')}
        </Link>
      ) : (
        <span className={`${styles.paginationButton} ${styles.disabled}`} aria-disabled='true'>
          {t('previous')}
        </span>
      )}
      {pageNumbers.map((page) => {
        const href = pageHref(page);
        const isCurrent = page === currentPage;
        return isCurrent ? (
          <span key={page} className={`${styles.paginationButton} ${styles.pageButtonActive}`} aria-label={t('pagination.pageCurrent', { page })} aria-current='page'>
            {page}
          </span>
        ) : (
          <Link key={page} to={href} className={styles.paginationButton} aria-label={`Go to page ${page}`}>
            {page}
          </Link>
        );
      })}
      {nextHref ? (
        <Link to={nextHref} className={styles.paginationButton} aria-label={t('next')}>
          {t('next')}
        </Link>
      ) : (
        <span className={`${styles.paginationButton} ${styles.disabled}`} aria-disabled='true'>
          {t('next')}
        </span>
      )}
    </div>
  );
};

export default BoardPagination;
