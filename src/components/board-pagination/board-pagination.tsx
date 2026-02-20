import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from './board-pagination.module.css';

export interface BoardPaginationProps {
  basePath: string;
  currentPage: number;
  totalPages: number;
}

const BoardPagination = ({ basePath, currentPage, totalPages }: BoardPaginationProps) => {
  const { t } = useTranslation();

  const pageHref = (page: number) => (page === 1 ? basePath : `${basePath}/${page}`);
  const prevHref = currentPage > 1 ? pageHref(currentPage - 1) : undefined;
  const nextHref = currentPage < totalPages ? pageHref(currentPage + 1) : undefined;

  if (totalPages <= 1) {
    return null;
  }

  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div className={styles.pagination}>
      {prevHref ? (
        <Link to={prevHref} className={styles.paginationButton} aria-label={t('prev')}>
          {t('prev')}
        </Link>
      ) : (
        <span className={`${styles.paginationButton} ${styles.disabled}`} aria-disabled>
          {t('prev')}
        </span>
      )}
      {pageNumbers.map((page) => {
        const href = pageHref(page);
        const isCurrent = page === currentPage;
        return isCurrent ? (
          <span key={page} className={`${styles.paginationButton} ${styles.pageButtonActive}`} aria-label={`Page ${page} (current)`} aria-current='page'>
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
        <span className={`${styles.paginationButton} ${styles.disabled}`} aria-disabled>
          {t('next')}
        </span>
      )}
    </div>
  );
};

export default BoardPagination;
