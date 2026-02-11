import { useLocation } from 'react-router-dom';
import useDirectoryModalStore from '../../stores/use-directory-modal-store';
import styles from './directory-modal.module.css';

const DirectoryModal = () => {
  const { showModal, closeDirectoryModal } = useDirectoryModalStore();
  const location = useLocation();
  const isHomeView = location.pathname === '/';

  if (!showModal) {
    return null;
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      closeDirectoryModal();
    }
  };

  return (
    <div className={`${styles.backdrop} ${isHomeView ? styles.backdropHome : ''}`} onClick={handleBackdropClick}>
      <div className={styles.directoryDialog}>
        <div className={styles.hd}>
          <h2>Submit a Board to a Directory</h2>
          <button className={`${styles.closeButton} ${isHomeView ? styles.closeButtonHome : ''}`} onClick={closeDirectoryModal} title='Close' />
        </div>
        <div className={styles.bd}>
          <p className={styles.introMessage}>
            <strong>The board you clicked on doesn&apos;t exist yet, but it can be yours!</strong>
          </p>

          <div className={styles.section}>
            <h3>Creating Your Board</h3>
            <p>
              <strong>Anyone can create a board</strong> using the{' '}
              <a href='https://plebbit.github.io/docs/learn/clients/5chan/create-a-board' target='_blank' rel='noopener noreferrer'>
                Seedit GUI client
              </a>{' '}
              or{' '}
              <a href='https://github.com/bitsocialhq/bitsocial-cli' target='_blank' rel='noopener noreferrer'>
                plebbit-cli
              </a>
              . Users can access it anytime via the search bar, direct links, or by subscribing with the &quot;[Subscribe]&quot; button—
              <strong>no directory assignment or dev approval needed</strong>. Directory boards are simply featured in homepage categories (like &quot;Anime &
              Manga&quot;) and are handpicked by devs until DAO curation is implemented.
            </p>
          </div>

          <div className={styles.section}>
            <h3>Directory Submission</h3>
            <p>
              To submit your board, open a PR editing{' '}
              <a href='https://github.com/bitsocialhq/lists/blob/master/5chan-directories.json' target='_blank' rel='noopener noreferrer'>
                5chan-directories.json
              </a>{' '}
              with your board&apos;s title, address, and NSFW status. Requirements: 99% uptime (they&apos;re P2P nodes), active, well-moderated, and relevant to the
              category. Devs will review and approve/reject based on these criteria.
            </p>
          </div>

          <div className={styles.section}>
            <h3>Future: DAO Voting</h3>
            <p>
              Directory assignments will use gasless pubsub voting—communities vote, highest-voted board wins the slot. <strong>Voting pages = discovery:</strong> Each
              directory&apos;s voting page lists all competing boards (even low-voted ones), giving visibility without winning or dev approval. See{' '}
              <a href='https://github.com/plebbit/plebbit-js/issues/25' target='_blank' rel='noopener noreferrer'>
                design draft
              </a>
              .
            </p>
          </div>
        </div>
        <div className={styles.directoryFooter}>
          <button onClick={closeDirectoryModal}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default DirectoryModal;
