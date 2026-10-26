import { ComponentType, Suspense, use, useCallback, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { useAccount, useCommunity } from '@bitsocial/bitsocial-react-hooks';
import { lazyImport } from './lib/import-failures';
import { preloadThemeAssets, preloadUiIcons, scheduleIdlePreload } from './lib/utils/preload-utils';
import { hasModQueueAccessRole } from './lib/utils/mod-access';
import type { PostProps } from './lib/utils/post-props';
import useImageFiltersStore from './stores/use-image-filters-store';
import useReplyModalStore from './stores/use-reply-modal-store';
import { useAccountCommunityAddresses } from './hooks/use-account-community-addresses';
import useTheme from './hooks/use-theme';
import { useDirectoryVoteRefresh } from './hooks/use-directory-vote-refresh';
import { useBrowserPureP2PAccountUpgrade } from './hooks/use-browser-pure-p2p-account-upgrade';
import { useCommunityIdentifier } from './hooks/use-community-identifiers';
import { useResolvedCommunityAddress } from './hooks/use-resolved-community-address';
import { QuotePreviewPostContext } from './hooks/use-quote-preview-post';
import useSuspendOffscreenMediaPlayback from './hooks/use-suspend-offscreen-media-playback';
import { getPageDraftKey } from './lib/utils/location-draft-utils';
import { BOARD_ROUTES_ID, loadBoardRoutes, registerRouteTree } from './route-modules';
import styles from './app.module.css';
import Home from './views/home';
import NotAllowed from './views/not-allowed';
import NotFound from './views/not-found';
import FramesLayout from './components/frames-layout';
import ExternalQuoteStatus from './components/external-quote-status';
import ImportErrorBoundary, { ImportError } from './components/import-error-boundary';
import Prefetcher from './components/prefetcher';
import { ModEmptyState } from './components/mod-empty-state';

const AccountDataEditor = lazyImport(() => import('./views/account-data-editor'));
const BoardSettings = lazyImport(() => import('./views/board-settings'));
const ChallengeModal = lazyImport(() => import('./components/challenge-modal'));
const ImageFilterNotice = lazyImport(() => import('./components/image-filter-notice'));
const DirectoryModal = lazyImport(() => import('./components/directory-modal'));
const DisclaimerModal = lazyImport(() => import('./components/disclaimer-modal'));
const loadReplyModal = () => import('./components/reply-modal');
const ReplyModal = lazyImport(loadReplyModal);
const SettingsUpgradeModal = lazyImport(() => import('./components/settings-upgrade-modal'));
const loadSettingsModal = () => import('./components/settings-modal');
const SettingsModal = lazyImport(loadSettingsModal);
// Views that visitors rarely land on load after the first render instead of before it (see the idle
// preload below).
const secondaryViewLoaders = {
  archive: () => import('./views/archive'),
  blotter: () => import('./views/blotter'),
  directory: () => import('./views/directory'),
  faq: () => import('./views/faq'),
  modQueue: () => import('./views/mod-queue'),
  pass: () => import('./views/pass'),
  rules: () => import('./views/rules'),
  search: () => import('./views/search'),
  searchDirectory: () => import('./views/search-directory'),
};
// Each lazy view gets its own boundary. One around a layout's outlet would also catch eager views
// that suspend (on translations, for example) and commit the layout with an empty page first.
const lazyView = (load: () => Promise<{ default: ComponentType }>) => {
  const View = lazyImport(load);
  return () => (
    <ImportErrorBoundary>
      <Suspense fallback={null}>
        <View />
      </Suspense>
    </ImportErrorBoundary>
  );
};
const Archive = lazyView(secondaryViewLoaders.archive);
const Blotter = lazyView(secondaryViewLoaders.blotter);
const Directory = lazyView(secondaryViewLoaders.directory);
const Faq = lazyView(secondaryViewLoaders.faq);
const ModQueueView = lazyView(secondaryViewLoaders.modQueue);
const Pass = lazyView(secondaryViewLoaders.pass);
const Rules = lazyView(secondaryViewLoaders.rules);
const Search = lazyView(secondaryViewLoaders.search);
const SearchDirectory = lazyView(secondaryViewLoaders.searchDirectory);

// The board routes load on demand (see route-modules.ts). Their layout has no Suspense boundary of its
// own: like the eager views, a render that suspends keeps the static frame on the first commit and the
// previous page on a navigation, where a boundary would commit an empty layout first.
const BoardLayoutRoute = () => {
  const { BoardLayout } = use(loadBoardRoutes());
  return <BoardLayout />;
};
const PostRoute = () => {
  const { PostView } = use(loadBoardRoutes());
  return <PostView />;
};
const PendingPostRoute = () => {
  const { PendingPostView } = use(loadBoardRoutes());
  return <PendingPostView />;
};

const boardLayoutElement = (
  <ImportErrorBoundary>
    <BoardLayoutRoute />
  </ImportErrorBoundary>
);

// Quote previews render a post from the board routes chunk. Outside the board routes (a board's rules)
// the preview waits for it.
const QuotePreviewPost = (props: PostProps) => {
  const { Post } = use(loadBoardRoutes());
  return <Post {...props} />;
};
const renderQuotePreviewPost = (props: PostProps) => (
  <ImportErrorBoundary fallback={null}>
    <Suspense fallback={null}>
      <QuotePreviewPost {...props} />
    </Suspense>
  </ImportErrorBoundary>
);

// Preload all theme assets (buttons, backgrounds) immediately on app load
// to prevent visible loading delays when switching themes
preloadThemeAssets();
// Warm the board routes, reply modal, settings modal, and secondary view chunks, and the icons they
// use, so the first "No." click or navigation does not wait for a lazy import (routes render without
// transitions).
const preloadLazyChunks = () => {
  void loadBoardRoutes();
  void loadReplyModal();
  void loadSettingsModal();
  Object.values(secondaryViewLoaders).forEach((load) => void load());
  preloadUiIcons();
};

const GlobalLayout = () => {
  useTheme({ applyDocumentEffects: true });
  useSuspendOffscreenMediaPlayback();
  const directoryVoteRefreshDownloadFailed = useDirectoryVoteRefresh();

  const location = useLocation();
  const { pathname } = location;
  const locationDraftKey = getPageDraftKey(location);
  const { activeCid, parentNumber, threadNumber, threadCid, activeCommunityAddress, showReplyModal, scrollY } = useReplyModalStore(
    useShallow((state) => {
      const modal = state.modals[locationDraftKey];
      return {
        activeCid: modal?.activeCid,
        parentNumber: modal?.parentNumber ?? null,
        threadNumber: modal?.threadNumber ?? null,
        threadCid: modal?.threadCid,
        activeCommunityAddress: modal?.communityAddress,
        showReplyModal: modal?.showReplyModal ?? false,
        scrollY: modal?.scrollY ?? 0,
      };
    }),
  );
  const closeReplyModal = useReplyModalStore((state) => state.closeModal);
  const closeModal = useCallback(() => closeReplyModal(locationDraftKey), [closeReplyModal, locationDraftKey]);
  const isInSettingsView = pathname.endsWith('/settings');
  // The notice only exists after a quick filter, so its code loads then instead of with the app.
  const hasImageFilterNotice = useImageFiltersStore((state) => state.quickFilterNotice !== null);

  return (
    <>
      <ExternalQuoteStatus />
      {hasImageFilterNotice && (
        <ImportErrorBoundary floating>
          <Suspense fallback={null}>
            <ImageFilterNotice />
          </Suspense>
        </ImportErrorBoundary>
      )}
      <Prefetcher />
      {directoryVoteRefreshDownloadFailed && <ImportError floating />}
      {/* A boundary per modal, so one that failed to download does not take the others (challenges) with it. */}
      <Suspense fallback={null}>
        <ImportErrorBoundary floating>
          <DirectoryModal />
        </ImportErrorBoundary>
        <ImportErrorBoundary floating>
          <DisclaimerModal />
        </ImportErrorBoundary>
      </Suspense>
      <ImportErrorBoundary floating>
        <Suspense fallback={null}>
          <ChallengeModal />
        </Suspense>
      </ImportErrorBoundary>
      <ImportErrorBoundary floating>
        <Suspense fallback={null}>
          <SettingsUpgradeModal />
        </Suspense>
      </ImportErrorBoundary>
      {activeCid && threadCid && activeCommunityAddress && (
        <ImportErrorBoundary floating>
          <Suspense fallback={null}>
            <ReplyModal
              key={locationDraftKey}
              closeModal={closeModal}
              locationDraftKey={locationDraftKey}
              parentCid={activeCid}
              parentNumber={parentNumber}
              threadNumber={threadNumber}
              postCid={threadCid}
              scrollY={scrollY}
              showReplyModal={showReplyModal}
              communityAddress={activeCommunityAddress}
            />
          </Suspense>
        </ImportErrorBoundary>
      )}
      {isInSettingsView && (
        <ImportErrorBoundary floating>
          <Suspense fallback={null}>
            <SettingsModal />
          </Suspense>
        </ImportErrorBoundary>
      )}
      <FramesLayout>
        <Outlet />
      </FramesLayout>
    </>
  );
};

const ModQueueRoute = () => {
  const { boardIdentifier } = useParams();
  const account = useAccount();
  const accountAddress = account?.author?.address;
  const communityAddress = useResolvedCommunityAddress();
  const communityIdentifier = useCommunityIdentifier(communityAddress);
  const community = useCommunity(communityIdentifier ? { community: communityIdentifier } : undefined);
  const accountCommunityAddresses = useAccountCommunityAddresses();

  if (!account) {
    return null;
  }

  if (!accountAddress) {
    return <Navigate to='/not-allowed' replace />;
  }

  if (!boardIdentifier) {
    return accountCommunityAddresses.length > 0 ? <ModQueueView /> : <ModEmptyState />;
  }

  // Wait for board role metadata before enforcing access to avoid false redirects during initial load.
  const boardState = community?.state;
  const isBoardLoading = !community || !boardState || (boardState !== 'succeeded' && boardState !== 'failed');
  if (isBoardLoading) {
    return null;
  }

  const accountRole = community?.roles?.[accountAddress]?.role;
  return hasModQueueAccessRole(accountRole) ? <ModQueueView /> : <Navigate to='/not-allowed' replace />;
};

// Feed routes are always rendered by FeedCacheContainer (Virtuoso used for all modes)
const boardFeedElement = null;
const catalogFeedElement = null;

const appRoutes = (
  <Route element={<GlobalLayout />}>
    <Route path='/' element={<Home />} />
    <Route path='/faq' element={<Faq />} />
    <Route path='/pass' element={<Pass />} />
    <Route path='/rules' element={<Rules />} />
    <Route path='/rules/*' element={<Navigate to='/not-found' replace />} />
    <Route path='/blotter' element={<Blotter />} />
    <Route
      path='/settings/account-data'
      element={
        <ImportErrorBoundary>
          <Suspense fallback={null}>
            <AccountDataEditor />
          </Suspense>
        </ImportErrorBoundary>
      }
    />
    <Route
      path='/:boardIdentifier/board-settings'
      element={
        <ImportErrorBoundary>
          <Suspense fallback={null}>
            <BoardSettings />
          </Suspense>
        </ImportErrorBoundary>
      }
    />
    <Route id={BOARD_ROUTES_ID} element={boardLayoutElement}>
      {/* Canonical multiboard routes (time filter lives in ?t=) */}
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

      <Route path='/mod/queue' element={<ModQueueRoute />} />
      <Route path='/mod/queue/settings' element={<ModQueueRoute />} />
      <Route path='/all/archive' element={<Navigate to='/not-found' replace />} />
      <Route path='/all/archive/settings' element={<Navigate to='/not-found' replace />} />
      <Route path='/subs/archive' element={<Navigate to='/not-found' replace />} />
      <Route path='/subs/archive/settings' element={<Navigate to='/not-found' replace />} />
      <Route path='/mod/archive' element={<Navigate to='/not-found' replace />} />
      <Route path='/mod/archive/settings' element={<Navigate to='/not-found' replace />} />
      <Route path='/all/directory' element={<Navigate to='/not-found' replace />} />
      <Route path='/all/directory/settings' element={<Navigate to='/not-found' replace />} />
      <Route path='/subs/directory' element={<Navigate to='/not-found' replace />} />
      <Route path='/subs/directory/settings' element={<Navigate to='/not-found' replace />} />
      <Route path='/mod/directory' element={<Navigate to='/not-found' replace />} />
      <Route path='/mod/directory/settings' element={<Navigate to='/not-found' replace />} />
      <Route path='/directory' element={<Navigate to='/not-found' replace />} />
      <Route path='/directory/settings' element={<Navigate to='/not-found' replace />} />

      <Route path='/search' element={<Search />} />
      <Route path='/search/settings' element={<Search />} />
      <Route path='/search/catalog' element={<Search />} />
      <Route path='/search/catalog/settings' element={<Search />} />
      <Route path='/search/directory' element={<SearchDirectory />} />
      <Route path='/search/directory/settings' element={<SearchDirectory />} />

      {/* Invalid subpaths: old URLs and unknown paths -> not-found */}
      <Route path='/mod/modqueue' element={<Navigate to='/not-found' replace />} />
      <Route path='/mod/modqueue/settings' element={<Navigate to='/not-found' replace />} />
      <Route path='/all/*' element={<Navigate to='/not-found' replace />} />
      <Route path='/subs/*' element={<Navigate to='/not-found' replace />} />
      <Route path='/mod/*' element={<Navigate to='/not-found' replace />} />
      <Route path='/search/*' element={<Navigate to='/not-found' replace />} />

      <Route path='/:boardIdentifier/catalog' element={catalogFeedElement} />
      <Route path='/:boardIdentifier/catalog/settings' element={catalogFeedElement} />
      <Route path='/:boardIdentifier/:pageNumber' element={boardFeedElement} />
      <Route path='/:boardIdentifier/:pageNumber/settings' element={boardFeedElement} />
      <Route path='/:boardIdentifier' element={boardFeedElement} />
      <Route path='/:boardIdentifier/settings' element={boardFeedElement} />
      <Route path='/:boardIdentifier/archive' element={<Archive />} />
      <Route path='/:boardIdentifier/archive/settings' element={<Archive />} />
      <Route path='/:boardIdentifier/directory' element={<Directory />} />
      <Route path='/:boardIdentifier/directory/settings' element={<Directory />} />

      <Route path='/:boardIdentifier/mod/queue' element={<ModQueueRoute />} />
      <Route path='/:boardIdentifier/mod/queue/settings' element={<ModQueueRoute />} />

      <Route path='/:boardIdentifier/modqueue' element={<Navigate to='/not-found' replace />} />
      <Route path='/:boardIdentifier/modqueue/settings' element={<Navigate to='/not-found' replace />} />
      <Route path='/:boardIdentifier/mod' element={<Navigate to='/not-found' replace />} />
      <Route path='/:boardIdentifier/mod/*' element={<Navigate to='/not-found' replace />} />

      <Route path='/:boardIdentifier/thread/:commentCid' element={<PostRoute />} />
      <Route path='/:boardIdentifier/thread/:commentCid/settings' element={<PostRoute />} />

      <Route path='/pending/:accountCommentIndex' element={<PendingPostRoute />} />
      <Route path='/pending/:accountCommentIndex/settings' element={<PendingPostRoute />} />
    </Route>
    <Route path='/not-allowed' element={<NotAllowed />} />
    <Route path='/not-found' element={<NotFound />} />
    <Route path='*' element={<NotFound />} />
  </Route>
);

registerRouteTree(appRoutes);

const App = () => {
  useBrowserPureP2PAccountUpgrade();
  // Start after the first route has committed, in idle time, so these downloads never compete with it.
  useEffect(() => {
    scheduleIdlePreload(preloadLazyChunks);
  }, []);

  return (
    <div className={styles.app}>
      <QuotePreviewPostContext.Provider value={renderQuotePreviewPost}>
        <Routes>{appRoutes}</Routes>
      </QuotePreviewPostContext.Provider>
    </div>
  );
};

export default App;
