import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useAccount, useAccountComment, useSubplebbit } from '@plebbit/plebbit-react-hooks';
import useAccountsStore from '@plebbit/plebbit-react-hooks/dist/stores/accounts';
import { initSnow, removeSnow } from './lib/snow';
import { isAllView, isModView, isSubscriptionsView } from './lib/utils/view-utils';
import { preloadThemeAssets } from './lib/utils/preload-utils';
import useReplyModalStore from './stores/use-reply-modal-store';
import useCreateBoardModalStore from './stores/use-create-board-modal-store';
import useSpecialThemeStore from './stores/use-special-theme-store';
import useIsMobile from './hooks/use-is-mobile';
import useTheme from './hooks/use-theme';
import { useDirectories } from './hooks/use-directories';
import { useResolvedSubplebbitAddress } from './hooks/use-resolved-subplebbit-address';
import { getSubplebbitAddress, isPostRoute, isPendingPostRoute, isModQueueRoute } from './lib/utils/route-utils';
import styles from './app.module.css';
import { DesktopBoardButtons, MobileBoardButtons } from './components/board-buttons';
import Board from './views/board';
import Blotter from './views/blotter';
import Catalog from './views/catalog';
import FAQ from './views/faq';
import Home from './views/home';
import ModQueueView from './views/mod-queue';
import NotAllowed from './views/not-allowed';
import NotFound from './views/not-found';
import PendingPost from './views/pending-post';
import Post from './views/post';
import Rules from './views/rules';
import BoardHeader from './components/board-header';
import ChallengeModal from './components/challenge-modal';
import FeedCacheContainer from './components/feed-cache-container';
import ReplyModal from './components/reply-modal';
import PostForm from './components/post-form';
import BoardBlotter from './components/board-blotter';
import BoardsBar from './components/boardsbar';

const BoardsBarEditModal = lazy(() => import('./components/boardsbar-edit-modal'));
const CreateBoardModal = lazy(() => import('./components/create-board-modal'));
const DirectoryModal = lazy(() => import('./components/directory-modal'));
const DisclaimerModal = lazy(() => import('./components/disclaimer-modal'));
const SettingsModal = lazy(() => import('./components/settings-modal'));

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
  const isOnPostRoute = isPostRoute(location.pathname);
  const isOnPendingPostRoute = isPendingPostRoute(location.pathname);
  const isOnModQueueRoute = isModQueueRoute(location.pathname);
  const shouldRenderOutlet = isOnPostRoute || isOnPendingPostRoute || isOnModQueueRoute;

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
      <BoardsBar />
      <Suspense fallback={null}>
        <CreateBoardModal />
      </Suspense>
      <Suspense fallback={null}>
        <BoardsBarEditModal />
      </Suspense>
      <Suspense fallback={null}>
        <DirectoryModal />
      </Suspense>
      <Suspense fallback={null}>
        <DisclaimerModal />
      </Suspense>
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
              {!(isInAllView || isInSubscriptionsView || isInModView) && !isOnModQueueRoute && <BoardBlotter />}
              <DesktopBoardButtons />
            </>
          )}
      <FeedCacheContainer />
      {shouldRenderOutlet && <Outlet />}
    </div>
  );
};

const GlobalLayout = () => {
  useTheme();

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
      {isInSettingsView && (
        <Suspense fallback={null}>
          <SettingsModal />
        </Suspense>
      )}
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
  // Feed routes are always rendered by FeedCacheContainer (Virtuoso used for all modes)
  const boardFeedElement = null;
  const catalogFeedElement = null;

  return (
    <div className={styles.app}>
      <Routes>
        <Route element={<GlobalLayout />}>
          <Route path='/' element={<Home />} />
          <Route path='/faq' element={<FAQ />} />
          <Route path='/rules/:boardIdentifier?' element={<Rules />} />
          <Route path='/blotter' element={<Blotter />} />
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
