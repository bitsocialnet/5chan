import { useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import useThemeStore from '../stores/use-theme-store';
import { useDirectories } from './use-directories';
import { isAllView, isHomeView, isNotFoundView, isPendingPostView, isSubscriptionsView, isModView } from '../lib/utils/view-utils';
import { getSubplebbitAddress } from '../lib/utils/route-utils';
import { useAccountComment } from '@plebbit/plebbit-react-hooks';

const useInitialTheme = (pendingPostSubplebbitAddress?: string) => {
  const location = useLocation();
  const { boardIdentifier, accountCommentIndex } = useParams<{ boardIdentifier: string; accountCommentIndex?: string }>();
  const commentIndex = accountCommentIndex ? parseInt(accountCommentIndex) : undefined;
  const pendingPost = useAccountComment({ commentIndex });
  // Subscribe to the actual themes data, not just functions
  const themes = useThemeStore((state) => state.themes);
  const directories = useDirectories();
  const params = useParams();
  const isInHomeView = isHomeView(location.pathname);
  const isInNotFoundView = isNotFoundView(location.pathname, params);
  const isInAllView = isAllView(location.pathname);
  const isInSubscriptionsView = isSubscriptionsView(location.pathname, params);
  const isInModView = isModView(location.pathname);
  const isInPendingPostView = isPendingPostView(location.pathname, params);

  const paramsSubplebbitAddress = boardIdentifier ? getSubplebbitAddress(boardIdentifier, directories) : undefined;

  const initialTheme = useMemo(() => {
    let theme = 'yotsuba';

    if (isInPendingPostView) {
      const subplebbitAddress = pendingPostSubplebbitAddress || pendingPost?.subplebbitAddress;
      if (subplebbitAddress) {
        const community = directories.find((s) => s.address === subplebbitAddress);
        if (community?.nsfw) {
          theme = themes.nsfw || 'yotsuba';
        } else {
          theme = themes.sfw || 'yotsuba-b';
        }
      } else {
        theme = 'yotsuba';
      }
    } else if (isInAllView || isInSubscriptionsView || isInModView) {
      theme = themes.sfw || 'yotsuba-b';
    } else if (isInHomeView || isInNotFoundView) {
      theme = 'yotsuba';
    } else if (paramsSubplebbitAddress) {
      const community = directories.find((s) => s.address === paramsSubplebbitAddress);
      if (community?.nsfw) {
        theme = themes.nsfw || 'yotsuba';
      } else {
        theme = themes.sfw || 'yotsuba-b';
      }
    }

    return theme;
  }, [
    isInPendingPostView,
    isInAllView,
    isInSubscriptionsView,
    isInModView,
    isInHomeView,
    isInNotFoundView,
    paramsSubplebbitAddress,
    themes,
    directories,
    pendingPostSubplebbitAddress,
    pendingPost,
  ]);

  return initialTheme;
};

export default useInitialTheme;
