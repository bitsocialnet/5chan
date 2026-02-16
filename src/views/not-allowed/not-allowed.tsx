import { Link } from 'react-router-dom';
import { HomeLogo } from '../home';
import NotFoundImage from '../../components/not-found-image';
import styles from '../not-found/not-found.module.css';

const NotAllowed = () => {
  return (
    <div className={styles.wrapper}>
      <div className={styles.content}>
        <HomeLogo />
        <div className={styles.boxOuter}>
          <div className={styles.boxInner}>
            <div className={styles.boxBar}>
              <h2>Not Allowed</h2>
            </div>
            <div className={styles.boxContent}>
              <NotFoundImage />
              <br />
              <div className={styles.backToBoard}>
                [<Link to='/'>Back to home</Link>]
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotAllowed;
