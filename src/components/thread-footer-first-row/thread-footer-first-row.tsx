import { useTranslation } from 'react-i18next';
import { useLocation, useParams } from 'react-router-dom';
import { isAllView, isSubscriptionsView, isModView } from '../../lib/utils/view-utils';
import useReplyModalStore from '../../stores/use-reply-modal-store';
import { ReturnButton, CatalogButton, TopButton, UpdateButton, AutoButton, PostPageStats } from '../board-buttons/board-buttons';
import styles from './thread-footer-first-row.module.css';

export interface ThreadFooterFirstRowProps {
  postCid: string;
  threadNumber: number | undefined;
  subplebbitAddress: string;
  /** Thread closed - disable Post a Reply */
  isThreadClosed?: boolean;
}

const ThreadFooterFirstRow = ({ postCid, threadNumber, subplebbitAddress, isThreadClosed = false }: ThreadFooterFirstRowProps) => {
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
    <div className={styles.row}>
      <div className={styles.left}>
        [<ReturnButton address={subplebbitAddress} isInAllView={isInAllView} isInSubscriptionsView={isInSubscriptionsView} isInModView={isInModView} />] [
        <CatalogButton address={subplebbitAddress} isInAllView={isInAllView} isInSubscriptionsView={isInSubscriptionsView} isInModView={isInModView} />] [
        <TopButton />] [<UpdateButton />] [<AutoButton />]
      </div>
      <div className={styles.center}>
        [
        <button type='button' className='button' onClick={handlePostReplyClick} disabled={isThreadClosed} aria-label={t('post_a_reply')}>
          {t('post_a_reply')}
        </button>
        ]
      </div>
      <div className={styles.right}>
        <PostPageStats />
      </div>
    </div>
  );
};

export default ThreadFooterFirstRow;
