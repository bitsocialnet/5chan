import { useEffect, useState } from 'react';
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
import FAQ from './views/faq';
import Home from './views/home';
import Rules from './views/rules';
import NotFound from './views/not-found';
import NotAllowed from './views/not-allowed';
import PendingPost from './views/pending-post';
import Post from './views/post';
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

  const isOnPostRoute = isPostRoute(location.pathname);
  const isOnPendingPostRoute = isPendingPostRoute(location.pathname);
  const isOnModQueueRoute = isModQueueRoute(location.pathname);

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
      <FeedCacheContainer />
      {(isOnPostRoute || isOnPendingPostRoute || isOnModQueueRoute) && <Outlet />}
    </div>
  );
};

const GlobalLayout = () => {
  const [theme, setTheme] = useState('');
  const [currentTheme] = useTheme();

  useEffect(() => {
    if (currentTheme !== theme) {
      setTheme(currentTheme);
    }
  }, [currentTheme, theme]);

  useEffect(() => {
    if (theme) {
      document.body.classList.add(theme);
      return () => {
        document.body.classList.remove(theme);
      };
    }
  }, [theme]);

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

const App = () => (
  <div className={styles.app}>
    <Routes>
      <Route element={<GlobalLayout />}>
        <Route path='/' element={<Home />} />
        <Route path='/faq' element={<FAQ />} />
        <Route path='/rules' element={<Rules />} />
        <Route element={<BoardLayout />}>
          <Route path='/all/:timeFilterName?' element={null} />
          <Route path='/all/:timeFilterName?/settings' element={null} />
          <Route path='/all/catalog/:timeFilterName?' element={null} />
          <Route path='/all/catalog/:timeFilterName?/settings' element={null} />

          <Route path='/subs/:timeFilterName?' element={null} />
          <Route path='/subs/:timeFilterName?/settings' element={null} />
          <Route path='/subs/catalog/:timeFilterName?' element={null} />
          <Route path='/subs/catalog/:timeFilterName?/settings' element={null} />

          <Route path='/mod/:timeFilterName?' element={null} />
          <Route path='/mod/:timeFilterName?/settings' element={null} />
          <Route path='/mod/catalog/:timeFilterName?' element={null} />
          <Route path='/mod/catalog/:timeFilterName?/settings' element={null} />

          <Route path='/mod/modqueue' element={<ModQueueRoute />} />
          <Route path='/mod/modqueue/settings' element={<ModQueueRoute />} />

          <Route path='/:boardIdentifier' element={null} />
          <Route path='/:boardIdentifier/settings' element={null} />
          <Route path='/:boardIdentifier/catalog' element={null} />
          <Route path='/:boardIdentifier/catalog/settings' element={null} />

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

export default App;
