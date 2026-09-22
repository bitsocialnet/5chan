import { memo, useMemo, type MouseEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAccountCommunityAddresses } from '../../hooks/use-account-community-addresses';
import { useDirectories, useDirectoryDefaults } from '../../hooks/use-directories';
import useBoardsFilterStore from '../../stores/use-boards-filter-store';
import useDirectoryModalStore from '../../stores/use-directory-modal-store';
import useDisclaimerModalStore from '../../stores/use-disclaimer-modal-store';
import useFramesStore, { type FramesSection } from '../../stores/use-frames-store';
import { getFramesBoards, type FramesBoard } from './frames-board-list';
import styles from './frames-sidebar.module.css';

const FramesBoardSection = ({ section, title, children }: { section: FramesSection; title: string; children: ReactNode }) => {
  const collapsed = useFramesStore((state) => state.collapsedSections[section]);
  const toggleSection = useFramesStore((state) => state.toggleSection);
  const listId = `frames-${section}-boards`;

  return (
    <>
      <h2 className={styles.sectionHeading}>
        <button
          type='button'
          className={styles.collapseButton}
          onClick={() => toggleSection(section)}
          aria-label={title}
          aria-expanded={!collapsed}
          aria-controls={listId}
          title={title}
        >
          {collapsed ? '+' : '−'}
        </button>
        {title}
      </h2>
      <ul id={listId} className={section === 'image' ? styles.imageBoards : undefined} hidden={collapsed}>
        {children}
      </ul>
    </>
  );
};

const FramesSidebar = memo(() => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const directories = useDirectories();
  const defaults = useDirectoryDefaults();
  const boards = useMemo(() => getFramesBoards(directories, defaults), [directories, defaults]);
  const useCatalogLinks = useBoardsFilterStore((state) => state.useCatalogLinks);
  const showDirectories = useFramesStore((state) => state.showDirectories);
  const worksafeOnly = useFramesStore((state) => state.worksafeOnly);
  const setUseFrames = useFramesStore((state) => state.setUseFrames);
  const setShowDirectories = useFramesStore((state) => state.setShowDirectories);
  const setWorksafeOnly = useFramesStore((state) => state.setWorksafeOnly);
  const openDirectoryModal = useDirectoryModalStore((state) => state.openDirectoryModal);
  const showDisclaimerModal = useDisclaimerModalStore((state) => state.showDisclaimerModal);
  const moderatedAddresses = useAccountCommunityAddresses();
  const visibleBoards = worksafeOnly ? boards.filter((board) => board.nsfw === false) : boards;
  const uploadBoards = visibleBoards.filter((board) => board.code === 'f');
  const catalogSuffix = useCatalogLinks ? '/catalog' : '';

  const handleBoardClick = (event: MouseEvent<HTMLAnchorElement>, board: FramesBoard, path: string) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    showDisclaimerModal(board.address!, navigate, path);
  };

  const renderBoard = (board: FramesBoard) => {
    const label = showDirectories ? `/${board.code}/ - ${board.title}` : board.title;
    const path = `${board.code}${board.code === 'f' ? '' : catalogSuffix}`;
    return (
      <li key={board.code}>
        {board.address ? (
          <Link to={`/${path}`} title={board.title} onClick={(event) => handleBoardClick(event, board, path)}>
            {label}
          </Link>
        ) : (
          <button type='button' className={styles.textButton} title={board.title} onClick={openDirectoryModal}>
            {label}
          </button>
        )}
      </li>
    );
  };

  const multiboards = [
    { code: 'all', title: t('all_boards') },
    { code: 'subs', title: t('subscriptions') },
    ...(moderatedAddresses.length > 0 ? [{ code: 'mod', title: t('boards_you_moderate_nav') }] : []),
  ];

  return (
    <nav className={styles.sidebar} aria-label={t('boards')}>
      <div className={styles.inner}>
        <div className={styles.logo}>
          <Link to='/' title={t('home')}>
            <img src='/assets/logo/logo-transparent.png' alt='5chan' />
          </Link>
        </div>
        <ul>
          <li>
            <button type='button' className={styles.textButton} onClick={() => setUseFrames(false)}>
              [{t('remove_frames')}]
            </button>
          </li>
          <li>
            <button type='button' className={styles.textButton} onClick={() => setShowDirectories(!showDirectories)}>
              [{t(showDirectories ? 'hide_directories' : 'show_directories')}]
            </button>
          </li>
          <li>
            <button type='button' className={styles.textButton} onClick={() => setWorksafeOnly(!worksafeOnly)}>
              [{t(worksafeOnly ? 'show_all_boards' : 'show_worksafe_only')}]
            </button>
          </li>
        </ul>
        <FramesBoardSection section='image' title={t('image_boards')}>
          {visibleBoards.filter((board) => board.code !== 'f').map(renderBoard)}
        </FramesBoardSection>
        {uploadBoards.length > 0 && (
          <FramesBoardSection section='upload' title={t('upload_boards')}>
            {uploadBoards.map(renderBoard)}
          </FramesBoardSection>
        )}
        <FramesBoardSection section='multi' title={t('multiboards')}>
          {multiboards.map(({ code, title }) => (
            <li key={code}>
              <Link to={`/${code}${catalogSuffix}`} title={title}>
                {showDirectories ? `/${code}/ - ${title}` : title}
              </Link>
            </li>
          ))}
        </FramesBoardSection>
      </div>
    </nav>
  );
});

FramesSidebar.displayName = 'FramesSidebar';

export default FramesSidebar;
