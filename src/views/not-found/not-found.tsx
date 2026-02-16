import { Link, useLocation } from 'react-router-dom';
import { useSubplebbitField } from '../../hooks/use-stable-subplebbit';
import { useDirectories } from '../../hooks/use-directories';
import { getSubplebbitAddress } from '../../lib/utils/route-utils';
import { HomeLogo } from '../home';
import NotFoundImage from '../../components/not-found-image';
import styles from './not-found.module.css';

const NotFound = () => {
  const location = useLocation();
  // Extract boardIdentifier from pathname (could be directory code or address)
  const pathParts = location.pathname.split('/').filter(Boolean);
  const boardIdentifier = pathParts[0] && pathParts[0] !== 'not-found' && pathParts[0] !== 'faq' ? pathParts[0] : '';
  const directories = useDirectories();
  const subplebbitAddress = boardIdentifier ? getSubplebbitAddress(boardIdentifier, directories) : '';
  // Only subscribe to address and shortAddress to avoid rerenders from updatingState changes
  const address = useSubplebbitField(subplebbitAddress, (subplebbit) => subplebbit?.address);
  const shortAddress = useSubplebbitField(subplebbitAddress, (subplebbit) => subplebbit?.shortAddress);

  return (
    <div className={styles.wrapper}>
      <div className={styles.content}>
        <HomeLogo />
        <div className={styles.boxOuter}>
          <div className={styles.boxInner}>
            <div className={styles.boxBar}>
              <h2>Not Found</h2>
            </div>
            <div className={styles.boxContent}>
              <NotFoundImage />
              {address && (
                <>
                  <br />
                  <div className={styles.backToBoard}>
                    [<Link to={`/${boardIdentifier || subplebbitAddress}`}>Back to p/{shortAddress || subplebbitAddress}</Link>]
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
