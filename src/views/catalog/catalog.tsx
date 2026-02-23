import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate, useNavigationType, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Comment, useAccount, useFeed, useSubplebbit, useAccountComments } from '@plebbit/plebbit-react-hooks';
import { Virtuoso, VirtuosoHandle, StateSnapshot } from 'react-virtuoso';
import useCatalogFeedRows from '../../hooks/use-catalog-feed-rows';
import { useDirectories, useDirectoryByAddress } from '../../hooks/use-directories';
import { useBoardFeedPageSize } from '../../hooks/use-board-feed-page-size';
import { useFilteredDirectoryAddresses } from '../../hooks/use-filtered-directory-addresses';
import { useResolvedSubplebbitAddress } from '../../hooks/use-resolved-subplebbit-address';
import { useFeedStateString } from '../../hooks/use-state-string';
import useWindowWidth from '../../hooks/use-window-width';
import useCatalogStyleStore from '../../stores/use-catalog-style-store';
import useFeedResetStore from '../../stores/use-feed-reset-store';
import useFeedViewSettingsStore from '../../stores/use-feed-view-settings-store';
import useSortingStore from '../../stores/use-sorting-store';
import useCatalogFiltersStore from '../../stores/use-catalog-filters-store';
import { getSubplebbitAddress, isDirectoryBoard, normalizeMultiboardFeedPath } from '../../lib/utils/route-utils';
import CatalogRow from '../../components/catalog-row';
import { CatalogFooterFirstRow, PageFooterDesktop } from '../../components/footer';
import LoadingEllipsis from '../../components/loading-ellipsis';
import ErrorDisplay from '../../components/error-display/error-display';
import styles from './catalog.module.css';
import { commentMatchesPattern } from '../../lib/utils/pattern-utils';
import { sortCatalogFeedForDisplay } from '../../lib/utils/catalog-sort';

const lastVirtuosoStates: { [key: string]: StateSnapshot } = {};

interface CatalogFooterProps {
  subplebbitAddresses: string[];
  hasMore: boolean;
  combinedFeedLength: number;
  isInAllView: boolean;
  isInSubscriptionsView: boolean;
  isInModView: boolean;
  /** When false, suppress the loading ellipsis (e.g. non-infinite mode) */
  showLoadingEllipsis?: boolean;
}

// Defined outside Catalog to preserve component identity across renders (Virtuoso optimization)
// The useFeedStateString hook is called here instead of in Catalog to isolate re-renders
// caused by backend IPFS state changes to just this footer component
const CatalogFooter = ({
  subplebbitAddresses,
  hasMore,
  combinedFeedLength,
  isInAllView,
  isInSubscriptionsView,
  isInModView,
  showLoadingEllipsis = true,
}: CatalogFooterProps) => {
  const { t } = useTranslation();

  const loadingStateString = useFeedStateString(subplebbitAddresses) || (combinedFeedLength === 0 ? t('loading_feed') : t('looking_for_more_posts'));

  let footerContent;
  if (combinedFeedLength === 0) {
    footerContent = t('no_threads');
  }
  if (hasMore || (subplebbitAddresses && subplebbitAddresses.length === 0)) {
    footerContent = (
      <>
        {showLoadingEllipsis && (
          <div className={styles.stateString}>
            <LoadingEllipsis string={loadingStateString} />
          </div>
        )}
      </>
    );
  }
  return <div className={styles.footer}>{footerContent}</div>;
};

// Separate component for the loading state when there's no feed
// This also calls useFeedStateString internally to isolate re-renders
interface CatalogLoadingProps {
  subplebbitAddresses: string[];
  hasMore: boolean;
  combinedFeedLength: number;
  state: string | undefined;
  subscriptionsLength: number;
  error: Error | undefined;
}

const CatalogLoading = ({ subplebbitAddresses, hasMore, combinedFeedLength, state, subscriptionsLength, error }: CatalogLoadingProps) => {
  const { t } = useTranslation();

  const rawFeedStateString = useFeedStateString(subplebbitAddresses);
  const loadingStateString = rawFeedStateString || (combinedFeedLength === 0 ? t('loading_feed') : t('looking_for_more_posts'));

  return (
    <div className={styles.stateString}>
      {state === 'failed' ? (
        <span className='red'>{state}</span>
      ) : subscriptionsLength === 0 ? (
        <span className='red'>{t('not_subscribed_to_any_board')}</span>
      ) : !hasMore && combinedFeedLength === 0 ? (
        t('no_threads')
      ) : (
        hasMore && <LoadingEllipsis string={loadingStateString} />
      )}
      <ErrorDisplay error={error} />
    </div>
  );
};

const createContentFilter = (
  filterItems: { text: string; enabled: boolean; count: number; filteredCids: Set<string>; hide: boolean; top: boolean; color?: string }[],
  subplebbitAddress: string,
  onFilterMatch?: (filterIndex: number, cid: string, subplebbitAddress: string) => void,
) => {
  // Create a unique key based on the enabled filter items
  const enabledFilters = filterItems.filter((item) => item.enabled && item.text.trim() !== '');
  const filterKey =
    enabledFilters.length > 0
      ? `content-filter-${enabledFilters.map((item) => `${item.text}-${item.hide ? 'hide' : ''}-${item.top ? 'top' : ''}`).join('-')}`
      : 'no-content-filter';

  return {
    filter: (comment: Comment) => {
      if (!comment?.cid) return true;

      if (enabledFilters.length === 0) return true;

      // Check if any enabled filter matches the content
      for (let i = 0; i < enabledFilters.length; i++) {
        const item = enabledFilters[i];
        const pattern = item.text;

        if (commentMatchesPattern(comment, pattern)) {
          // Find the original filter index to increment count
          const filterIndex = filterItems.findIndex((f) => f.text === item.text && f.enabled);
          if (filterIndex !== -1) {
            if (onFilterMatch) {
              onFilterMatch(filterIndex, comment.cid, subplebbitAddress);
            } else {
              // Fallback to the store method if no callback provided
              useCatalogFiltersStore.getState().incrementFilterCount(filterIndex, comment.cid, subplebbitAddress);
            }

            // If the filter has a color, track it in the matchedFilters map
            if (item.color) {
              useCatalogFiltersStore.getState().setMatchedFilter(comment.cid, item.color);
            }
          }

          // If this filter is set to hide, filter out the comment
          if (item.hide) {
            return false;
          }

          // If this filter is set to top, we'll handle it separately in the component
          // (we don't filter it out here)
        }
      }

      return true;
    },
    key: filterKey,
  };
};

const createCombinedFilter = (
  filterItems: { text: string; enabled: boolean; count: number; filteredCids: Set<string>; hide: boolean; top: boolean; color?: string }[],
  searchText: string,
  subplebbitAddress: string,
  onFilterMatch?: (filterIndex: number, cid: string, subplebbitAddress: string) => void,
) => {
  const contentFilter = createContentFilter(filterItems, subplebbitAddress, onFilterMatch);

  const searchFilter = {
    filter: (comment: Comment) => {
      if (!searchText.trim()) return true;
      return commentMatchesPattern(comment, searchText);
    },
    key: searchText ? `search-filter-${searchText}` : 'no-search-filter',
  };

  return {
    filter: (comment: Comment) => {
      if (!contentFilter.filter(comment)) return false;
      if (!searchFilter.filter(comment)) return false;

      return true;
    },
    key: `${contentFilter.key}-${searchFilter.key}`,
  };
};

export interface CatalogProps {
  feedCacheKey?: string;
  viewType?: 'all' | 'subs' | 'mod' | 'board';
  boardIdentifier?: string;
  isVisible?: boolean;
}

const Catalog = ({ feedCacheKey, viewType, boardIdentifier: boardIdentifierProp, isVisible = true }: CatalogProps) => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();

  const isInAllView = viewType ? viewType === 'all' : false;
  const isInSubscriptionsView = viewType ? viewType === 'subs' : false;
  const isInModView = viewType ? viewType === 'mod' : false;

  const enableInfiniteScroll = useFeedViewSettingsStore((state) => state.enableInfiniteScroll);
  const isForcedInfiniteScroll = isInAllView || isInSubscriptionsView || isInModView;
  const effectiveInfiniteScroll = enableInfiniteScroll || isForcedInfiniteScroll;

  const directories = useDirectories();
  const resolvedAddressFromUrl = useResolvedSubplebbitAddress();
  const subplebbitAddress = useMemo(() => {
    if (boardIdentifierProp) {
      return getSubplebbitAddress(boardIdentifierProp, directories);
    }
    return resolvedAddressFromUrl;
  }, [boardIdentifierProp, directories, resolvedAddressFromUrl]);

  const { filterItems, searchText, clearMatchedFilters } = useCatalogFiltersStore();

  const account = useAccount();
  const subscriptions = account?.subscriptions;
  const filteredDirectoryAddresses = useFilteredDirectoryAddresses();

  const subplebbitAddresses = useMemo(() => {
    if (isInAllView) {
      return filteredDirectoryAddresses;
    }
    if (isInSubscriptionsView) {
      return (subscriptions || []).filter(Boolean); // Filter out any undefined/null values
    }
    // Only include subplebbitAddress if it's defined
    return subplebbitAddress ? [subplebbitAddress] : [];
  }, [isInAllView, isInSubscriptionsView, subplebbitAddress, filteredDirectoryAddresses, subscriptions]);

  const { imageSize } = useCatalogStyleStore();
  const columnWidth = imageSize === 'Large' ? 270 : 180;

  const columnCount = Math.floor(useWindowWidth() / columnWidth);
  const postsPerPage = columnCount <= 2 ? 10 : columnCount === 3 ? 15 : columnCount === 4 ? 20 : 25;

  const community = useDirectoryByAddress(isInAllView || isInSubscriptionsView || isInModView ? undefined : subplebbitAddress);
  const { guiPostsPerPage: boardPostsPerPage, maxGuiPages, paginationFeedPostsPerPage, infiniteFeedPostsPerPage } = useBoardFeedPageSize(community);

  // Canonical redirect for multiboard catalog paths with numeric page segment (e.g. /all/catalog/1w/5 -> /all/catalog/1w)
  useEffect(() => {
    if (!(isInAllView || isInSubscriptionsView || isInModView)) return;
    const canonical = normalizeMultiboardFeedPath(location.pathname);
    if (location.pathname !== canonical) {
      navigate(canonical, { replace: true });
    }
  }, [isInAllView, isInSubscriptionsView, isInModView, location.pathname, navigate]);

  const { sortType } = useSortingStore();
  const feedSortType = sortType === 'new' ? 'new' : 'active';

  // Create a stable callback for filter matching
  const handleFilterMatch = useCallback((filterIndex: number, cid: string, subplebbitAddress: string) => {
    useCatalogFiltersStore.getState().incrementFilterCount(filterIndex, cid, subplebbitAddress);
  }, []);

  // Set the current subplebbit address
  useEffect(() => {
    useCatalogFiltersStore.getState().setCurrentSubplebbitAddress(subplebbitAddress || null);
    return () => {
      useCatalogFiltersStore.getState().setCurrentSubplebbitAddress(null);
    };
  }, [subplebbitAddress]);

  const feedOptions = useMemo(() => {
    const catalogPostsPerPage =
      isInAllView || isInSubscriptionsView || isInModView
        ? effectiveInfiniteScroll
          ? 10
          : 100
        : effectiveInfiniteScroll
          ? infiniteFeedPostsPerPage
          : paginationFeedPostsPerPage;

    return {
      subplebbitAddresses,
      sortType: feedSortType,
      postsPerPage: catalogPostsPerPage,
      filter: createCombinedFilter(filterItems, searchText, subplebbitAddress || 'all', handleFilterMatch),
    };
  }, [
    subplebbitAddresses,
    feedSortType,
    isInAllView,
    isInSubscriptionsView,
    isInModView,
    effectiveInfiniteScroll,
    infiniteFeedPostsPerPage,
    paginationFeedPostsPerPage,
    filterItems,
    searchText,
    subplebbitAddress,
    handleFilterMatch,
  ]);

  const { feed, hasMore, loadMore, reset } = useFeed(feedOptions);
  const { accountComments } = useAccountComments();

  const resetTriggeredRef = useRef(false);

  // show account comments instantly in the feed once published (cid defined), instead of waiting for the feed to update
  const feedCids = useMemo(() => new Set(feed.map((f) => f.cid)), [feed]);
  const filteredComments = useMemo(
    () =>
      accountComments.filter((comment) => {
        const { cid, deleted, postCid, removed, state, timestamp } = comment || {};

        // Basic filtering conditions
        const basicConditions =
          !deleted &&
          !removed &&
          timestamp > Date.now() / 1000 - 60 * 60 &&
          state === 'succeeded' &&
          cid &&
          cid === postCid &&
          comment?.subplebbitAddress === subplebbitAddress &&
          !feedCids.has(cid);

        // If search is active, also check search conditions
        if (basicConditions && searchText.trim()) {
          const titleLower = comment?.title?.toLowerCase() || '';
          const contentLower = comment?.content?.toLowerCase() || '';
          const searchPattern = searchText.toLowerCase();

          return titleLower.includes(searchPattern) || contentLower.includes(searchPattern);
        }

        return basicConditions;
      }),
    [accountComments, subplebbitAddress, feedCids, searchText],
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
    () => (effectiveInfiniteScroll ? combinedFeed : combinedFeed.slice(0, boardPostsPerPage * maxGuiPages)),
    [effectiveInfiniteScroll, combinedFeed, boardPostsPerPage, maxGuiPages],
  );

  const sortedFeed = useMemo(() => sortCatalogFeedForDisplay(cappedFeed, sortType), [cappedFeed, sortType]);

  useEffect(() => {
    if (filteredComments.length > 0 && !resetTriggeredRef.current) {
      reset();
      resetTriggeredRef.current = true;
    }
  }, [filteredComments, reset]);

  // suggest the user to change time filter if there aren't enough posts
  const setResetFunction = useFeedResetStore((state) => state.setResetFunction);
  useEffect(() => {
    if (isVisible) {
      setResetFunction(reset);
    }
  }, [reset, setResetFunction, isVisible]);

  const subplebbit = useSubplebbit({ subplebbitAddress });
  const { error, shortAddress, state, title } = subplebbit || {};

  // Memoize footer component to preserve identity across renders (Virtuoso optimization)
  // Note: useFeedStateString is called inside CatalogFooter to isolate re-renders from backend state changes
  const footerComponents = useMemo(
    () => ({
      Footer: () => (
        <>
          <CatalogFooter
            subplebbitAddresses={subplebbitAddresses}
            hasMore={hasMore}
            combinedFeedLength={cappedFeed.length}
            isInAllView={isInAllView}
            isInSubscriptionsView={isInSubscriptionsView}
            isInModView={isInModView}
            showLoadingEllipsis={effectiveInfiniteScroll}
          />
          <PageFooterDesktop firstRow={<CatalogFooterFirstRow />} />
        </>
      ),
    }),
    [subplebbitAddresses, hasMore, cappedFeed.length, isInAllView, isInSubscriptionsView, isInModView, effectiveInfiniteScroll],
  );

  const isFeedLoaded = feed.length > 0 || state === 'failed';

  // Process the feed to move "top" posts to the top (applied after display sort)
  const processedFeed = useMemo(() => {
    if (!sortedFeed || sortedFeed.length === 0) return sortedFeed;

    const enabledTopFilters = filterItems.filter((item) => item.enabled && item.text.trim() !== '' && item.top);
    if (enabledTopFilters.length === 0) return sortedFeed;

    // Separate posts that match "top" filters
    const topPosts: Comment[] = [];
    const regularPosts: Comment[] = [];

    sortedFeed.forEach((comment) => {
      if (!comment) return;

      let isTop = false;
      for (const filter of enabledTopFilters) {
        if (commentMatchesPattern(comment, filter.text)) {
          isTop = true;
          break;
        }
      }

      if (isTop) {
        topPosts.push(comment);
      } else {
        regularPosts.push(comment);
      }
    });

    // Return top posts followed by regular posts
    return [...topPosts, ...regularPosts];
  }, [sortedFeed, filterItems]);

  const rows = useCatalogFeedRows(columnCount, processedFeed, isFeedLoaded, subplebbit);

  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const virtuosoStateKey = feedCacheKey ? `${feedCacheKey}-${sortType}` : `${location.pathname}-${sortType}-catalog`;
  const navigationType = useNavigationType();

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
    const setLastVirtuosoState = () =>
      virtuosoRef.current?.getState((snapshot: StateSnapshot) => {
        if (snapshot?.ranges?.length) {
          lastVirtuosoStates[currentKey] = snapshot;
        }
      });
    window.addEventListener('scroll', setLastVirtuosoState);
    return () => window.removeEventListener('scroll', setLastVirtuosoState);
  }, [virtuosoStateKey, isVisible]);

  const lastVirtuosoState = navigationType === 'POP' ? lastVirtuosoStates?.[virtuosoStateKey] : undefined;

  useEffect(() => {
    if (!isVisible) return;
    const boardIdentifier = params.boardIdentifier || boardIdentifierProp;
    const isDirectory = boardIdentifier ? isDirectoryBoard(boardIdentifier, directories) : false;

    let documentTitle: string;
    if (isInAllView) {
      documentTitle = t('all');
    } else if (isInSubscriptionsView) {
      documentTitle = t('subscriptions');
    } else if (isDirectory) {
      documentTitle = `/${boardIdentifier}/`;
    } else {
      documentTitle = title ? title : shortAddress || subplebbitAddress || '';
    }
    document.title = documentTitle + ` - ${t('catalog')} - 5chan`;
  }, [title, shortAddress, subplebbitAddress, isInAllView, isInSubscriptionsView, t, isVisible, params.boardIdentifier, boardIdentifierProp, directories]);

  // Clear matched filters when component mounts or when subplebbit changes
  useEffect(() => {
    clearMatchedFilters();
    return () => {
      clearMatchedFilters();
    };
  }, [clearMatchedFilters, subplebbitAddress]);

  // Memoize filter color application to avoid redundant iterations
  useMemo(() => {
    if (cappedFeed.length > 0 && filterItems.length > 0) {
      // Clear existing matched filters
      clearMatchedFilters();

      // Apply colors to posts that match filters
      cappedFeed.forEach((comment) => {
        if (!comment?.cid) return;

        // Check each filter
        for (const item of filterItems) {
          if (item.enabled && item.text.trim() !== '' && item.color) {
            if (commentMatchesPattern(comment, item.text)) {
              useCatalogFiltersStore.getState().setMatchedFilter(comment.cid, item.color);
              break; // Use the first matching filter's color
            }
          }
        }
      });
    }
  }, [cappedFeed, filterItems, clearMatchedFilters]);

  return (
    <div className={styles.content}>
      <hr />
      <div className={styles.catalog}>
        {processedFeed?.length !== 0 ? (
          <>
            <Virtuoso
              defaultItemHeight={imageSize === 'Large' ? 320 : 200}
              increaseViewportBy={{ bottom: 1200, top: 1200 }}
              totalCount={rows?.length || 0}
              data={rows}
              itemContent={(index, row) => <CatalogRow index={index} row={row} />}
              useWindowScroll={true}
              components={footerComponents}
              endReached={effectiveInfiniteScroll && hasMore ? loadMore : undefined}
              ref={virtuosoRef}
              restoreStateFrom={lastVirtuosoState}
              initialScrollTop={lastVirtuosoState?.scrollTop}
            />
          </>
        ) : (
          <>
            <div className={styles.footer}>
              <CatalogLoading
                subplebbitAddresses={subplebbitAddresses}
                hasMore={hasMore}
                combinedFeedLength={cappedFeed.length}
                state={state}
                subscriptionsLength={isInSubscriptionsView ? subscriptions?.length || 0 : 1}
                error={error}
              />
            </div>
            <PageFooterDesktop firstRow={<CatalogFooterFirstRow />} />
          </>
        )}
      </div>
    </div>
  );
};

export default Catalog;
