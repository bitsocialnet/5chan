import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useAccount, useAccountComment, useSubplebbit } from '@plebbit/plebbit-react-hooks';
import useAccountsStore from '@plebbit/plebbit-react-hooks/dist/stores/accounts';
import { initSnow, removeSnow } from './lib/snow';
import { isAllView, isModView, isSubscriptionsView } from './lib/utils/view-utils';
import { preloadThemeAssets } from './lib/utils/preload-utils';
import useReplyModalStore from './stores/use-reply-modal-store';
import useCreateBoardModalStore from './stores/use-create-board-modal-store';
import useSpecialThemeStore from './stores/use-special-theme-store';
import useFeedViewSettingsStore from './stores/use-feed-view-settings-store';
import useFeedCacheStore from './stores/use-feed-cache-store';
import useIsMobile from './hooks/use-is-mobile';
import useTheme from './hooks/use-theme';
import { useDirectories } from './hooks/use-directories';
import { useResolvedSubplebbitAddress } from './hooks/use-resolved-subplebbit-address';
import { getSubplebbitAddress, isPostRoute, isPendingPostRoute, isModQueueRoute } from './lib/utils/route-utils';
import styles from './app.module.css';
import FAQ from './views/faq';
import Home from './views/home';
import Rules from './views/rules';
import NotFound from './views/not-found';
import NotAllowed from './views/not-allowed';
import PendingPost from './views/pending-post';
import Post from './views/post';
import Board from './views/board';
import Catalog from './views/catalog';
import ModQueueView from './views/mod-queue';
import { DesktopBoardButtons, MobileBoardButtons } from './components/board-buttons';
import BoardHeader from './components/board-header';
import ChallengeModal from './components/challenge-modal';
import CreateBoardModal from './components/create-board-modal';
import FeedCacheContainer from './components/feed-cache-container';
import ReplyModal from './components/reply-modal';
import PostForm from './components/post-form';
import SubplebbitStats from './components/subplebbit-stats';
import TopBar from './components/topbar';
import TopbarEditModal from './components/topbar-edit-modal';
import DirectoryModal from './components/directory-modal';
import DisclaimerModal from './components/disclaimer-modal';
import SettingsModal from './components/settings-modal';

// Preload all theme assets (buttons, backgrounds) immediately on app load
// to prevent visible loading delays when switching themes
preloadThemeAssets();

const hasModQueueAccessRole = (role?: string): boolean => role === 'admin' || role === 'owner' || role === 'moderator';

const BoardLayout = () => {
  const { accountCommentIndex, boardIdentifier } = useParams();
  const location = useLocation();
  const isMobile = useIsMobile();
  const isInAllView = isAllView(location.pathname);
  const isInSubscriptionsView = isSubscriptionsView(location.pathname, useParams());
  const isInModView = isModView(location.pathname);
  const directories = useDirectories();
  const subplebbitAddress = boardIdentifier ? getSubplebbitAddress(boardIdentifier, directories) : undefined;
  const pendingPost = useAccountComment({ commentIndex: accountCommentIndex ? parseInt(accountCommentIndex) : undefined });
  const { closeCreateBoardModal } = useCreateBoardModalStore();
  const enableInfiniteScroll = useFeedViewSettingsStore((state) => state.enableInfiniteScroll);
  const clearFeeds = useFeedCacheStore((state) => state.clearFeeds);

  const isOnPostRoute = isPostRoute(location.pathname);
  const isOnPendingPostRoute = isPendingPostRoute(location.pathname);
  const isOnModQueueRoute = isModQueueRoute(location.pathname);
  const shouldRenderOutlet = !enableInfiniteScroll || isOnPostRoute || isOnPendingPostRoute || isOnModQueueRoute;

  // Clear feed cache when switching from infinite scroll to pagination
  useEffect(() => {
    if (!enableInfiniteScroll) {
      clearFeeds();
    }
  }, [enableInfiniteScroll, clearFeeds]);

  // Christmas theme
  const { isEnabled: isSpecialEnabled } = useSpecialThemeStore();
  useEffect(() => {
    if (isSpecialEnabled && !isMobile) {
      initSnow({ flakeCount: 150 });
    }
    return () => {
      removeSnow();
    };
  }, [isSpecialEnabled, isMobile]);

  // Close create board modal when navigating to a different page
  useEffect(() => {
    closeCreateBoardModal();
  }, [location.pathname, closeCreateBoardModal]);

  // force rerender of post form when navigating between pages, except when opening settings modal in current view
  const key = location.pathname.endsWith('/settings')
    ? `${subplebbitAddress}-${location.pathname.replace(/\/settings$/, '')}`
    : `${subplebbitAddress}-${location.pathname}`;

  return (
    <div className={styles.boardLayout}>
      <TopBar />
      <CreateBoardModal />
      <TopbarEditModal />
      <DirectoryModal />
      <DisclaimerModal />
      <BoardHeader />
      {isMobile
        ? (subplebbitAddress || isInAllView || isInModView || isInSubscriptionsView || pendingPost?.subplebbitAddress || isOnModQueueRoute) && (
            <>
              <PostForm key={key} />
              <MobileBoardButtons />
            </>
          )
        : (subplebbitAddress || isInAllView || isInModView || isInSubscriptionsView || pendingPost?.subplebbitAddress || isOnModQueueRoute) && (
            <>
              <PostForm key={key} />
              {!(isInAllView || isInSubscriptionsView || isInModView) && !isOnModQueueRoute && <SubplebbitStats />}
              <DesktopBoardButtons />
            </>
          )}
      {enableInfiniteScroll && <FeedCacheContainer />}
      {shouldRenderOutlet && <Outlet />}
    </div>
  );
};

const GlobalLayout = () => {
  const [currentTheme] = useTheme();

  useEffect(() => {
    if (currentTheme) {
      document.body.classList.add(currentTheme);
      return () => {
        document.body.classList.remove(currentTheme);
      };
    }
  }, [currentTheme]);

  const { activeCid, parentNumber, threadNumber, threadCid, subplebbitAddress, closeModal, showReplyModal, scrollY } = useReplyModalStore();

  const location = useLocation();
  const isInSettingsView = location.pathname.endsWith('/settings');

  return (
    <>
      <ChallengeModal />
      {activeCid && threadCid && subplebbitAddress && (
        <ReplyModal
          closeModal={closeModal}
          parentCid={activeCid}
          parentNumber={parentNumber}
          threadNumber={threadNumber}
          postCid={threadCid}
          scrollY={scrollY}
          showReplyModal={showReplyModal}
          subplebbitAddress={subplebbitAddress}
        />
      )}
      {isInSettingsView && <SettingsModal />}
      <Outlet />
    </>
  );
};

/** Wraps Board with viewType/boardIdentifier derived from current route. Used when infinite scroll is OFF. */
const BoardFeedRoute = () => {
  const location = useLocation();
  const params = useParams();
  const viewType: 'all' | 'subs' | 'mod' | 'board' = isAllView(location.pathname)
    ? 'all'
    : isSubscriptionsView(location.pathname, params)
      ? 'subs'
      : isModView(location.pathname)
        ? 'mod'
        : 'board';
  return <Board viewType={viewType} boardIdentifier={params.boardIdentifier} />;
};

/** Wraps Catalog with viewType/boardIdentifier derived from current route. Used when infinite scroll is OFF. */
const CatalogFeedRoute = () => {
  const location = useLocation();
  const params = useParams();
  const viewType: 'all' | 'subs' | 'mod' | 'board' = isAllView(location.pathname)
    ? 'all'
    : isSubscriptionsView(location.pathname, params)
      ? 'subs'
      : isModView(location.pathname)
        ? 'mod'
        : 'board';
  return <Catalog viewType={viewType} boardIdentifier={params.boardIdentifier} />;
};

const ModQueueRoute = () => {
  const { boardIdentifier } = useParams();
  const account = useAccount();
  const accountAddress = account?.author?.address;
  const subplebbitAddress = useResolvedSubplebbitAddress();
  const subplebbit = useSubplebbit({ subplebbitAddress });

  const accountSubplebbitAddresses = useAccountsStore(
    (state) => {
      const activeAccountId = state.activeAccountId;
      const activeAccount = activeAccountId ? state.accounts[activeAccountId] : undefined;
      const accountSubplebbits = activeAccount?.subplebbits || {};
      return Object.keys(accountSubplebbits);
    },
    (prev, next) => {
      if (prev.length !== next.length) return false;
      return prev.every((val, idx) => val === next[idx]);
    },
  );

  if (!account) {
    return null;
  }

  if (!accountAddress) {
    return <Navigate to='/not-allowed' replace />;
  }

  if (!boardIdentifier) {
    return accountSubplebbitAddresses.length > 0 ? <ModQueueView /> : <Navigate to='/not-allowed' replace />;
  }

  // Wait for board role metadata before enforcing access to avoid false redirects during initial load.
  const boardState = subplebbit?.state;
  const isBoardLoading = !subplebbit || !boardState || (boardState !== 'succeeded' && boardState !== 'failed');
  if (isBoardLoading) {
    return null;
  }

  const accountRole = subplebbit?.roles?.[accountAddress]?.role;
  return hasModQueueAccessRole(accountRole) ? <ModQueueView /> : <Navigate to='/not-allowed' replace />;
};

const App = () => {
  const enableInfiniteScroll = useFeedViewSettingsStore((state) => state.enableInfiniteScroll);
  const boardFeedElement = enableInfiniteScroll ? null : <BoardFeedRoute />;
  const catalogFeedElement = enableInfiniteScroll ? null : <CatalogFeedRoute />;

  return (
    <div className={styles.app}>
      <Routes>
        <Route element={<GlobalLayout />}>
          <Route path='/' element={<Home />} />
          <Route path='/faq' element={<FAQ />} />
          <Route path='/rules/:boardIdentifier?' element={<Rules />} />
          <Route element={<BoardLayout />}>
            {/* Canonical multiboard routes (no time filter) */}
            <Route path='/all' element={boardFeedElement} />
            <Route path='/all/settings' element={boardFeedElement} />
            <Route path='/all/catalog' element={catalogFeedElement} />
            <Route path='/all/catalog/settings' element={catalogFeedElement} />

            <Route path='/subs' element={boardFeedElement} />
            <Route path='/subs/settings' element={boardFeedElement} />
            <Route path='/subs/catalog' element={catalogFeedElement} />
            <Route path='/subs/catalog/settings' element={catalogFeedElement} />

            <Route path='/mod' element={boardFeedElement} />
            <Route path='/mod/settings' element={boardFeedElement} />
            <Route path='/mod/catalog' element={catalogFeedElement} />
            <Route path='/mod/catalog/settings' element={catalogFeedElement} />

            <Route path='/mod/modqueue' element={<ModQueueRoute />} />
            <Route path='/mod/modqueue/settings' element={<ModQueueRoute />} />

            {/* Invalid subpaths: old time-filter URLs (e.g. /all/24h) -> not-found */}
            <Route path='/all/*' element={<Navigate to='/not-found' replace />} />
            <Route path='/subs/*' element={<Navigate to='/not-found' replace />} />
            <Route path='/mod/*' element={<Navigate to='/not-found' replace />} />

            <Route path='/:boardIdentifier/:pageNumber' element={boardFeedElement} />
            <Route path='/:boardIdentifier' element={boardFeedElement} />
            <Route path='/:boardIdentifier/settings' element={boardFeedElement} />
            <Route path='/:boardIdentifier/catalog' element={catalogFeedElement} />
            <Route path='/:boardIdentifier/catalog/settings' element={catalogFeedElement} />

            <Route path='/:boardIdentifier/modqueue' element={<ModQueueRoute />} />
            <Route path='/:boardIdentifier/modqueue/settings' element={<ModQueueRoute />} />

            <Route path='/:boardIdentifier/thread/:commentCid' element={<Post />} />
            <Route path='/:boardIdentifier/thread/:commentCid/settings' element={<Post />} />

            <Route path='/pending/:accountCommentIndex' element={<PendingPost />} />
            <Route path='/pending/:accountCommentIndex/settings' element={<PendingPost />} />
          </Route>
          <Route path='/not-allowed' element={<NotAllowed />} />
          <Route path='/not-found' element={<NotFound />} />
          <Route path='*' element={<NotFound />} />
        </Route>
      </Routes>
    </div>
  );
};

export default App;
