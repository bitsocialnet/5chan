import { Activity, type ComponentType, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import useFeedCacheStore, { CachedFeed, getFeedCacheAfterAccess } from '../../stores/use-feed-cache-store';
import { getFeedCacheKey, getFeedType, isFeedRoute } from '../../lib/utils/route-utils';
import { TIME_FILTER_QUERY_PARAM } from '../../lib/utils/time-filter-utils';
import { restoreSuspendedMediaPlayback, suspendMediaPlayback } from '../../lib/utils/media-playback-utils';
import { FeedCacheContext } from '../../hooks/use-feed-cache-context';
import styles from './feed-cache-container.module.css';

type CachedFeedViewType = 'all' | 'subs' | 'mod' | 'board';

// The board and catalog views are injected by app.tsx so this component never depends on the views layer.
interface CachedFeedViewProps {
  feedCacheKey: string;
  viewType: CachedFeedViewType;
  boardIdentifier?: string;
  timeFilterNameFromCache?: string;
  isVisible: boolean;
}

interface FeedContextFromKey {
  viewType: CachedFeedViewType;
  boardIdentifier?: string;
  timeFilterName?: string;
}

const parseFeedKey = (key: string): FeedContextFromKey => {
  const [pathname, search = ''] = key.split('?');
  const segments = pathname.split('/').filter(Boolean);
  const timeFilterName = new URLSearchParams(search).get(TIME_FILTER_QUERY_PARAM) || undefined;

  const filteredSegments = segments.filter((s) => s !== 'catalog');
  if (filteredSegments[0] === 'all') {
    return { viewType: 'all', timeFilterName };
  }
  if (filteredSegments[0] === 'subs') {
    return { viewType: 'subs', timeFilterName };
  }
  if (filteredSegments[0] === 'mod') {
    return { viewType: 'mod', timeFilterName };
  }

  return {
    viewType: 'board',
    boardIdentifier: filteredSegments[0],
  };
};

interface CachedFeedWrapperProps {
  feed: CachedFeed;
  isVisible: boolean;
  boardView: ComponentType<CachedFeedViewProps>;
  catalogView: ComponentType<CachedFeedViewProps>;
}

const CachedFeedWrapper = ({ feed, isVisible, boardView: BoardView, catalogView: CatalogView }: CachedFeedWrapperProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const context = parseFeedKey(feed.key);

  useEffect(() => {
    const container = containerRef.current;
    if (isVisible) {
      restoreSuspendedMediaPlayback(container, { visibleOnly: true });
      return;
    }

    suspendMediaPlayback(container);
  }, [isVisible]);

  return (
    <div ref={containerRef} className={isVisible ? styles.visible : styles.hidden}>
      {feed.type === 'catalog' ? (
        <CatalogView
          feedCacheKey={feed.key}
          viewType={context.viewType}
          boardIdentifier={context.boardIdentifier}
          timeFilterNameFromCache={context.timeFilterName}
          isVisible={isVisible}
        />
      ) : (
        <Activity mode={isVisible ? 'visible' : 'hidden'}>
          <BoardView
            feedCacheKey={feed.key}
            viewType={context.viewType}
            boardIdentifier={context.boardIdentifier}
            timeFilterNameFromCache={context.timeFilterName}
            isVisible={isVisible}
          />
        </Activity>
      )}
    </div>
  );
};

interface FeedCacheContainerProps {
  boardView: ComponentType<CachedFeedViewProps>;
  catalogView: ComponentType<CachedFeedViewProps>;
}

const FeedCacheContainer = ({ boardView, catalogView }: FeedCacheContainerProps) => {
  const location = useLocation();
  const cachedFeeds = useFeedCacheStore((state) => state.cachedFeeds);
  const accessFeed = useFeedCacheStore((state) => state.accessFeed);
  const maxCacheSize = useFeedCacheStore((state) => state.maxCacheSize);

  const currentFeedKey = getFeedCacheKey(location.pathname, location.search);
  const isOnFeedRoute = isFeedRoute(location.pathname);
  const feedType = getFeedType(location.pathname);
  // Mount the incoming view in this route commit; persist its recency in the effect.
  // Infinity is only a deterministic projection marker and never enters the store.
  const renderedFeeds =
    isOnFeedRoute && currentFeedKey && feedType && !cachedFeeds.some((feed) => feed.key === currentFeedKey)
      ? getFeedCacheAfterAccess(cachedFeeds, maxCacheSize, { key: currentFeedKey, type: feedType, lastAccessed: Infinity })
      : cachedFeeds;

  useEffect(() => {
    if (isOnFeedRoute && currentFeedKey && feedType) {
      accessFeed(currentFeedKey, feedType);
    }
  }, [currentFeedKey, isOnFeedRoute, feedType, accessFeed]);

  return (
    <FeedCacheContext.Provider value={true}>
      {renderedFeeds.map((feed) => (
        <CachedFeedWrapper key={feed.key} feed={feed} isVisible={isOnFeedRoute && feed.key === currentFeedKey} boardView={boardView} catalogView={catalogView} />
      ))}
    </FeedCacheContext.Provider>
  );
};

export default FeedCacheContainer;
