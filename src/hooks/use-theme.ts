import { useEffect, useCallback, useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { isAllView, isSubscriptionsView, isModView } from '../lib/utils/view-utils';
import useThemeStore from '../stores/use-theme-store';
import { useDirectories } from './use-directories';
import { useResolvedSubplebbitAddress } from './use-resolved-subplebbit-address';
import { useAccountComment } from '@bitsocialnet/bitsocial-react-hooks';
import useSpecialThemeStore from '../stores/use-special-theme-store';
import { isChristmas } from '../lib/utils/time-utils';
import { updateFavicon, isSfwBoard } from '../lib/update-favicon';

const themeClasses = ['yotsuba', 'yotsuba-b', 'futaba', 'burichan', 'tomorrow', 'photon'];

const updateThemeClass = (newTheme: string) => {
  document.body.classList.remove(...themeClasses);
  if (newTheme) {
    document.body.classList.add(newTheme);
  }
};

const useTheme = (): [string, (theme: string) => void] => {
  const location = useLocation();
  const params = useParams<{ subplebbitAddress: string }>();
  const pendingPostParams = useParams<{ accountCommentIndex?: string }>();
  const pendingPostCommentIndex = pendingPostParams?.accountCommentIndex ? parseInt(pendingPostParams.accountCommentIndex) : undefined;
  const pendingPost = useAccountComment({ commentIndex: pendingPostCommentIndex });
  const pendingPostSubplebbitAddress = pendingPost?.subplebbitAddress;
  const { isEnabled, setIsEnabled } = useSpecialThemeStore();

  const setThemeStore = useThemeStore((state) => state.setTheme);
  // Subscribe to the actual themes data, not just the getter function
  const themes = useThemeStore((state) => state.themes);
  const directories = useDirectories();

  const isInAllView = isAllView(location.pathname);
  const isInSubscriptionsView = isSubscriptionsView(location.pathname, params);
  const isInModView = isModView(location.pathname);
  const resolvedAddress = useResolvedSubplebbitAddress();
  const subplebbitAddress = resolvedAddress || pendingPostSubplebbitAddress;

  // Check for Christmas and initialize special theme if needed
  useEffect(() => {
    const isChristmasTime = isChristmas();

    if (isChristmasTime && isEnabled === null && subplebbitAddress && !isInAllView && !isInSubscriptionsView && !isInModView) {
      setIsEnabled(true);
    } else if (!isChristmasTime && isEnabled) {
      setIsEnabled(false);
    }
  }, [isEnabled, setIsEnabled, subplebbitAddress, isInAllView, isInSubscriptionsView, isInModView]);

  // Calculate current theme during render - no effects needed
  const currentTheme = useMemo(() => {
    // Always use yotsuba for home page
    if (location.pathname === '/') {
      return 'yotsuba';
    }

    // Always use yotsuba for rules page (boardIdentifier in URL is for loading rules, not theming)
    if (location.pathname.startsWith('/rules')) {
      return 'yotsuba';
    }

    // If special theme is enabled, use tomorrow
    if (isEnabled) {
      return 'tomorrow';
    }

    let storedTheme = null;
    if (isInAllView || isInSubscriptionsView || isInModView) {
      storedTheme = themes.nsfw;
    } else if (subplebbitAddress) {
      const subplebbit = directories.find((s) => s.address === subplebbitAddress);
      if (subplebbit?.nsfw) {
        storedTheme = themes.nsfw;
      } else {
        storedTheme = themes.sfw;
      }
    }

    return storedTheme || 'yotsuba';
  }, [location.pathname, isEnabled, isInAllView, isInSubscriptionsView, isInModView, subplebbitAddress, directories, themes]);

  const sfw = isSfwBoard({
    pathname: location.pathname,
    isSpecialTheme: !!isEnabled,
    isInAllView,
    isInSubscriptionsView,
    isInModView,
    subplebbitAddress,
    directories,
  });

  // Update DOM class when theme changes
  useEffect(() => {
    updateThemeClass(currentTheme);
  }, [currentTheme]);

  // Update favicon when SFW status changes (separate effect for independent lifecycle)
  useEffect(() => {
    updateFavicon(sfw);
  }, [sfw]);

  const setSubplebbitTheme = useCallback(
    async (newTheme: string) => {
      if (isInAllView || isInSubscriptionsView || isInModView) {
        await setThemeStore('nsfw', newTheme);
      } else if (subplebbitAddress) {
        const subplebbit = directories.find((s) => s.address === subplebbitAddress);
        if (subplebbit?.nsfw) {
          await setThemeStore('nsfw', newTheme);
        } else {
          await setThemeStore('sfw', newTheme);
        }
      }
    },
    [isInAllView, isInSubscriptionsView, isInModView, subplebbitAddress, directories, setThemeStore],
  );

  return [currentTheme, setSubplebbitTheme];
};

export default useTheme;
