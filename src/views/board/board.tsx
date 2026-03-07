import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Link, useLocation, useNavigate, useNavigationType, useParams } from 'react-router-dom';
import { Comment, useAccount, useAccountComments, useAccountSubplebbits, useFeed, useSubplebbit } from '@bitsocialhq/bitsocial-react-hooks';
import { useSubplebbitField } from '../../hooks/use-stable-subplebbit';
import { Virtuoso, VirtuosoHandle, StateSnapshot } from 'react-virtuoso';
import { useTranslation } from 'react-i18next';
import styles from './board.module.css';
import mobileFooterStyles from '../../components/footer/footer.module.css';
import { shouldShowSnow } from '../../lib/snow';
import { useDirectoryAddresses, useDirectories, useDirectoryByAddress } from '../../hooks/use-directories';
import { useFilteredDirectoryAddresses } from '../../hooks/use-filtered-directory-addresses';
import { useResolvedSubplebbitAddress } from '../../hooks/use-resolved-subplebbit-address';
import { useFeedStateString } from '../../hooks/use-state-string';
import useFeedResetStore from '../../stores/use-feed-reset-store';
import useFeedViewSettingsStore from '../../stores/use-feed-view-settings-store';
import { useBoardFeedPageSize } from '../../hooks/use-board-feed-page-size';
import { getPageSlice } from '../../lib/utils/board-feed-pagination';
import { getPageFromFeedPath, getSubplebbitAddress, isDirectoryBoard, normalizeMultiboardFeedPath, stripPageFromFeedPath } from '../../lib/utils/route-utils';
import ErrorDisplay from '../../components/error-display/error-display';
import LoadingEllipsis from '../../components/loading-ellipsis';
import BoardPagination from '../../components/board-pagination';
import { PageFooterDesktop, PageFooterMobile } from '../../components/footer';
import { Post } from '../post';

const lastVirtuosoStates: { [key: string]: StateSnapshot } = {};

/** Board feed always uses 'active' sort; catalog dropdown does not affect board ordering. */
const BOARD_SORT_TYPE = 'active' as const;

interface BoardFooterProps {
  subplebbitAddresses: string[];
  hasMore: boolean;
  combinedFeedLength: number;
  isInAllView: boolean;
  isInSubscriptionsView: boolean;
  isInModView: boolean;
  subplebbitState: string | undefined;
  subscriptionsLength: number;
  accountSubplebbitAddressesLength: number;
  /** Show loading ellipsis. True when infinite scroll, or when pagination + empty feed (initial load). */
  showLoadingEllipsis?: boolean;
}

// Defined outside Board to preserve component identity across renders (Virtuoso optimization)
// The useFeedStateString hook is called here instead of in Board to isolate re-renders
// caused by backend IPFS state changes to just this footer component
const BoardFooter = ({
  subplebbitAddresses,
  hasMore,
  combinedFeedLength,
  isInAllView,
  isInSubscriptionsView,
  isInModView,
  subplebbitState,
  subscriptionsLength,
  accountSubplebbitAddressesLength,
  showLoadingEllipsis = true,
}: BoardFooterProps) => {
  const { t } = useTranslation();

  const loadingStateString = useFeedStateString(subplebbitAddresses) || (combinedFeedLength === 0 ? t('loading_feed') : t('looking_for_more_posts'));

  let footerContent;
  if (combinedFeedLength === 0) {
    footerContent = t('no_threads');
  }
  if (hasMore || (subplebbitAddresses && subplebbitAddresses.length === 0)) {
    footerContent = null;
  }
  return (
    <div className={styles.footer}>
      {footerContent}
      <div>
        {subplebbitState === 'failed' ? (
          <span className='red'>{subplebbitState}</span>
        ) : isInSubscriptionsView && subscriptionsLength === 0 ? (
          <span className='red'>{t('not_subscribed_to_any_board')}</span>
        ) : isInModView && accountSubplebbitAddressesLength === 0 ? (
          <span className='red'>{t('not_mod_of_any_board')}</span>
        ) : (
          showLoadingEllipsis && hasMore && <LoadingEllipsis string={loadingStateString} />
        )}
      </div>
    </div>
  );
};

export interface BoardProps {
  feedCacheKey?: string;
  viewType?: 'all' | 'subs' | 'mod' | 'board';
  boardIdentifier?: string;
  isVisible?: boolean;
}

const Board = ({ feedCacheKey, viewType, boardIdentifier: boardIdentifierProp, isVisible = true }: BoardProps) => {
  const { t } = useTranslation();
  const location = useLocation();
  const params = useParams();
  const isInAllView = viewType ? viewType === 'all' : false;
  const isInSubscriptionsView = viewType ? viewType === 'subs' : false;
  const isInModView = viewType ? viewType === 'mod' : false;

  const directories = useDirectories();
  const resolvedAddressFromUrl = useResolvedSubplebbitAddress();
  const subplebbitAddress = useMemo(() => {
    if (boardIdentifierProp) {
      return getSubplebbitAddress(boardIdentifierProp, directories);
    }
    return resolvedAddressFromUrl;
  }, [boardIdentifierProp, directories, resolvedAddressFromUrl]);

  const directoryAddresses = useDirectoryAddresses();
  const filteredDirectoryAddresses = useFilteredDirectoryAddresses();

  const account = useAccount();
  const subscriptions = account?.subscriptions;

  const { accountSubplebbits } = useAccountSubplebbits();
  const accountSubplebbitAddresses = Object.keys(accountSubplebbits);

  const subplebbitAddresses = useMemo(() => {
    if (isInAllView) {
      return filteredDirectoryAddresses;
    }
    if (isInSubscriptionsView) {
      return subscriptions || [];
    }
    if (isInModView) {
      return accountSubplebbitAddresses;
    }
    return [subplebbitAddress];
  }, [isInAllView, isInSubscriptionsView, isInModView, subplebbitAddress, directoryAddresses, filteredDirectoryAddresses, subscriptions, accountSubplebbitAddresses]);

  const enableInfiniteScroll = useFeedViewSettingsStore((state) => state.enableInfiniteScroll);
  const setEnableInfiniteScroll = useFeedViewSettingsStore((state) => state.setEnableInfiniteScroll);
  const isForcedInfiniteScroll = isInAllView || isInSubscriptionsView || isInModView;
  const effectiveInfiniteScroll = enableInfiniteScroll || isForcedInfiniteScroll;
  const community = useDirectoryByAddress(isInAllView || isInSubscriptionsView || isInModView ? undefined : subplebbitAddress);
  const { guiPostsPerPage, maxGuiPages, paginationFeedPostsPerPage, infiniteFeedPostsPerPage } = useBoardFeedPageSize(community);

  const feedOptions = useMemo(
    () => ({
      subplebbitAddresses,
      sortType: BOARD_SORT_TYPE,
      postsPerPage: effectiveInfiniteScroll ? infiniteFeedPostsPerPage : paginationFeedPostsPerPage,
    }),
    [subplebbitAddresses, effectiveInfiniteScroll, infiniteFeedPostsPerPage, paginationFeedPostsPerPage],
  );

  const { feed, hasMore, loadMore, reset } = useFeed(feedOptions);
  const { accountComments } = useAccountComments();

  const feedContextKey = `${isInAllView ? 'all' : isInSubscriptionsView ? 'subs' : isInModView ? 'mod' : (subplebbitAddress ?? 'board')}-${BOARD_SORT_TYPE}-${viewType ?? 'board'}-${effectiveInfiniteScroll}`;
  const pathWithoutSettings = location.pathname.replace(/\/settings$/, '');
  const currentPage = getPageFromFeedPath(pathWithoutSettings);
  const paginationBasePath = stripPageFromFeedPath(pathWithoutSettings);

  const resetTriggeredRef = useRef(false);

  const setResetFunction = useFeedResetStore((state) => state.setResetFunction);
  useEffect(() => {
    if (isVisible) {
      setResetFunction(reset);
    }
  }, [reset, setResetFunction, feed, isVisible]);

  // show account comments instantly in the feed once published (cid defined), instead of waiting for the feed to update
  const feedCids = useMemo(() => new Set(feed.map((f) => f.cid)), [feed]);
  const filteredComments = useMemo(
    () =>
      accountComments.filter((comment) => {
        const { cid, deleted, postCid, removed, state, timestamp } = comment || {};
        return (
          !deleted &&
          !removed &&
          timestamp > Date.now() / 1000 - 60 * 60 &&
          state === 'succeeded' &&
          cid &&
          cid === postCid &&
          comment?.subplebbitAddress === subplebbitAddress &&
          !feedCids.has(cid)
        );
      }),
    [accountComments, subplebbitAddress, feedCids],
  );

  // show newest account comment at the top of the feed but after pinned posts
  const combinedFeed = useMemo(() => {
    const newFeed = [...feed];
    const lastPinnedIndex = newFeed.map((post) => post.pinned).lastIndexOf(true);
    if (filteredComments.length > 0) {
      newFeed.splice(lastPinnedIndex + 1, 0, ...filteredComments);
    }
    return newFeed;
  }, [feed, filteredComments]);

  const cappedFeed = useMemo(
    () => (effectiveInfiniteScroll ? combinedFeed : combinedFeed.slice(0, guiPostsPerPage * maxGuiPages)),
    [effectiveInfiniteScroll, combinedFeed, guiPostsPerPage, maxGuiPages],
  );
  const totalPages = useMemo(() => Math.min(maxGuiPages, Math.ceil(cappedFeed.length / guiPostsPerPage) || 1), [cappedFeed.length, guiPostsPerPage, maxGuiPages]);
  const currentPageFeed = useMemo(
    () => (effectiveInfiniteScroll ? [] : getPageSlice(cappedFeed, currentPage, guiPostsPerPage, maxGuiPages)),
    [effectiveInfiniteScroll, cappedFeed, currentPage, guiPostsPerPage, maxGuiPages],
  );

  const navigate = useNavigate();

  // Redirect multiboard paths with page-number segments to normalized path (infinite-scroll only)
  useEffect(() => {
    if (!isVisible || !isForcedInfiniteScroll) return;
    const normalized = normalizeMultiboardFeedPath(location.pathname);
    if (normalized !== location.pathname) {
      navigate(normalized, { replace: true });
    }
  }, [isVisible, isForcedInfiniteScroll, location.pathname, navigate]);

  useEffect(() => {
    if (!isVisible) return;
    if (!effectiveInfiniteScroll && currentPage > totalPages && totalPages > 0) {
      const targetPage = totalPages;
      const targetPath = targetPage === 1 ? paginationBasePath : `${paginationBasePath}/${targetPage}`;
      navigate(targetPath, { replace: true });
    }
  }, [isVisible, effectiveInfiniteScroll, currentPage, totalPages, paginationBasePath, navigate]);

  // Scroll to top instantly when page changes in pagination mode
  useEffect(() => {
    if (!effectiveInfiniteScroll) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  }, [effectiveInfiniteScroll, currentPage]);

  useEffect(() => {
    if (filteredComments.length > 0 && !resetTriggeredRef.current) {
      reset();
      resetTriggeredRef.current = true;
    }
  }, [filteredComments, reset]);

  // Use stable subplebbit fields to avoid rerenders from updatingState
  const subplebbitTitle = useSubplebbitField(subplebbitAddress, (sub) => sub?.title);
  const shortAddress = useSubplebbitField(subplebbitAddress, (sub) => sub?.shortAddress);
  // useSubplebbitField only reads from store, doesn't trigger fetching
  const subplebbit = useSubplebbit({ subplebbitAddress });
  const { error: subplebbitError, state: subplebbitState } = subplebbit || {};
  const title = isInAllView ? t('all') : isInSubscriptionsView ? t('subscriptions') : isInModView ? t('mod') : subplebbitTitle;

  // Memoize footer component to preserve identity across renders (Virtuoso optimization)
  // Note: useFeedStateString is called inside BoardFooter to isolate re-renders from backend state changes
  const footerComponents = useMemo(
    () => ({
      Footer: () => (
        <>
          <BoardFooter
            subplebbitAddresses={subplebbitAddresses}
            hasMore={hasMore}
            combinedFeedLength={combinedFeed.length}
            isInAllView={isInAllView}
            isInSubscriptionsView={isInSubscriptionsView}
            isInModView={isInModView}
            subplebbitState={subplebbitState}
            subscriptionsLength={subscriptions?.length || 0}
            accountSubplebbitAddressesLength={accountSubplebbitAddresses?.length || 0}
            showLoadingEllipsis={effectiveInfiniteScroll || combinedFeed.length === 0}
          />
          <PageFooterDesktop
            firstRow={
              <BoardPagination basePath={paginationBasePath} currentPage={currentPage} totalPages={totalPages} footerStyle isMultiboard={isForcedInfiniteScroll} />
            }
          />
          <PageFooterMobile>
            <div>
              {!isForcedInfiniteScroll && (
                <div className={mobileFooterStyles.mobileFooterButtons}>
                  <button className='button' onClick={() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' })}>
                    {t('start_new_thread')}
                  </button>
                </div>
              )}
              <div className={mobileFooterStyles.mobileFooterButtons}>
                <button className='button' onClick={() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' })}>
                  {t('top')}
                </button>
                <button className='button' onClick={() => reset && reset()}>
                  {t('refresh')}
                </button>
              </div>
              <hr />
              {!isForcedInfiniteScroll && !effectiveInfiniteScroll && (
                <>
                  <div className={mobileFooterStyles.mobileFooterPagination}>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <span key={page}>
                        [
                        <Link
                          to={page === 1 ? paginationBasePath : `${paginationBasePath}/${page}`}
                          className={page === currentPage ? mobileFooterStyles.mobileFooterPaginationCurrent : undefined}
                        >
                          {page}
                        </Link>
                        ]
                      </span>
                    ))}
                  </div>
                  <div className={mobileFooterStyles.mobileFooterButtons}>
                    <Link to={`${paginationBasePath}/catalog`} className='button'>
                      {t('catalog')}
                    </Link>
                  </div>
                </>
              )}
              {hasMore && !effectiveInfiniteScroll && (
                <div className={mobileFooterStyles.mobileFooterButtons}>
                  <button className='button' onClick={() => setEnableInfiniteScroll(true)}>
                    {t('load_more')}
                  </button>
                </div>
              )}
            </div>
          </PageFooterMobile>
        </>
      ),
    }),
    [
      subplebbitAddresses,
      hasMore,
      combinedFeed.length,
      isInAllView,
      isInSubscriptionsView,
      isInModView,
      subplebbitState,
      subscriptions?.length,
      accountSubplebbitAddresses?.length,
      effectiveInfiniteScroll,
      isForcedInfiniteScroll,
      paginationBasePath,
      currentPage,
      totalPages,
      setEnableInfiniteScroll,
      reset,
      t,
    ],
  );

  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const virtuosoStateKey = feedCacheKey ? `${feedCacheKey}-${BOARD_SORT_TYPE}` : `${location.pathname}-${BOARD_SORT_TYPE}`;
  const navigationType = useNavigationType();

  const boardItemContent = useCallback((index: number, post: Comment | undefined) => <Post index={index} post={post} />, []);

  const hasBeenVisibleRef = useRef(false);
  useEffect(() => {
    if (isVisible && !hasBeenVisibleRef.current) {
      hasBeenVisibleRef.current = true;
      if (navigationType !== 'POP') {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      }
    }
  }, [isVisible, navigationType]);

  useEffect(() => {
    if (!isVisible) return;

    const currentKey = virtuosoStateKey;
    const setLastVirtuosoState = () => {
      virtuosoRef.current?.getState((snapshot: StateSnapshot) => {
        if (snapshot?.ranges?.length) {
          lastVirtuosoStates[currentKey] = snapshot;
        }
      });
    };
    window.addEventListener('scroll', setLastVirtuosoState);
    return () => window.removeEventListener('scroll', setLastVirtuosoState);
  }, [virtuosoStateKey, isVisible]);

  const lastVirtuosoState = navigationType === 'POP' ? lastVirtuosoStates?.[virtuosoStateKey] : undefined;

  useEffect(() => {
    if (!isVisible) return;
    const boardIdentifier = params.boardIdentifier || boardIdentifierProp;
    const isDirectory = boardIdentifier ? isDirectoryBoard(boardIdentifier, directories) : false;

    let boardTitle: string;
    if (isInAllView) {
      boardTitle = t('all');
    } else if (isInSubscriptionsView) {
      boardTitle = t('subscriptions');
    } else if (isInModView) {
      boardTitle = t('mod');
    } else if (isDirectory) {
      boardTitle = `/${boardIdentifier}/`;
    } else {
      boardTitle = title ? title : shortAddress || subplebbitAddress || '';
    }
    document.title = boardTitle + ' - 5chan';
  }, [title, shortAddress, subplebbitAddress, isVisible, params.boardIdentifier, boardIdentifierProp, directories, isInAllView, isInSubscriptionsView, isInModView, t]);

  const shouldShowErrorToUser = subplebbitError?.message && feed.length === 0;
  const displayFeed = effectiveInfiniteScroll ? combinedFeed : currentPageFeed;

  return (
    <>
      {shouldShowSnow() && <hr />}
      <div className={`${styles.content} ${shouldShowSnow() ? styles.garland : ''}`}>
        {shouldShowErrorToUser && (
          <div className={styles.error}>
            <ErrorDisplay error={subplebbitError} />
          </div>
        )}
        {effectiveInfiniteScroll ? (
          <Virtuoso
            defaultItemHeight={300}
            increaseViewportBy={isInAllView || isInSubscriptionsView || isInModView ? { bottom: 600, top: 600 } : { bottom: 1200, top: 1200 }}
            totalCount={displayFeed.length}
            data={displayFeed}
            computeItemKey={(index, post) => post?.cid || `post-${index}`}
            itemContent={boardItemContent}
            useWindowScroll={true}
            components={footerComponents}
            endReached={hasMore ? loadMore : undefined}
            ref={virtuosoRef}
            restoreStateFrom={lastVirtuosoState}
            initialScrollTop={lastVirtuosoState?.scrollTop}
          />
        ) : (
          <>
            {displayFeed.map((post, index) => (
              <Post key={post?.cid || `post-${index}`} index={index} post={post} />
            ))}
            <footerComponents.Footer />
          </>
        )}
      </div>
    </>
  );
};

export default Board;
