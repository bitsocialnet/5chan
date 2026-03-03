const DEFAULT_FAVICON = '/favicon.ico';
const SFW_FAVICON = '/favicon2.ico';

let currentHref: string | null = null;

/**
 * Swap the tab favicon between the default (NSFW/home) and SFW variants.
 * Uses remove-and-recreate to bypass aggressive browser favicon caching.
 */
export const updateFavicon = (isSfw: boolean): void => {
  const href = isSfw ? SFW_FAVICON : DEFAULT_FAVICON;
  if (href === currentHref) return;
  currentHref = href;

  const existing = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (existing) existing.remove();

  const link = document.createElement('link');
  link.rel = 'icon';
  link.href = href;
  document.head.appendChild(link);
};

/**
 * Determine whether the current navigation context is a SFW board.
 *
 * Pure function — no hooks, no side-effects, fully testable.
 */
export const isSfwBoard = ({
  pathname,
  isSpecialTheme,
  isInAllView,
  isInSubscriptionsView,
  isInModView,
  subplebbitAddress,
  directories,
}: {
  pathname: string;
  isSpecialTheme: boolean;
  isInAllView: boolean;
  isInSubscriptionsView: boolean;
  isInModView: boolean;
  subplebbitAddress: string | undefined;
  directories: { address: string; nsfw?: boolean }[];
}): boolean => {
  if (pathname === '/' || pathname.startsWith('/rules')) return false;
  if (isSpecialTheme) return false;
  if (isInAllView || isInSubscriptionsView || isInModView) return false;

  if (!subplebbitAddress) return false;

  const entry = directories.find((d) => d.address === subplebbitAddress);
  return !entry?.nsfw;
};
