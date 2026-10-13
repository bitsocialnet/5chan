const THREAD_SCROLL_PREVIEW_SELECTOR = '[data-thread-scroll-preview="true"]';
// The persistent boards bar marks itself while pinned over the top of the page: "fixed" stays in view,
// "auto-hide" slides out while the page scrolls down and back in while it scrolls up.
const PINNED_TOP_BAR_SELECTOR = '[data-pinned-top-bar]';

const getPinnedTopBarOffset = (targetTop: number) => {
  const pinnedTopBar = document.querySelector<HTMLElement>(PINNED_TOP_BAR_SELECTOR);
  if (!pinnedTopBar) return 0;
  const coversTarget = pinnedTopBar.dataset.pinnedTopBar === 'fixed' || targetTop < window.scrollY;
  return coversTarget ? pinnedTopBar.offsetHeight : 0;
};

type ThreadTopNavigationState = {
  scrollThreadContainerCid?: string;
};

export const getThreadTopNavigationState = (cid?: string): ThreadTopNavigationState | undefined =>
  cid
    ? {
        scrollThreadContainerCid: cid,
      }
    : undefined;

export const getRequestedThreadTopCid = (state: unknown) => {
  if (!state || typeof state !== 'object') return undefined;

  const cid = (state as ThreadTopNavigationState).scrollThreadContainerCid;
  return typeof cid === 'string' ? cid : undefined;
};

export const isVisibleScrollTarget = (element: HTMLElement) => {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 0 && rect.height > 0;
};

export const findPreferredScrollTarget = (selector: string, excludedAncestorSelector = THREAD_SCROLL_PREVIEW_SELECTOR) => {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter((element) => !element.closest(excludedAncestorSelector));
  return candidates.find(isVisibleScrollTarget) ?? candidates[0];
};

export const scrollThreadContainerToTop = (cid?: string) => {
  if (!cid) return false;

  const threadContainer = findPreferredScrollTarget(`[data-thread-container-cid="${cid}"]`);
  if (!threadContainer) return false;

  const targetTop = window.scrollY + threadContainer.getBoundingClientRect().top;
  window.scrollTo({
    top: targetTop - getPinnedTopBarOffset(targetTop),
    left: 0,
    behavior: 'auto',
  });

  return true;
};
