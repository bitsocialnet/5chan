import { useEffect, useMemo, useRef, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { useSubplebbits } from '@bitsocialhq/pkc-react-hooks';
import styles from './home.module.css';
import { useDirectories, useDirectoryAddresses } from '../../hooks/use-directories';
import { SubplebbitStatsCollector, useSubplebbitsStatsStore } from '../../hooks/use-subplebbits-stats';
import PopularThreadsBox from './popular-threads-box';
import BoardsList from './boards-list';
import SiteLegalMeta from '../../components/site-legal-meta';
import useDirectoryModalStore from '../../stores/use-directory-modal-store';
import DisclaimerModal from '../../components/disclaimer-modal';
import DirectoryModal from '../../components/directory-modal';
import { getBoardPath } from '../../lib/utils/route-utils';
import lowerCase from 'lodash/lowerCase';

// https://github.com/bitsocialhq/lists/blob/master/5chan-directories.json

const SearchBar = () => {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const directories = useDirectories();

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    const searchInput = searchInputRef.current?.value;
    if (searchInput) {
      const boardPath = getBoardPath(searchInput, directories);
      navigate(`/${boardPath}`);
    }
  };

  return (
    <div className={styles.searchBar}>
      <form onSubmit={handleSearchSubmit}>
        <input
          autoCorrect='off'
          autoComplete='off'
          spellCheck='false'
          autoCapitalize='off'
          type='text'
          placeholder={lowerCase(t('enter_board_address'))}
          ref={searchInputRef}
        />
        <button className={styles.searchButton}>{t('go')}</button>
      </form>
    </div>
  );
};

const InfoBox = () => {
  const { t } = useTranslation();
  return (
    <div className={`${styles.box} ${styles.infoBox}`}>
      <div className={styles.infoboxBar}>
        <h2>{t('what_is_5chan')}</h2>
      </div>
      <div className={styles.boxContent}>
        <Trans
          i18nKey='5chan_description'
          shouldUnescape={true}
          components={{
            1: <Link key='rules-link' to='/rules' />,
            2: <Link key='faqs-link' to='/faq' />,
          }}
        />
        <br />
        <br />
        <Trans
          i18nKey='no_global_rules_info'
          shouldUnescape={true}
          components={{
            1: <a key='releases-link' href='https://github.com/bitsocialhq/5chan/releases/latest' target='_blank' rel='noopener noreferrer' />,
          }}
        />
      </div>
    </div>
  );
};

const Stats = ({ directoryAddresses }: { directoryAddresses: string[] }) => {
  const { t } = useTranslation();
  const subplebbitsStats = useSubplebbitsStatsStore((state) => state.subplebbitsStats);

  const { totalPosts, currentUsers, boardsTracked } = useMemo(() => {
    let totalPosts = 0;
    let currentUsers = 0;
    let boardsTracked = 0;

    directoryAddresses.forEach((address) => {
      const stat = subplebbitsStats[address];
      if (stat) {
        totalPosts += stat.allPostCount || 0;
        currentUsers += stat.weekActiveUserCount || 0;
        boardsTracked++;
      }
    });

    return { totalPosts, currentUsers, boardsTracked };
  }, [subplebbitsStats, directoryAddresses]);

  return (
    <>
      {/* Render collectors to fetch stats for each subplebbit */}
      {directoryAddresses.map((address) => (
        <SubplebbitStatsCollector key={address} subplebbitAddress={address} />
      ))}
      <div className={styles.box}>
        <div className={`${styles.boxBar} ${styles.color2ColorBar}`}>
          <h2 className='capitalize'>{t('stats')}</h2>
        </div>
        <div className={`${styles.boxContent} ${styles.stats}`}>
          <div className={styles.stat}>
            <b>{t('total_posts')}</b> {totalPosts}
          </div>
          <div className={styles.stat}>
            <b>{t('current_users')}</b> {currentUsers}
          </div>
          <div className={styles.stat}>
            <b>{t('boards_tracked')}</b> {boardsTracked}
          </div>
        </div>
      </div>
    </>
  );
};

export const Footer = () => {
  const { t } = useTranslation();
  return (
    <>
      <ul className={styles.footer}>
        <li>
          <a href='https://github.com/bitsocialhq/5chan/blob/master/README.md' target='_blank' rel='noopener noreferrer'>
            {t('about')}
          </a>
        </li>
        <li>
          <a href='https://t.me/fivechandev' target='_blank' rel='noopener noreferrer'>
            {t('updates')}
          </a>
        </li>
        <li>
          <Link to='/faq'>FAQ</Link>
        </li>
        <li>
          <Link to='/rules'>Rules</Link>
        </li>
        <li>
          <a href='https://t.me/plebbit' target='_blank' rel='noopener noreferrer'>
            Telegram
          </a>
        </li>
        <li>
          <a href='https://github.com/bitsocialhq/5chan' target='_blank' rel='noopener noreferrer'>
            GitHub
          </a>
        </li>
        <li>
          <a href='https://github.com/sponsors/plebe1us' target='_blank' rel='noopener noreferrer'>
            {t('support_5chan')}
          </a>
        </li>
        <li>
          <a href='https://github.com/plebbit/whitepaper/discussions/2' target='_blank' rel='noopener noreferrer'>
            {t('whitepaper')}
          </a>
        </li>
      </ul>
      <div className={styles.footerInfo}>
        <SiteLegalMeta />
      </div>
    </>
  );
};

export const HomeLogo = () => {
  return (
    <Link to='/'>
      <div className={styles.logo}>
        <img alt='' src='assets/logo/logo-transparent.png' />
      </div>
    </Link>
  );
};

const Home = () => {
  const directories = useDirectories();
  const directoryAddresses = useDirectoryAddresses();
  const { subplebbits } = useSubplebbits({ subplebbitAddresses: directoryAddresses });
  const { closeDirectoryModal } = useDirectoryModalStore();

  useEffect(() => {
    document.title = '5chan';
  }, []);

  // Close directory modal when navigating away from home
  useEffect(() => {
    return () => {
      closeDirectoryModal();
    };
  }, [closeDirectoryModal]);

  return (
    <>
      <DisclaimerModal />
      <DirectoryModal />
      <div className={styles.content}>
        <HomeLogo />
        <SearchBar />
        <InfoBox />
        <BoardsList multisub={directories} />
        <PopularThreadsBox directories={directories} subplebbits={subplebbits} />
        <Stats directoryAddresses={directoryAddresses} />
        <Footer />
      </div>
    </>
  );
};

export default Home;
