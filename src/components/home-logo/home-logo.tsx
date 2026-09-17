import { Link } from 'react-router-dom';
import styles from './home-logo.module.css';

const HomeLogo = () => (
  <Link to='/'>
    <div className={styles.logo}>
      <img alt='' src='assets/logo/logo-transparent.png' />
    </div>
  </Link>
);

export default HomeLogo;
