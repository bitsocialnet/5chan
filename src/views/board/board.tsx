import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigationType, useParams } from 'react-router-dom';
import { Comment, useAccount, useAccountComments, useAccountSubplebbits, useFeed, useSubplebbit } from '@plebbit/plebbit-react-hooks';
import { useSubplebbitField } from '../../hooks/use-stable-subplebbit';
import { Virtuoso, VirtuosoHandle, StateSnapshot } from 'react-virtuoso';
import { Trans, useTranslation } from 'react-i18next';
import styles from './board.module.css';
import { shouldShowSnow } from '../../lib/snow';
import { useDirectoryAddresses, useDirectories } from '../../hooks/use-directories';
import { useFilteredDirectoryAddresses } from '../../hooks/use-filtered-directory-addresses';
import { useResolvedSubplebbitAddress, useBoardPath } from '../../hooks/use-resolved-subplebbit-address';
import { useFeedStateString } from '../../hooks/use-state-string';
import useTimeFilter, { timeFilterNameToSeconds } from '../../hooks/use-time-filter';
import useFeedResetStore from '../../stores/use-feed-reset-store';
import useSortingStore from '../../stores/use-sorting-store';
import { getSubplebbitAddress, isDirectoryBoard } from '../../lib/utils/route-utils';
import ErrorDisplay from '../../components/error-display/error-display';
import LoadingEllipsis from '../../components/loading-ellipsis';
import { Post } from '../post';

const lastVirtuosoStates: { [key: string]: StateSnapshot } = {};

interface BoardFooterProps {
  subplebbitAddresses: string[];
  hasMore: boolean;
  combinedFeedLength: number;
  subplebbitAddressesWithNewerPosts: string[];
  onNewerPostsClick: () => void;
  isInAllView: boolean;
  isInSubscriptionsView: boolean;
  isInModView: boolean;
  showMorePostsSuggestion: boolean;
  feedLength: number;
  weeklyFeedLength: number;
  monthlyFeedLength: number;
  yearlyFeedLength: number;
  boardPath: string | undefined;
  currentTimeFilterName: string | undefined;
  subplebbitState: string | undefined;
  subscriptionsLength: number;
  accountSubplebbitAddressesLength: number;
}

// Defined outside Board to preserve component identity across renders (Virtuoso optimization)
// The useFeedStateString hook is called here instead of in Board to isolate re-renders
// caused by backend IPFS state changes to just this footer component
const BoardFooter = ({
  subplebbitAddresses,
  hasMore,
  combinedFeedLength,
  subplebbitAddressesWithNewerPosts,
  onNewerPostsClick,
  isInAllView,
  isInSubscriptionsView,
  isInModView,
  showMorePostsSuggestion,
  feedLength,
  weeklyFeedLength,
  monthlyFeedLength,
  yearlyFeedLength,
  boardPath,
  currentTimeFilterName,
  subplebbitState,
  subscriptionsLength,
  accountSubplebbitAddressesLength,
}: BoardFooterProps) => {
  const { t } = useTranslation();

  const loadingStateString =
    useFeedStateString(subplebbitAddresses) ||
    (feedLength === 0 && !(weeklyFeedLength > feedLength || monthlyFeedLength > feedLength || yearlyFeedLength > monthlyFeedLength)
      ? t('loading_feed')
      : t('looking_for_more_posts'));

  let footerContent;
  if (combinedFeedLength === 0) {
    footerContent = t('no_threads');
  }
  if (hasMore || (subplebbitAddresses && subplebbitAddresses.length === 0)) {
    footerContent = (
      <>
        {subplebbitAddressesWithNewerPosts.length > 0 ? (
          <div className={styles.morePostsSuggestion}>
            <Trans
              i18nKey='newer_threads_available'
              components={{
                1: <span className={styles.newerPostsButton} onClick={onNewerPostsClick} />,
              }}
            />
          </div>
        ) : (
          (isInAllView || isInSubscriptionsView || isInModView) &&
          showMorePostsSuggestion &&
          (monthlyFeedLength > feedLength || yearlyFeedLength > monthlyFeedLength) &&
          (() => {
            const basePath = isInAllView ? '/all' : isInSubscriptionsView ? '/subs' : isInModView ? '/mod' : boardPath ? `/${boardPath}` : '';
            return weeklyFeedLength > feedLength ? (
              <div className={styles.morePostsSuggestion}>
                <Trans
                  i18nKey='more_threads_last_week'
                  values={{ currentTimeFilterName, count: feedLength }}
                  components={{
                    1: <Link to={`${basePath}/1w`} />,
                  }}
                />
              </div>
            ) : monthlyFeedLength > feedLength ? (
              <div className={styles.morePostsSuggestion}>
                <Trans
                  i18nKey='more_threads_last_month'
                  values={{ currentTimeFilterName, count: feedLength }}
                  components={{
                    1: <Link to={`${basePath}/1m`} />,
                  }}
                />
              </div>
            ) : (
              <div className={styles.morePostsSuggestion}>
                <Trans
                  i18nKey='more_threads_last_year'
                  values={{ currentTimeFilterName, count: feedLength }}
                  components={{
                    1: <Link to={`${basePath}/1y`} />,
                  }}
                />
              </div>
            );
          })()
        )}
      </>
    );
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
          hasMore && <LoadingEllipsis string={loadingStateString} />
        )}
      </div>
    </div>
  );
};

export interface BoardProps {
  feedCacheKey?: string;
  viewType?: 'all' | 'subs' | 'mod' | 'board';
  boardIdentifier?: string;
  timeFilterNameFromCache?: string;
  isVisible?: boolean;
}

const Board = ({ feedCacheKey, viewType, boardIdentifier: boardIdentifierProp, timeFilterNameFromCache, isVisible = true }: BoardProps) => {
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

  const boardPath = useBoardPath(subplebbitAddress);
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

  const { sortType } = useSortingStore();
  const { timeFilterSeconds: timeFilterSecondsFromHook, timeFilterName: timeFilterNameFromHook } = useTimeFilter();
  const timeFilterName = timeFilterNameFromCache || timeFilterNameFromHook;
  const timeFilterSeconds = timeFilterNameFromCache ? timeFilterNameToSeconds(timeFilterNameFromCache) : timeFilterSecondsFromHook;

  const feedOptions = {
    subplebbitAddresses,
    sortType,
    postsPerPage: isInAllView || isInSubscriptionsView || isInModView ? 5 : 25,
    ...(isInAllView || isInSubscriptionsView || isInModView ? { newerThan: timeFilterSeconds } : {}),
  };

  const { feed, hasMore, loadMore, reset, subplebbitAddressesWithNewerPosts } = useFeed(feedOptions);
  const { accountComments } = useAccountComments();

  const resetTriggeredRef = useRef(false);

  const setResetFunction = useFeedResetStore((state) => state.setResetFunction);
  useEffect(() => {
    if (isVisible) {
      setResetFunction(reset);
    }
  }, [reset, setResetFunction, feed, isVisible]);

  // show account comments instantly in the feed once published (cid defined), instead of waiting for the feed to update
  const filteredComments = useMemo(
    () =>
      accountComments.filter((comment) => {
        const { cid, deleted, link, linkHeight, linkWidth, postCid, removed, state, thumbnailUrl, timestamp } = comment || {};
        return (
          !deleted &&
          !removed &&
          timestamp > Date.now() / 1000 - 60 * 60 &&
          state === 'succeeded' &&
          cid &&
          cid === postCid &&
          comment?.subplebbitAddress === subplebbitAddress &&
          !feed.some((post) => post.cid === cid)
        );
      }),
    [accountComments, subplebbitAddress, feed],
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

  const handleNewerPostsButtonClick = () => {
    window.scrollTo({ top: 0, left: 0 });
    setTimeout(() => {
      reset();
    }, 300);
  };

  // suggest the user to change time filter if there aren't enough posts
  const { feed: weeklyFeed } = useFeed({
    subplebbitAddresses,
    sortType,
    newerThan: 60 * 60 * 24 * 7,
  });
  const { feed: monthlyFeed } = useFeed({
    subplebbitAddresses,
    sortType,
    newerThan: 60 * 60 * 24 * 30,
  });
  const { feed: yearlyFeed } = useFeed({
    subplebbitAddresses,
    sortType,
    newerThan: 60 * 60 * 24 * 365,
  });

  const feedLength = feed.length;
  const weeklyFeedLength = weeklyFeed.length;
  const monthlyFeedLength = monthlyFeed.length;
  const yearlyFeedLength = yearlyFeed.length;

  const [showMorePostsSuggestion, setShowMorePostsSuggestion] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowMorePostsSuggestion(true);
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  const currentTimeFilterName = timeFilterName || params?.timeFilterName;

  // Memoize footer component to preserve identity across renders (Virtuoso optimization)
  // Note: useFeedStateString is called inside BoardFooter to isolate re-renders from backend state changes
  const footerComponents = useMemo(
    () => ({
      Footer: () => (
        <BoardFooter
          subplebbitAddresses={subplebbitAddresses}
          hasMore={hasMore}
          combinedFeedLength={combinedFeed.length}
          subplebbitAddressesWithNewerPosts={subplebbitAddressesWithNewerPosts}
          onNewerPostsClick={handleNewerPostsButtonClick}
          isInAllView={isInAllView}
          isInSubscriptionsView={isInSubscriptionsView}
          isInModView={isInModView}
          showMorePostsSuggestion={showMorePostsSuggestion}
          feedLength={feedLength}
          weeklyFeedLength={weeklyFeedLength}
          monthlyFeedLength={monthlyFeedLength}
          yearlyFeedLength={yearlyFeedLength}
          boardPath={boardPath}
          currentTimeFilterName={currentTimeFilterName}
          subplebbitState={subplebbitState}
          subscriptionsLength={subscriptions?.length || 0}
          accountSubplebbitAddressesLength={accountSubplebbitAddresses?.length || 0}
        />
      ),
    }),
    [
      subplebbitAddresses,
      hasMore,
      combinedFeed.length,
      subplebbitAddressesWithNewerPosts,
      handleNewerPostsButtonClick,
      isInAllView,
      isInSubscriptionsView,
      isInModView,
      showMorePostsSuggestion,
      feedLength,
      weeklyFeedLength,
      monthlyFeedLength,
      yearlyFeedLength,
      boardPath,
      currentTimeFilterName,
      subplebbitState,
      subscriptions?.length,
      accountSubplebbitAddresses?.length,
    ],
  );

  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const virtuosoStateKey = feedCacheKey ? `${feedCacheKey}-${sortType}-${timeFilterSeconds}` : `${location.pathname}-${sortType}-${timeFilterSeconds}`;
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

  return (
    <>
      {shouldShowSnow() && <hr />}
      <div className={`${styles.content} ${shouldShowSnow() ? styles.garland : ''}`}>
        {shouldShowErrorToUser && (
          <div className={styles.error}>
            <ErrorDisplay error={subplebbitError} />
          </div>
        )}
        {/* Use Virtuoso for infinite scroll only when there's more content to paginate */}
        {hasMore ? (
          <Virtuoso
            increaseViewportBy={{ bottom: 1200, top: 1200 }}
            totalCount={combinedFeed.length}
            data={combinedFeed}
            itemContent={(index, post) => <Post index={index} post={post} />}
            useWindowScroll={true}
            components={footerComponents}
            endReached={loadMore}
            ref={virtuosoRef}
            restoreStateFrom={lastVirtuosoState}
            initialScrollTop={lastVirtuosoState?.scrollTop}
          />
        ) : (
          <>
            {combinedFeed.map((post, index) => (
              <Post key={post.cid} index={index} post={post} />
            ))}
            <BoardFooter
              subplebbitAddresses={subplebbitAddresses}
              hasMore={hasMore}
              combinedFeedLength={combinedFeed.length}
              subplebbitAddressesWithNewerPosts={subplebbitAddressesWithNewerPosts}
              onNewerPostsClick={handleNewerPostsButtonClick}
              isInAllView={isInAllView}
              isInSubscriptionsView={isInSubscriptionsView}
              isInModView={isInModView}
              showMorePostsSuggestion={showMorePostsSuggestion}
              feedLength={feedLength}
              weeklyFeedLength={weeklyFeedLength}
              monthlyFeedLength={monthlyFeedLength}
              yearlyFeedLength={yearlyFeedLength}
              boardPath={boardPath}
              currentTimeFilterName={currentTimeFilterName}
              subplebbitState={subplebbitState}
              subscriptionsLength={subscriptions?.length || 0}
              accountSubplebbitAddressesLength={accountSubplebbitAddresses?.length || 0}
            />
          </>
        )}
      </div>
    </>
  );
};

export default Board;
