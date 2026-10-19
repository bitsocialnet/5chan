// The board, catalog, thread, and pending-post routes: their layout and views, with the post form,
// feeds, and post components only they render. app.tsx loads this module on demand (see
// route-modules.ts), so the home page does not download it before its first render.
import { Activity, Suspense, useEffect } from 'react';
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { useAccountComment } from '@bitsocial/bitsocial-react-hooks';
import { lazyImport } from './lib/import-failures';
import { initSnow, removeSnow } from './lib/snow';
import { isAllView, isCatalogView, isModView, isSubscriptionsView } from './lib/utils/view-utils';
import useCreateBoardModalStore from './stores/use-create-board-modal-store';
import usePendingPostNavigationStore from './stores/use-pending-post-navigation-store';
import useSpecialThemeStore, { shouldShowSnow } from './stores/use-special-theme-store';
import useIsMobile from './hooks/use-is-mobile';
import { useDirectories } from './hooks/use-directories';
import { useResolvedCommunityAddress, useResolvedDirectoryBoardPath } from './hooks/use-resolved-community-address';
import { useDirectoryCandidateRecords } from './hooks/use-directory-candidate-records';
import { normalizeAccountCommentIndex } from './lib/utils/account-comment-index-utils';
import { getCommentCommunityAddress } from './lib/utils/comment-utils';
import { getPendingPostRoutePost } from './lib/utils/pending-post-route-state';
import {
  getBoardPath,
  isBoardModRoute,
  isDirectoryBoard,
  isArchiveRoute,
  isDirectoryListRoute,
  isSearchRoute,
  isLegacyBoardModQueueRoute,
  isPostRoute,
  isPendingPostRoute,
  isModQueueRoute,
  isValidBoardModRoute,
  isValidModRoute,
  isFlashBoardRoute,
  isBoardFeedPageNumber,
  getCatalogSearchRoute,
} from './lib/utils/route-utils';
import styles from './board-routes.module.css';
import { DesktopBoardButtons, MobileAllFeedFilter, MobileBoardButtons } from './components/board-buttons';
import Board from './views/board';
import Catalog from './views/catalog';
import BoardHeader from './components/board-header';
import FeedCacheContainer from './components/feed-cache-container';
import PostForm from './components/post-form';
import BoardBlotter from './components/board-blotter';
import BoardsBar from './components/boards-bar';
import ImportErrorBoundary from './components/import-error-boundary';

export { Post } from './components/post';
export { default as PendingPostView } from './views/pending-post';
export { default as PostView } from './views/post';

const BoardsBarEditModal = lazyImport(() => import('./components/boards-bar-edit-modal'));
const CreateBoardModal = lazyImport(() => import('./components/create-board-modal'));

const getPostFormRouteKeyPath = (pathname: string) => pathname.replace(/\/settings$/, '').replace(/\/$/, '');

const getPageOneCanonicalPath = (boardIdentifier: string, pathname: string) => `/${boardIdentifier}${pathname.endsWith('/settings') ? '/settings' : ''}`;

// A leaf of its own, so candidate record updates do not rerender the board layout.
const DirectoryCandidateRecords = ({ boardIdentifier }: { boardIdentifier: string | undefined }) => {
  useDirectoryCandidateRecords(boardIdentifier);
  return null;
};

export const BoardLayout = () => {
  const params = useParams();
  const isNavigatingToPendingPost = usePendingPostNavigationStore((state) => state.isNavigatingToPendingPost);
  const { accountCommentIndex, boardIdentifier, pageNumber } = params;
  const { pathname, search, hash, state } = useLocation();
  const isMobile = useIsMobile();
  const isInAllView = isAllView(pathname);
  const isInSubscriptionsView = isSubscriptionsView(pathname, useParams());
  const isInModView = isModView(pathname);
  const directories = useDirectories();
  const communityAddress = useResolvedCommunityAddress(boardIdentifier);
  const { boardPath: resolvedDirectoryBoardPath, isDirectoryCandidate } = useResolvedDirectoryBoardPath(boardIdentifier);
  const pendingPost = useAccountComment({ commentIndex: normalizeAccountCommentIndex(accountCommentIndex) });
  const pendingPostCommunityAddress = getCommentCommunityAddress(pendingPost) || getCommentCommunityAddress(getPendingPostRoutePost(state));
  const { closeCreateBoardModal } = useCreateBoardModalStore();
  const isOnPostRoute = isPostRoute(pathname);
  const isOnPendingPostRoute = isPendingPostRoute(pathname);
  const isOnModQueueRoute = isModQueueRoute(pathname);
  const isOnArchiveRoute = isArchiveRoute(pathname);
  const isOnDirectoryRoute = isDirectoryListRoute(pathname);
  const isOnSearchRoute = isSearchRoute(pathname);
  const shouldRenderOutlet = isOnPostRoute || isOnPendingPostRoute || isOnModQueueRoute || isOnArchiveRoute || isOnDirectoryRoute || isOnSearchRoute;
  const shouldRenderBoardBlotter = !isOnArchiveRoute && !isOnDirectoryRoute && !isOnSearchRoute && !isOnModQueueRoute;
  const isInCatalogView = isCatalogView(pathname, params);
  // Christmas snow
  const { isEnabled: isSpecialEnabled } = useSpecialThemeStore();
  useEffect(() => {
    if (isSpecialEnabled && shouldShowSnow() && !isMobile) {
      initSnow({ flakeCount: 150 });
    }
    return () => {
      removeSnow();
    };
  }, [isSpecialEnabled, isMobile]);

  // Close create board modal when navigating to a different page
  useEffect(() => {
    closeCreateBoardModal();
  }, [pathname, closeCreateBoardModal]);

  // force rerender of post form when navigating between pages, except when opening settings modal in current view
  const key = `${communityAddress}-${getPostFormRouteKeyPath(pathname)}`;

  if (pageNumber === '1' && boardIdentifier) {
    return <Navigate to={{ pathname: getPageOneCanonicalPath(boardIdentifier, pathname), search, hash }} replace />;
  }

  if (boardIdentifier && pageNumber && !isBoardFeedPageNumber(pageNumber)) {
    return <Navigate to={getCatalogSearchRoute(boardIdentifier, pageNumber, search, { settings: pathname.endsWith('/settings') })} replace />;
  }

  if (isCatalogView(pathname, params) && isFlashBoardRoute(boardIdentifier, directories)) {
    return <Navigate to='/not-found' replace />;
  }

  // Invalid /mod/ paths (e.g. /mod/modqueue, /mod/asdoijasd) -> not-found
  if (pathname.startsWith('/mod/') && !isValidModRoute(pathname)) {
    return <Navigate to='/not-found' replace />;
  }

  if (isLegacyBoardModQueueRoute(pathname)) {
    return <Navigate to='/not-found' replace />;
  }

  // Invalid board-scoped mod paths (e.g. /biz/mod, /biz/mod/asdoijasd) -> not-found
  if (isBoardModRoute(pathname) && !isValidBoardModRoute(pathname)) {
    return <Navigate to='/not-found' replace />;
  }

  // Normalize address URLs to directory codes: /anime-and-manga.eth/thread/xxx -> /a/thread/xxx
  if (boardIdentifier && !isDirectoryBoard(boardIdentifier, directories)) {
    const canonicalBoardIdentifier = resolvedDirectoryBoardPath ?? (isDirectoryCandidate ? boardIdentifier : getBoardPath(boardIdentifier, directories));
    if (canonicalBoardIdentifier !== boardIdentifier) {
      const canonicalPath = pathname.replace(`/${boardIdentifier}`, `/${canonicalBoardIdentifier}`);
      return <Navigate to={canonicalPath + (search || '') + (hash || '')} replace />;
    }
  }

  return (
    <div className={styles.boardLayout}>
      <DirectoryCandidateRecords boardIdentifier={boardIdentifier} />
      <BoardsBar persistable />
      <ImportErrorBoundary floating>
        <Suspense fallback={null}>
          <CreateBoardModal />
        </Suspense>
      </ImportErrorBoundary>
      <ImportErrorBoundary floating>
        <Suspense fallback={null}>
          <BoardsBarEditModal />
        </Suspense>
      </ImportErrorBoundary>
      <BoardHeader />
      {isMobile
        ? (communityAddress || isInAllView || isInModView || isInSubscriptionsView || pendingPostCommunityAddress || isOnModQueueRoute) &&
          !isOnArchiveRoute &&
          !isOnDirectoryRoute &&
          (isInCatalogView ? (
            <>
              <PostForm key={key} />
              <MobileBoardButtons />
            </>
          ) : (
            <>
              <MobileBoardButtons />
              <PostForm key={key} />
              {isInAllView && <MobileAllFeedFilter />}
            </>
          ))
        : (communityAddress || isInAllView || isInModView || isInSubscriptionsView || pendingPostCommunityAddress || isOnModQueueRoute) &&
          !isOnArchiveRoute &&
          !isOnDirectoryRoute && (
            <>
              <PostForm key={key} />
              {shouldRenderBoardBlotter ? <BoardBlotter /> : null}
              <DesktopBoardButtons />
            </>
          )}
      {!isOnModQueueRoute && !isOnSearchRoute && (
        <Activity mode={isNavigatingToPendingPost ? 'hidden' : 'visible'}>
          <FeedCacheContainer boardView={Board} catalogView={Catalog} />
        </Activity>
      )}
      {shouldRenderOutlet && <Outlet key='board-layout-outlet' />}
    </div>
  );
};
