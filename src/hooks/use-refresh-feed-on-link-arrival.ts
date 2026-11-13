import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

interface RefreshFeedOnLinkArrivalOptions {
  isVisible: boolean;
  /** Whether the feed already holds threads from an earlier visit; a feed loading for the first time is fresh. */
  hasLoadedThreads: boolean;
  refresh: () => void;
}

/**
 * A feed keeps the threads it first loaded for the whole session: newer threads and bumps wait in
 * its buffer until it is reset. A board opened again by a link would therefore show the list from
 * the earlier visit, so it is refreshed then, like 4chan loading the page again.
 *
 * Back and forward keep the list and its scroll position, and a view that stays on screen while its
 * page number or settings modal changes has not been opened again.
 */
const useRefreshFeedOnLinkArrival = ({ isVisible, hasLoadedThreads, refresh }: RefreshFeedOnLinkArrivalOptions) => {
  const navigationType = useNavigationType();
  const locationKey = useLocation().key;
  const isArrivalRef = useRef(true);
  const handledLocationKeyRef = useRef<string | undefined>(undefined);

  // Activity disconnects a hidden view's effects, so this cleanup is what marks its next showing as an arrival.
  useEffect(() => {
    if (!isVisible) return;
    return () => {
      isArrivalRef.current = true;
    };
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible || !isArrivalRef.current) return;
    isArrivalRef.current = false;
    // StrictMode runs the effects of one arrival twice.
    if (handledLocationKeyRef.current === locationKey) return;
    handledLocationKeyRef.current = locationKey;
    if (navigationType === 'PUSH' && hasLoadedThreads) {
      refresh();
    }
  }, [isVisible, navigationType, locationKey, hasLoadedThreads, refresh]);
};

export default useRefreshFeedOnLinkArrival;
