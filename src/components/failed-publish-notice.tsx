import styles from '../views/post/post.module.css';
import useIsMobile from '../hooks/use-is-mobile';

interface FailedPublishNoticeProps {
  isDeleting: boolean;
  onDelete: () => void;
}

const FailedPublishNotice = ({ isDeleting, onDelete }: FailedPublishNoticeProps) => {
  const isMobile = useIsMobile();

  return (
    <span className={styles.failedPublishNotice}>
      This post failed to publish, it's not visible to other users.{' '}
      {isMobile && (
        <>
          <br />
          <br />
        </>
      )}
      <span className={styles.failedDeletePostAction}>
        [
        <button type='button' className={styles.failedDeletePostButton} disabled={isDeleting} onClick={onDelete}>
          Delete Post
        </button>
        ]
      </span>
    </span>
  );
};

export default FailedPublishNotice;
