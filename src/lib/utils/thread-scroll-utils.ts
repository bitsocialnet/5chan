const THREAD_SCROLL_PREVIEW_SELECTOR = '[data-thread-scroll-preview="true"]';

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

const isVisibleScrollTarget = (element: HTMLElement) => {
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

  const desiredTop = window.scrollY + threadContainer.getBoundingClientRect().top;
  window.scrollTo({
    top: desiredTop,
    left: 0,
    behavior: 'auto',
  });

  return true;
};
