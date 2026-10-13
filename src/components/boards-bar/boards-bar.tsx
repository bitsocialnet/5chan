import { memo, ReactNode, RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAccountComment } from '@bitsocial/bitsocial-react-hooks';
import getShortAddress from '../../lib/get-short-address';
import { accountsStore as useAccountsStore } from '../../lib/bitsocial-internals/stores';
import { isAllView, isCatalogView, isModView, isSearchView, isSubscriptionsView } from '../../lib/utils/view-utils';
import { useAccountCommunityAddresses } from '../../hooks/use-account-community-addresses';
import { useDirectories, DirectoryCommunity } from '../../hooks/use-directories';
import { useBoardPath, useResolvedCommunityAddress } from '../../hooks/use-resolved-community-address';
import useIsMobile from '../../hooks/use-is-mobile';
import { normalizeAccountCommentIndex } from '../../lib/utils/account-comment-index-utils';
import { getPendingPostRoutePost } from '../../lib/utils/pending-post-route-state';
import { getBoardPath, extractDirectoryFromTitle } from '../../lib/utils/route-utils';
import { SEARCH_PATH } from '../../lib/search-navigation';
import { getCommentCommunityAddress } from '../../lib/utils/comment-utils';
import useCreateBoardModalStore from '../../stores/use-create-board-modal-store';
import useBoardsBarEditModalStore from '../../stores/use-boards-bar-edit-modal-store';
import useBoardsBarVisibilityStore from '../../stores/use-boards-bar-visibility-store';
import useDirectoryModalStore from '../../stores/use-directory-modal-store';
import usePersistentBoardsBarStore from '../../stores/use-persistent-boards-bar-store';
import { BOARD_CODE_GROUPS, getAllBoardCodes } from '../../constants/board-codes';
import styles from './boards-bar.module.css';
import capitalize from 'lodash/capitalize';
import debounce from 'lodash/debounce';

// Helper function to find board address by directory code
const findBoardAddressByCode = (code: string, directories: DirectoryCommunity[]): string | null => {
  const entry = directories.find((community) => {
    if (!community.title) return false;
    const directory = extractDirectoryFromTitle(community.title);
    return directory === code;
  });
  return entry?.address || null;
};

// The persistent bar is position: fixed, so a spacer has to keep its height in the page flow.
// That height changes when the bar wraps to more lines or the subscriptions list changes.
const useElementHeight = (ref: RefObject<HTMLElement | null>, enabled: boolean) => {
  const [height, setHeight] = useState(0);

  // Layout effect so the spacer has its height before the first paint with the bar fixed.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return;
    const measure = () => setHeight(element.offsetHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, enabled]);

  return height;
};

// Slides a fixed bar out of view while the page scrolls down and back in on scroll up or near the top.
const useVisibleWhileScrollingUp = (enabled: boolean) => {
  const [visible, setVisible] = useState(true);
  const prevScrollPosRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    prevScrollPosRef.current = window.scrollY;

    const debouncedHandleScroll = debounce(() => {
      const currentScrollPos = window.scrollY;
      const prevScrollPos = prevScrollPosRef.current;

      setVisible(prevScrollPos > currentScrollPos || currentScrollPos < 10);
      prevScrollPosRef.current = currentScrollPos;
    }, 50);

    window.addEventListener('scroll', debouncedHandleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', debouncedHandleScroll);
      debouncedHandleScroll.cancel();
      // Start visible the next time auto-hide is enabled instead of reusing a stale hidden state.
      setVisible(true);
    };
  }, [enabled]);

  return !enabled || visible;
};

interface PinnableBarProps {
  className: string;
  pinned: boolean;
  autoHide: boolean;
  children: ReactNode;
}

const hiddenAboveViewportStyle = { transform: 'translateY(-100%)' };

// Wraps a boards bar that can be pinned to the top of the page. Scroll visibility lives here, so
// hiding or showing the bar does not re-render the board links passed in as children.
const PinnableBar = ({ className, pinned, autoHide, children }: PinnableBarProps) => {
  const barRef = useRef<HTMLDivElement>(null);
  const barHeight = useElementHeight(barRef, pinned);
  const visible = useVisibleWhileScrollingUp(autoHide);
  const pinnedTopBarMode = autoHide ? 'auto-hide' : 'fixed';

  return (
    <>
      <div
        ref={barRef}
        className={className}
        style={visible ? undefined : hiddenAboveViewportStyle}
        // Scrolling to the top of a thread offsets by this bar whenever it will cover the page top.
        data-pinned-top-bar={pinned ? pinnedTopBarMode : undefined}
      >
        {children}
      </div>
      {pinned && <div className={styles.persistentSpacer} style={{ height: barHeight }} />}
    </>
  );
};

const scrollToBottom = () => {
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
};

// 4chan's compact page links: the mobile bar always shows them, and the pinned desktop bar uses
// them in place of its bracketed links.
const PageJump = () => {
  const { t } = useTranslation();
  const location = useLocation();

  return (
    <div className={styles.pageJump}>
      <button type='button' title={capitalize(t('bottom'))} aria-label={capitalize(t('bottom'))} onClick={scrollToBottom}>
        ▼
      </button>
      <Link
        to={`${!location.pathname.endsWith('settings') ? location.pathname.replace(/\/$/, '') + '/settings' : location.pathname}${location.search}`}
        state={location.state}
      >
        {t('settings')}
      </Link>
      <Link to={SEARCH_PATH}>{capitalize(t('search'))}</Link>
      <Link to='/'>{t('home')}</Link>
    </div>
  );
};

// Renders one Link per directory board and takes only boolean props, so a parent rerender is
// pure waste: it was re-rendering ~80 Links on every store notification.
const BoardsBarDesktop = memo(({ persistent, autoHide }: { persistent: boolean; autoHide: boolean }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const params = useParams();
  const isInCatalogView = isCatalogView(location.pathname, params);
  const catalogSuffix = isInCatalogView ? '/catalog' : '';
  const [showAllTemporarily, setShowAllTemporarily] = useState(false);
  const { openCreateBoardModal } = useCreateBoardModalStore();
  const { openBoardsBarEditModal } = useBoardsBarEditModalStore();
  const { openDirectoryModal } = useDirectoryModalStore();
  const { visibleDirectories, showSubscriptionsInBoardsBar } = useBoardsBarVisibilityStore();
  const directories = useDirectories();

  // Memoize allBoardCodes since it's derived from a constant
  const allBoardCodes = useMemo(() => getAllBoardCodes(), []);

  const subscriptions = useAccountsStore(
    (state) => {
      const activeAccountId = state.activeAccountId;
      const activeAccount = activeAccountId ? state.accounts[activeAccountId] : undefined;
      return [...(activeAccount?.subscriptions || [])];
    },
    (prev, next) => {
      return prev.length === next.length && prev.every((val, idx) => val === next[idx]);
    },
  );

  const accountCommunityAddresses = useAccountCommunityAddresses();

  // Show all subscriptions when enabled; no separate per-address tracking (avoids drift when subscribing from board-buttons)
  const visibleSubscriptionAddresses = showSubscriptionsInBoardsBar ? subscriptions : [];

  // Check if any directories are hidden
  const hasHiddenDirectories = useMemo(() => {
    return allBoardCodes.some((code) => !visibleDirectories.has(code));
  }, [allBoardCodes, visibleDirectories]);

  // Determine which directories to show (all if temporarily showing all, otherwise only visible ones)
  const directoriesToShow = useMemo(() => {
    if (showAllTemporarily) {
      return new Set(allBoardCodes);
    }
    return visibleDirectories;
  }, [showAllTemporarily, visibleDirectories, allBoardCodes]);

  // Initialize visibility store on mount
  useEffect(() => {
    useBoardsBarVisibilityStore.getState().initialize();
  }, []);

  // Render a board code link or placeholder
  const renderBoardCode = (code: string, isLastInGroup: boolean) => {
    const address = findBoardAddressByCode(code, directories);
    const isPlaceholder = !address;

    const openDirectoryForPlaceholder = (e: React.MouseEvent) => {
      // If no address exists, prevent navigation and open directory modal
      if (!address) {
        e.preventDefault();
        e.stopPropagation();
        openDirectoryModal();
      }
    };

    const linkContent = (
      <>
        {isPlaceholder ? (
          <button
            type='button'
            className={styles.placeholder}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (!address) openDirectoryModal();
              }
            }}
            onClick={openDirectoryForPlaceholder}
          >
            {code}
          </button>
        ) : (
          <Link to={`/${code}${catalogSuffix}`} onClick={openDirectoryForPlaceholder}>
            {code}
          </Link>
        )}
      </>
    );

    return (
      <span key={code}>
        {linkContent}
        {!isLastInGroup && ' / '}
      </span>
    );
  };

  // Render a subscription link
  const renderSubscription = (address: string, index: number, total: number) => {
    const boardPath = getBoardPath(address, directories);
    const displayText = address.endsWith('.eth') || address.endsWith('.sol') ? address : getShortAddress(address);

    return (
      <span key={address}>
        {boardPath && boardPath.trim() ? <Link to={`/${boardPath}${catalogSuffix}`}>{displayText}</Link> : <span>{displayText}</span>}
        {index !== total - 1 && ' / '}
      </span>
    );
  };

  return (
    <PinnableBar className={persistent ? `${styles.boardNavDesktop} ${styles.persistent}` : styles.boardNavDesktop} pinned={persistent} autoHide={autoHide}>
      <span className={styles.boardList}>
        [<Link to={`/all${catalogSuffix}`}>all</Link> / <Link to={`/subs${catalogSuffix}`}>subs</Link>
        {accountCommunityAddresses.length > 0 && (
          <>
            {' '}
            / <Link to={`/mod${catalogSuffix}`}>mod</Link>
          </>
        )}
        ]{' '}
        {BOARD_CODE_GROUPS.map((group) => {
          const visibleCodes = group.filter((code) => directoriesToShow.has(code));
          if (visibleCodes.length === 0) return null;

          return <span key={group.join('|')}>[{visibleCodes.map((code, codeIndex) => renderBoardCode(code, codeIndex === visibleCodes.length - 1))}] </span>;
        })}
        {hasHiddenDirectories && !showAllTemporarily && (
          <>
            {' '}
            [
            <button
              type='button'
              className={styles.temporaryButton}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setShowAllTemporarily(true);
                }
              }}
              onClick={() => setShowAllTemporarily(true)}
              title='Show all'
            >
              ...
            </button>
            ]{' '}
          </>
        )}
        {visibleSubscriptionAddresses.length > 0 && (
          <>[{visibleSubscriptionAddresses.map((address: string, index: number) => renderSubscription(address, index, visibleSubscriptionAddresses.length))}] </>
        )}
        [
        <button
          type='button'
          className={styles.temporaryButton}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openBoardsBarEditModal();
            }
          }}
          onClick={() => openBoardsBarEditModal()}
        >
          {capitalize(t('edit'))}
        </button>
        ] [
        <button
          type='button'
          className={styles.temporaryButton}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openCreateBoardModal();
            }
          }}
          onClick={() => openCreateBoardModal()}
        >
          {t('create_board')}
        </button>
        ]
      </span>
      {persistent ? (
        <PageJump />
      ) : (
        <span className={styles.navTopRight}>
          [
          <Link
            to={`${!location.pathname.endsWith('settings') ? location.pathname.replace(/\/$/, '') + '/settings' : location.pathname}${location.search}`}
            state={location.state}
          >
            {t('settings')}
          </Link>
          ] [<Link to={SEARCH_PATH}>{capitalize(t('search'))}</Link>] [<Link to='/'>{t('home')}</Link>]
        </span>
      )}
    </PinnableBar>
  );
});
BoardsBarDesktop.displayName = 'BoardsBarDesktop';

interface BoardsBarMobileProps {
  communityAddress?: string;
  // Pinned on desktop in place of the traditional board list.
  pinnedOnDesktop: boolean;
  autoHide: boolean;
}

const BoardsBarMobile = memo(({ communityAddress, pinnedOnDesktop, autoHide }: BoardsBarMobileProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const directories = useDirectories();
  const displayCommunityAddress = communityAddress && communityAddress.length > 30 ? communityAddress.slice(0, 30).concat('...') : communityAddress;

  // Filter to only show directory boards (those with titles)
  const directoryBoards = useMemo(() => directories.filter((sub) => sub.title && extractDirectoryFromTitle(sub.title)), [directories]);

  const location = useLocation();
  const params = useParams();
  const isInAllView = isAllView(location.pathname);
  const isInCatalogView = isCatalogView(location.pathname, params);
  const isInSubscriptionsView = isSubscriptionsView(location.pathname, params);
  const isInModView = isModView(location.pathname);
  const isInSearchView = isSearchView(location.pathname);
  const boardPath = useBoardPath(communityAddress);
  const selectValue = isInAllView ? 'all' : isInSubscriptionsView ? 'subs' : isInModView ? 'mod' : isInSearchView ? 'search' : boardPath || communityAddress;

  const accountCommunityAddresses = useAccountCommunityAddresses();

  // Check if current community is a directory board
  const currentIsDirectoryBoard = directoryBoards.some((board) => board.address === communityAddress);

  // Build multiboards with full titles, then combine with directory boards and sort alphabetically
  const sortedBoardOptions = useMemo(() => {
    const allTitle = '/all/ - All 5chan Directories';
    const subsTitle = '/subs/ - Subscriptions';
    const modTitle = '/mod/ - Boards You Moderate';
    const searchTitle = t('archive_search_title');

    const multiboards: Array<{ value: string; label: string }> = [
      { value: 'all', label: allTitle },
      { value: 'subs', label: subsTitle },
      { value: 'search', label: searchTitle },
      ...(accountCommunityAddresses.length > 0 ? [{ value: 'mod', label: modTitle }] : []),
    ];

    const directoryOptions = directoryBoards.map((board) => {
      const directoryCode = extractDirectoryFromTitle(board.title!);
      return { value: directoryCode!, label: board.title! };
    });

    return [...multiboards, ...directoryOptions].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  }, [accountCommunityAddresses.length, directoryBoards, t]);

  const boardSelect = (
    <select
      value={selectValue}
      onChange={(e) => {
        const value = e.target.value;
        navigate(`/${value}${isInCatalogView ? '/catalog' : ''}`);
      }}
    >
      {!currentIsDirectoryBoard && communityAddress && <option value={communityAddress}>{displayCommunityAddress}</option>}
      {sortedBoardOptions.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );

  return (
    <PinnableBar
      className={pinnedOnDesktop ? `${styles.boardNavMobile} ${styles.persistentOnDesktop}` : styles.boardNavMobile}
      pinned={pinnedOnDesktop}
      autoHide={autoHide}
    >
      <div className={styles.boardSelect}>
        <strong>{t('board')}</strong>
        {boardSelect}
      </div>
      <PageJump />
    </PinnableBar>
  );
});
BoardsBarMobile.displayName = 'BoardsBarMobile';

// Only the top instance (persistable) follows the persistent setting; the footer renders a second
// copy that must stay in place.
const BoardsBar = memo(({ persistable = false }: { persistable?: boolean }) => {
  const params = useParams();
  const location = useLocation();
  const accountComment = useAccountComment({ commentIndex: normalizeAccountCommentIndex(params?.accountCommentIndex) });
  const resolvedCommunityAddress = useResolvedCommunityAddress();
  const communityAddress = resolvedCommunityAddress || getCommentCommunityAddress(accountComment) || getCommentCommunityAddress(getPendingPostRoutePost(location.state));
  const persistentBoardsBar = usePersistentBoardsBarStore((state) => state.persistentBoardsBar) && persistable;
  const traditionalBoardList = usePersistentBoardsBarStore((state) => state.traditionalBoardList);
  const autoHide = usePersistentBoardsBarStore((state) => state.autoHideBoardsBar) && persistentBoardsBar;
  // Without the traditional board list, desktop pins the mobile board select instead, like 4chan.
  const pinBoardSelect = persistentBoardsBar && !traditionalBoardList;
  const isMobile = useIsMobile();
  const pinnedBoardSelectOnDesktop = pinBoardSelect && !isMobile;

  return (
    <>
      {!pinBoardSelect && <BoardsBarDesktop persistent={persistentBoardsBar} autoHide={autoHide} />}
      <BoardsBarMobile
        communityAddress={communityAddress}
        pinnedOnDesktop={pinnedBoardSelectOnDesktop}
        // On mobile the bar always hides while scrolling down; on desktop only when auto-hide is on.
        autoHide={!pinnedBoardSelectOnDesktop || autoHide}
      />
    </>
  );
});
BoardsBar.displayName = 'BoardsBar';

export default BoardsBar;
