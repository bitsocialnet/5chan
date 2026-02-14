import { useEffect, useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAccount } from '@plebbit/plebbit-react-hooks';
import useTopbarEditModalStore from '../../stores/use-topbar-edit-modal-store';
import useTopbarVisibilityStore from '../../stores/use-topbar-visibility-store';
import { getAllBoardCodes } from '../../constants/board-codes';
import styles from './topbar-edit-modal.module.css';

const TopbarEditModal = () => {
  const { showModal, closeTopbarEditModal } = useTopbarEditModalStore();
  const { visibleDirectories, showSubscriptionsInTopbar, setDirectoryVisibility, setShowSubscriptionsInTopbar } = useTopbarVisibilityStore();
  const account = useAccount();
  const subscriptions = useMemo(() => account?.subscriptions || [], [account?.subscriptions]);
  const location = useLocation();

  // Convert visible directories set to space-separated string for input
  const directoriesToString = (dirs: Set<string>): string => {
    return Array.from(dirs).sort().join(' ');
  };

  // Convert space-separated string to set of directory codes
  const stringToDirectories = (str: string): Set<string> => {
    const codes = str
      .trim()
      .split(/\s+/)
      .filter((code) => code.length > 0)
      .map((code) => code.toLowerCase());
    return new Set(codes);
  };

  // Memoize board codes to avoid recalculating
  const allBoardCodes = useMemo(() => getAllBoardCodes(), []);

  // Check if all directories are visible (default state)
  const allDirectoriesVisible = useMemo(() => allBoardCodes.every((code) => visibleDirectories.has(code)), [allBoardCodes, visibleDirectories]);

  // Local state for text input (will be saved on Save click)
  // Empty string means all directories visible (default), otherwise show only the specified codes
  const [localDirectoryInput, setLocalDirectoryInput] = useState<string>(allDirectoriesVisible ? '' : directoriesToString(visibleDirectories));
  const [showSubscriptions, setShowSubscriptions] = useState<boolean>(showSubscriptionsInTopbar);

  // Sync local state when modal opens or store changes
  useEffect(() => {
    if (showModal) {
      const allVisible = allBoardCodes.every((code) => visibleDirectories.has(code));
      setLocalDirectoryInput(allVisible ? '' : directoriesToString(visibleDirectories));
      setShowSubscriptions(showSubscriptionsInTopbar);
    }
  }, [showModal, visibleDirectories, showSubscriptionsInTopbar, allBoardCodes]);

  if (!showModal) {
    return null;
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      closeTopbarEditModal();
    }
  };

  const handleSave = () => {
    // If input is empty, show all directories (default behavior)
    // Otherwise, show only the directories specified in the input
    if (localDirectoryInput.trim() === '') {
      // Show all directories
      allBoardCodes.forEach((code) => {
        setDirectoryVisibility(code, true);
      });
    } else {
      // Show only specified directories
      const inputDirectories = stringToDirectories(localDirectoryInput);
      allBoardCodes.forEach((code) => {
        setDirectoryVisibility(code, inputDirectories.has(code));
      });
    }

    setShowSubscriptionsInTopbar(showSubscriptions);
    closeTopbarEditModal();
  };

  return (
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div className={styles.topbarEditDialog}>
        <div className={styles.hd}>
          <h2>Custom Board List</h2>
          <button className={styles.closeButton} onClick={closeTopbarEditModal} title='Close' />
        </div>
        <div className={styles.bd}>
          <div className={styles.section}>
            <input
              type='text'
              className={styles.directoryInput}
              placeholder='Example: jp tg mu'
              value={localDirectoryInput}
              onChange={(e) => setLocalDirectoryInput(e.target.value)}
            />
          </div>

          {subscriptions.length > 0 && (
            <div className={styles.section}>
              <div className={styles.checkboxItem}>
                <input type='checkbox' id='show-subscriptions' checked={showSubscriptions} onChange={(e) => setShowSubscriptions(e.target.checked)} />
                <label htmlFor='show-subscriptions'>show subscriptions</label>
                <span className={styles.editSubscriptionsWrapper}>
                  (
                  <Link
                    to={location.pathname.replace(/\/$/, '') + '/settings#subscriptions-settings'}
                    className={styles.editSubscriptionsLink}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTopbarEditModal();
                    }}
                  >
                    edit subscriptions
                  </Link>
                  )
                </span>
              </div>
            </div>
          )}
        </div>
        <div className={styles.topbarEditFooter}>
          <button onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
};

export default TopbarEditModal;
