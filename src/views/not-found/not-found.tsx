import { Link, useLocation } from 'react-router-dom';
import { useCommunityField } from '../../hooks/use-stable-community';
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
  const communityAddress = boardIdentifier ? getSubplebbitAddress(boardIdentifier, directories) : '';
  // Only subscribe to address and shortAddress to avoid rerenders from updatingState changes
  const address = useCommunityField(communityAddress, (community) => community?.address);
  const shortAddress = useCommunityField(communityAddress, (community) => community?.shortAddress);

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
                    [<Link to={`/${boardIdentifier || communityAddress}`}>Back to p/{shortAddress || communityAddress}</Link>]
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
