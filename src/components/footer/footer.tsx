import { useTranslation } from 'react-i18next';
import { useLocation, useParams } from 'react-router-dom';
import BoardsBar from '../boardsbar';
import SiteLegalMeta from '../site-legal-meta';
import StyleSelector from '../style-selector/style-selector';
import { ReturnButton, CatalogButton, TopButton, UpdateButton, AutoButton, PostPageStats } from '../board-buttons/board-buttons';
import { isAllView, isSubscriptionsView, isModView } from '../../lib/utils/view-utils';
import useReplyModalStore from '../../stores/use-reply-modal-store';
import styles from './footer.module.css';

/* -----------------------------------------------------------------------------
 * PageFooterDesktop
 * Main page footer wrapper: hr, first row slot, BoardsBar, SiteLegalMeta.
 * -------------------------------------------------------------------------- */

export interface PageFooterDesktopProps {
  /** Mode-specific first row content (e.g. board pagination or thread controls) */
  firstRow: React.ReactNode;
}

export const PageFooterDesktop = ({ firstRow }: PageFooterDesktopProps) => (
  <footer className={styles.footer}>
    <hr />
    <div className={styles.firstRow}>{firstRow}</div>
    <div className={styles.boardsBarRow}>
      <BoardsBar />
    </div>
    <div className={styles.legalMeta}>
      <SiteLegalMeta order='license-first' />
    </div>
  </footer>
);

/* -----------------------------------------------------------------------------
 * CatalogFooterFirstRow
 * Catalog footer first row: Style selector on right only (no pagination).
 * -------------------------------------------------------------------------- */

export const CatalogFooterFirstRow = () => {
  const { t } = useTranslation();
  return (
    <div className={styles.footerRow}>
      <div className={styles.footerLeft} />
      <div className={styles.footerRight}>
        <span className={styles.styleLabel}>{t('style')}:</span>
        <StyleSelector />
      </div>
    </div>
  );
};

/* -----------------------------------------------------------------------------
 * ThreadFooterFirstRow
 * Thread page footer first row: Return, Catalog, Top, Update, Auto, Post a Reply, stats.
 * -------------------------------------------------------------------------- */

export interface ThreadFooterFirstRowProps {
  postCid: string;
  threadNumber: number | undefined;
  subplebbitAddress: string;
  /** Thread closed - disable Post a Reply */
  isThreadClosed?: boolean;
}

export const ThreadFooterFirstRow = ({ postCid, threadNumber, subplebbitAddress, isThreadClosed = false }: ThreadFooterFirstRowProps) => {
  const { t } = useTranslation();
  const location = useLocation();
  const params = useParams();
  const { openReplyModalEmpty } = useReplyModalStore();

  const isInAllView = isAllView(location.pathname);
  const isInSubscriptionsView = isSubscriptionsView(location.pathname, params);
  const isInModView = isModView(location.pathname);

  const handlePostReplyClick = () => {
    if (isThreadClosed) return;
    openReplyModalEmpty(postCid, threadNumber, subplebbitAddress);
  };

  return (
    <div className={styles.threadRow}>
      <div className={styles.threadLeft}>
        [<ReturnButton address={subplebbitAddress} isInAllView={isInAllView} isInSubscriptionsView={isInSubscriptionsView} isInModView={isInModView} />] [
        <CatalogButton address={subplebbitAddress} isInAllView={isInAllView} isInSubscriptionsView={isInSubscriptionsView} isInModView={isInModView} />] [
        <TopButton />] [<UpdateButton />] [<AutoButton />]
      </div>
      <div className={styles.threadCenter}>
        [
        <button type='button' className={styles.button} onClick={handlePostReplyClick} disabled={isThreadClosed} aria-label={t('post_a_reply')}>
          {t('post_a_reply')}
        </button>
        ]
      </div>
      <div className={styles.threadRight}>
        <PostPageStats />
      </div>
    </div>
  );
};
