import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SiteLegalMeta from '../site-legal-meta';
import styles from './home-footer.module.css';

const HomeFooter = () => {
  const { t } = useTranslation();
  return (
    <>
      <ul className={styles.footer}>
        <li>
          <Link to='/'>{t('home')}</Link>
        </li>
        <li>
          <a href='https://bitsocial.net/projects/5chan' target='_blank' rel='noopener noreferrer'>
            {t('about')}
          </a>
        </li>
        <li>
          <a href='https://bitsocial.net/blog?q=5chan' target='_blank' rel='noopener noreferrer'>
            Blog
          </a>
        </li>
        <li>
          <Link to='/faq'>FAQ</Link>
        </li>
        <li>
          <Link to='/rules'>Rules</Link>
        </li>
        <li>
          <Link to='/pass'>{t('support_5chan')}</Link>
        </li>
        <li>
          <a href='https://x.com/5chanapp' target='_blank' rel='noopener noreferrer'>
            Twitter/X
          </a>
        </li>
        <li>
          <a href='https://github.com/bitsocialnet/5chan' target='_blank' rel='noopener noreferrer'>
            Source Code
          </a>
        </li>
      </ul>
      <div className={styles.footerInfo}>
        <SiteLegalMeta />
      </div>
    </>
  );
};

export default HomeFooter;
