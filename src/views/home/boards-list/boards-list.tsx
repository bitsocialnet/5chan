import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDirectoriesState, useDirectories, DirectoryCommunity } from '../../../hooks/use-directories';
import { getBoardPath } from '../../../lib/utils/route-utils';
import useDisclaimerModalStore from '../../../stores/use-disclaimer-modal-store';
import useDirectoryModalStore from '../../../stores/use-directory-modal-store';
import useBoardsFilterStore from '../../../stores/use-boards-filter-store';
import BoardsFilterModal from './boards-filter-modal';
import styles from '../home.module.css';

const getBoardNameFromDirectoryTitle = (title: string): string => {
  const match = title.match(/^\/[^/]+\/\s*-\s*(.+)$/);
  return match?.[1]?.trim() || title.trim();
};

const NSFWBadge = () => {
  return (
    <>
      &nbsp;
      <h3 className={styles.nsfwBadge}>
        <span title='Not Safe For Work'>
          <sup>(NSFW)</sup>
        </span>
      </h3>
    </>
  );
};

const BoardsList = ({ multisub }: { multisub: DirectoryCommunity[] }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { error } = useDirectoriesState();
  const { showDisclaimerModal } = useDisclaimerModalStore();
  const { openDirectoryModal } = useDirectoryModalStore();
  const { useCatalogLinks, boardFilter } = useBoardsFilterStore();
  const directories = useDirectories();

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, address: string) => {
    e.preventDefault();
    const boardPath = getBoardPath(address, directories);
    showDisclaimerModal(address, navigate, boardPath);
  };

  // Helper to generate link URL with optional catalog suffix
  const getBoardLink = (address: string | null): string => {
    if (!address) return '#';
    const boardPath = getBoardPath(address, directories);
    return `/${boardPath}${useCatalogLinks ? '/catalog' : ''}`;
  };

  // Handler for placeholder board links
  const handlePlaceholderClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    openDirectoryModal();
  };

  const boardAddressesByName = multisub.reduce<Record<string, string>>((acc, community) => {
    if (!community.title) return acc;
    const boardName = getBoardNameFromDirectoryTitle(community.title);
    if (!acc[boardName]) {
      acc[boardName] = community.address;
    }
    return acc;
  }, {});

  const renderBoardLink = (boardName: string) => {
    const address = boardAddressesByName[boardName];

    if (address) {
      return (
        <li>
          <Link to={getBoardLink(address)} onClick={(e) => handleLinkClick(e, address)}>
            {boardName}
          </Link>
        </li>
      );
    }

    return (
      <li>
        <Link to='#' onClick={handlePlaceholderClick} className={styles.placeholder}>
          {boardName}
        </Link>
      </li>
    );
  };

  const errorMessage = error?.message;

  // Filtering logic: determine which categories to show
  const showAll = boardFilter === 'all';
  const showNsfwOnly = boardFilter === 'nsfw';
  const showWorksafeOnly = boardFilter === 'worksafe';

  // Category visibility based on filter
  const showJapaneseCulture = showAll || showWorksafeOnly || showNsfwOnly;
  const showVideoGames = showAll || showWorksafeOnly;
  const showInterests = showAll || showWorksafeOnly;
  const showCreative = showAll || showWorksafeOnly || showNsfwOnly;
  const showOther = showAll || showWorksafeOnly;
  const showMisc = showAll || showNsfwOnly;
  const showAdult = showAll || showNsfwOnly;
  const showMultiboards = showAll || showNsfwOnly;

  return (
    <div className={styles.box}>
      <div className={`${styles.boxBar} ${styles.color2ColorBar}`}>
        <h2 className='capitalize'>{t('boards')}</h2>
        <BoardsFilterModal />
      </div>
      <div className={`${styles.boxContent} ${styles.boardsContent}`}>
        {errorMessage && <div className='red'>{errorMessage}</div>}
        {/* Column 1: Japanese Culture + Video Games */}
        {(showJapaneseCulture || showVideoGames) && (
          <div className={styles.boardsColumn}>
            {/* Japanese Culture */}
            {showJapaneseCulture && (
              <>
                <h3>Japanese Culture</h3>
                <ul>
                  {(showAll || showWorksafeOnly) && (
                    <>
                      {renderBoardLink('Anime & Manga')}
                      {renderBoardLink('Anime/Cute')}
                      {renderBoardLink('Anime/Wallpapers')}
                      {renderBoardLink('Mecha')}
                      {renderBoardLink('Cosplay & EGL')}
                      {renderBoardLink('Cute/Male')}
                    </>
                  )}
                  {(showAll || showNsfwOnly) && renderBoardLink('Flash')}
                  {(showAll || showWorksafeOnly) && (
                    <>
                      {renderBoardLink('Transportation')}
                      {renderBoardLink('Otaku Culture')}
                      {renderBoardLink('Virtual YouTubers')}
                    </>
                  )}
                </ul>
              </>
            )}

            {/* Video Games */}
            {showVideoGames && (
              <>
                <h3>Video Games</h3>
                <ul>
                  {renderBoardLink('Video Games')}
                  {renderBoardLink('Video Game Generals')}
                  {renderBoardLink('Video Games/Multiplayer')}
                  {renderBoardLink('Video Games/Mobile')}
                  {renderBoardLink('Pokémon')}
                  {renderBoardLink('Retro Games')}
                  {renderBoardLink('Video Games/RPG')}
                  {renderBoardLink('Video Games/Strategy')}
                </ul>
              </>
            )}
          </div>
        )}

        {/* Column 2: Interests */}
        {showInterests && (
          <div className={styles.boardsColumn}>
            <h3>Interests</h3>
            <ul>
              {renderBoardLink('Comics & Cartoons')}
              {renderBoardLink('Technology')}
              {renderBoardLink('Television & Film')}
              {renderBoardLink('Weapons')}
              {renderBoardLink('Auto')}
              {renderBoardLink('Animals & Nature')}
              {renderBoardLink('Traditional Games')}
              {renderBoardLink('Sports')}
              {renderBoardLink('Extreme Sports')}
              {renderBoardLink('Professional Wrestling')}
              {renderBoardLink('Science & Math')}
              {renderBoardLink('History & Humanities')}
              {renderBoardLink('International')}
              {renderBoardLink('Outdoors')}
              {renderBoardLink('Toys')}
            </ul>
          </div>
        )}

        {/* Column 3: Creative */}
        {showCreative && (
          <div className={styles.boardsColumn}>
            <h3>Creative</h3>
            <ul>
              {(showAll || showNsfwOnly) && renderBoardLink('Oekaki')}
              {(showAll || showWorksafeOnly) && (
                <>
                  {renderBoardLink('Papercraft & Origami')}
                  {renderBoardLink('Photography')}
                  {renderBoardLink('Food & Cooking')}
                </>
              )}
              {(showAll || showNsfwOnly) && renderBoardLink('Artwork/Critique')}
              {(showAll || showNsfwOnly) && renderBoardLink('Wallpapers/General')}
              {(showAll || showWorksafeOnly) && (
                <>
                  {renderBoardLink('Literature')}
                  {renderBoardLink('Music')}
                  {renderBoardLink('Fashion')}
                  {renderBoardLink('3DCG')}
                  {renderBoardLink('Graphic Design')}
                  {renderBoardLink('Do-It-Yourself')}
                  {renderBoardLink('Worksafe GIF')}
                  {renderBoardLink('Quests')}
                </>
              )}
            </ul>
          </div>
        )}

        {/* Column 4: Other + Misc. */}
        {(showOther || showMisc) && (
          <div className={styles.boardsColumn}>
            {/* Other */}
            {showOther && (
              <>
                <h3>Other</h3>
                <ul>
                  {renderBoardLink('Business & Finance')}
                  {renderBoardLink('Travel')}
                  {renderBoardLink('Fitness')}
                  {renderBoardLink('Paranormal')}
                  {renderBoardLink('Advice')}
                  {renderBoardLink('LGBT')}
                  {renderBoardLink('Pony')}
                  {renderBoardLink('Current News')}
                  {renderBoardLink('Worksafe Requests')}
                  {renderBoardLink('Very Important Posts')}
                </ul>
              </>
            )}

            {/* Misc. (NSFW) */}
            {showMisc && (
              <>
                <h3>Misc.</h3>
                <NSFWBadge />
                <ul>
                  {renderBoardLink('Random')}
                  {renderBoardLink('ROBOT9001')}
                  {renderBoardLink('Politically Incorrect')}
                  {renderBoardLink('International/Random')}
                  {renderBoardLink('Cams & Meetups')}
                  {renderBoardLink('Shit 5chan Says')}
                </ul>
              </>
            )}
          </div>
        )}

        {/* Column 5: Adult (NSFW) */}
        {showAdult && (
          <div className={styles.boardsColumn}>
            <h3>Adult</h3>
            <NSFWBadge />
            <ul>
              {renderBoardLink('Sexy Beautiful Women')}
              {renderBoardLink('Hardcore')}
              {renderBoardLink('Handsome Men')}
              {renderBoardLink('Hentai')}
              {renderBoardLink('Ecchi')}
              {renderBoardLink('Yuri')}
              {renderBoardLink('Hentai/Alternative')}
              {renderBoardLink('Yaoi')}
              {renderBoardLink('Torrents')}
              {renderBoardLink('High Resolution')}
              {renderBoardLink('Adult GIF')}
              {renderBoardLink('Adult Cartoons')}
              {renderBoardLink('Adult Requests')}
            </ul>
          </div>
        )}

        {/* Column 6: Meta */}
        {showMultiboards && (
          <div className={styles.boardsColumn}>
            <h3>Multiboards</h3>
            <NSFWBadge />
            <ul>
              <li>
                <Link to='/all'>All 5chan Directories</Link>
              </li>
              <li>
                <Link to='/subs'>Subscriptions</Link>
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default BoardsList;
