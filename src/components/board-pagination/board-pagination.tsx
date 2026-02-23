import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import StyleSelector from '../style-selector/style-selector';
import footerStyles from '../footer/footer.module.css';
import styles from './board-pagination.module.css';

export interface BoardPaginationProps {
  basePath: string;
  currentPage: number;
  totalPages: number;
  /** When true, renders compact footer-style row with [1] [2] ... [10] Next Catalog + Style select */
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
    const ellipsisThreshold = 7;
    const showEllipsis = totalPages > ellipsisThreshold;
    const visiblePages = showEllipsis ? [1, 2, currentPage, totalPages].filter((p, i, arr) => arr.indexOf(p) === i).sort((a, b) => a - b) : pageNumbers;

    return (
      <div className={footerStyles.footerRow}>
        <div className={footerStyles.footerLeft}>
          {visiblePages.map((page, idx) => {
            const isCurrent = page === currentPage;
            const prevPage = visiblePages[idx - 1];
            const showLeadingEllipsis = showEllipsis && prevPage !== undefined && page - prevPage > 1;
            return (
              <span key={page}>
                {showLeadingEllipsis && <span> ... </span>}
                {isCurrent ? (
                  <span className={styles.footerPageCurrent}>[{page}]</span>
                ) : (
                  <Link to={pageHref(page)} className={styles.footerPageLink}>
                    [{page}]
                  </Link>
                )}
              </span>
            );
          })}
          {nextHref && (
            <>
              {' '}
              <Link to={nextHref} className={styles.footerPageLink}>
                {t('next')}
              </Link>
            </>
          )}{' '}
          <Link to={catalogHref} className={styles.footerPageLink}>
            {t('catalog')}
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
        <Link to={prevHref} className={styles.paginationButton} aria-label={t('prev')}>
          {t('prev')}
        </Link>
      ) : (
        <span className={`${styles.paginationButton} ${styles.disabled}`} aria-disabled='true'>
          {t('prev')}
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
