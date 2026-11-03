import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from '../../lib/analytics';
import { isNonokoRedirectState } from '../../lib/utils/pending-post-route-state';
import { isPendingPostRoute } from '../../lib/utils/route-utils';

const WebAnalytics = () => {
  const { pathname, state } = useLocation();
  const previousPathname = useRef<string | null>(null);

  useEffect(() => {
    const previous = previousPathname.current;
    if (previous === pathname) return;
    previousPathname.current = pathname;
    // Submitting a thread opens its pending page, which redirects to the thread once the board
    // accepts it, and nonoko sends the poster straight to the board index instead. None of these
    // views is sent: their timing would reveal when this visitor posted.
    if (isPendingPostRoute(pathname) || (previous !== null && isPendingPostRoute(previous)) || isNonokoRedirectState(state)) return;
    // Compare the actual route locally so two different threads still count as
    // two views, while only their shared, sanitized page name is transmitted.
    trackPageView(pathname);
  }, [pathname, state]);

  return null;
};

export default WebAnalytics;
