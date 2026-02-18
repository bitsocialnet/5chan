import { useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAccount } from '@plebbit/plebbit-react-hooks';
import useTopbarEditModalStore from '../../stores/use-topbar-edit-modal-store';
import useTopbarVisibilityStore from '../../stores/use-topbar-visibility-store';
import { getAllBoardCodes } from '../../constants/board-codes';
import styles from './topbar-edit-modal.module.css';

const directoriesToString = (dirs: Set<string>): string => Array.from(dirs).sort().join(' ');

const stringToDirectories = (str: string): Set<string> => {
  const codes = str
    .trim()
    .split(/\s+/)
    .filter((code) => code.length > 0)
    .map((code) => code.toLowerCase());
  return new Set(codes);
};

// Form component keyed by store values so it remounts with fresh state when modal reopens
const TopbarEditModalForm = ({
  visibleDirectories,
  showSubscriptionsInTopbar,
  setDirectoryVisibility,
  setShowSubscriptionsInTopbar,
  closeTopbarEditModal,
  subscriptions,
  location,
}: {
  visibleDirectories: Set<string>;
  showSubscriptionsInTopbar: boolean;
  setDirectoryVisibility: (code: string, visible: boolean) => void;
  setShowSubscriptionsInTopbar: (show: boolean) => void;
  closeTopbarEditModal: () => void;
  subscriptions: string[];
  location: { pathname: string };
}) => {
  const allBoardCodes = useMemo(() => getAllBoardCodes(), []);
  const allVisible = allBoardCodes.every((code) => visibleDirectories.has(code));

  const [localDirectoryInput, setLocalDirectoryInput] = useState(() => (allVisible ? '' : directoriesToString(visibleDirectories)));
  const [showSubscriptions, setShowSubscriptions] = useState(() => showSubscriptionsInTopbar);

  const handleSave = () => {
    if (localDirectoryInput.trim() === '') {
      allBoardCodes.forEach((code) => setDirectoryVisibility(code, true));
    } else {
      const inputDirectories = stringToDirectories(localDirectoryInput);
      allBoardCodes.forEach((code) => setDirectoryVisibility(code, inputDirectories.has(code)));
    }
    setShowSubscriptionsInTopbar(showSubscriptions);
    closeTopbarEditModal();
  };

  return (
    <>
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
      <div className={styles.topbarEditFooter}>
        <button onClick={handleSave}>Save</button>
      </div>
    </>
  );
};

const TopbarEditModal = () => {
  const { showModal, closeTopbarEditModal } = useTopbarEditModalStore();
  const { visibleDirectories, showSubscriptionsInTopbar, setDirectoryVisibility, setShowSubscriptionsInTopbar } = useTopbarVisibilityStore();
  const account = useAccount();
  const subscriptions = useMemo(() => account?.subscriptions || [], [account?.subscriptions]);
  const location = useLocation();

  if (!showModal) {
    return null;
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      closeTopbarEditModal();
    }
  };

  const formKey = `${directoriesToString(visibleDirectories)}-${showSubscriptionsInTopbar}`;

  return (
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div className={styles.topbarEditDialog}>
        <div className={styles.hd}>
          <h2>Custom Board List</h2>
          <button className={styles.closeButton} onClick={closeTopbarEditModal} title='Close' />
        </div>
        <div className={styles.bd}>
          <TopbarEditModalForm
            key={formKey}
            visibleDirectories={visibleDirectories}
            showSubscriptionsInTopbar={showSubscriptionsInTopbar}
            setDirectoryVisibility={setDirectoryVisibility}
            setShowSubscriptionsInTopbar={setShowSubscriptionsInTopbar}
            closeTopbarEditModal={closeTopbarEditModal}
            subscriptions={subscriptions}
            location={location}
          />
        </div>
      </div>
    </div>
  );
};

export default TopbarEditModal;
